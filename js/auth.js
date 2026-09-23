/* auth.js - Google Identity Services + API client.

   Handles:
   • Google Sign-In via Google Identity Services (GIS)
   • A fetch() wrapper that normalizes GAS JSON responses
     ({ success, data|error }) regardless of HTTP status.
   • Token-bearing requests forwarded to the backend.

   Usage: auth.init() boots GIS; auth.isAuthed() returns bool;
          auth.api(action, body) => Promise<data>.
*/
import { CONFIG } from "./config.js?v=42";

const TOKEN_KEY = "paraiso_gis_token";

let tokenClient = null;
let gisInitialized = false;
let idToken = null;

/* ----------------------- GIS bootstrap ----------------------- */
function loadGisScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS script load failed"));
    document.head.appendChild(s);
  });
}

function initGis() {
  if (gisInitialized) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: "openid email profile",
    callback: (response) => {
      /* Debug: log what GIS returns — id_token vs access_token */
      console.log('GIS callback received. id_token present:', !!response?.id_token,
        'access_token present:', !!response?.access_token,
        'all keys:', Object.keys(response));
      idToken = response?.id_token || response?.access_token || null;
      console.log('Stored token type:', idToken && idToken.split('.').length === 3 ? 'JWT (id_token)' : idToken ? 'opaque (access_token)' : 'null');
      persistToken(idToken);
      document.dispatchEvent(new CustomEvent("auth:changed", { detail: { authed: !!idToken } }));
      if (idToken) {
        logActivity("login", "success", "GIS sign-in completed", { hasIdToken: !!response?.id_token, hasAccess: !!response?.access_token });
      } else {
        logActivity("login", "failed", "GIS returned no token", { responseKeys: Object.keys(response || {}) });
      }
    },
    error_callback: (e) => {
      console.error("GIS error:", e);
      logActivity("login", "failed", "GIS error", { error: String(e) });
      document.dispatchEvent(new CustomEvent("auth:changed", { detail: { authed: false, error: e } }));
    },
  });
  gisInitialized = true;
}

/* ─── Token expiry + auto-refresh ─── */
/* GIS tokens (ID tokens) expire after ~1 hour. We decode the JWT's
   exp field and silently refresh before expiry, so tabs left open
   for hours don't lose their session. */

/** Decodes the payload of a JWT (without verification) to read claims. */
function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/** Returns true if the token expires within `bufferMin` minutes or can't be decoded. */
function isTokenExpiringSoon(token, bufferMin = 5) {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true;
  const expMs = payload.exp * 1000;
  return Date.now() >= expMs - bufferMin * 60_000;
}

export const auth = {
  isAuthed() {
    return !!idToken;
  },

  getToken() {
    return idToken || localStorage.getItem(TOKEN_KEY) || null;
  },

  init() {
    /* Protected API responses must never survive an auth transition. */
    api.clearCache();
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      /* Check if stored token is expired — if so, clear it so the user
         sees the sign-in screen instead of a confusing auth error. */
      if (stored.split(".").length === 3) {
        /* It's a JWT — check expiry */
        if (isTokenExpiringSoon(stored, 0)) {
          console.log("auth: stored token is expired, clearing");
          persistToken(null);
        }
      }
      /* If stored is not a JWT (opaque access token), keep it —
         we can't check expiry without calling the backend */
      if (localStorage.getItem(TOKEN_KEY)) idToken = stored;
    }

    loadGisScript()
      .then(() => {
        initGis();
        /* Periodic token refresh check — every 5 minutes, if the token
           is expiring soon, silently get a new one. This keeps tabs open
           for hours from losing their session. */
        if (typeof window !== "undefined") {
          setInterval(() => {
            if (idToken && isTokenExpiringSoon(idToken)) {
              tokenClient?.requestAccessToken({ prompt: "" });
            }
          }, 5 * 60 * 1000);
        }
        if (idToken) {
          document.dispatchEvent(new CustomEvent("auth:changed", { detail: { authed: true } }));
        }
      })
      .catch((err) => {
        console.error(err);
        document.dispatchEvent(new CustomEvent("auth:changed", { detail: { authed: false, error: err.message } }));
      });
  },

  signIn() {
    if (!tokenClient) {
      initGis();
    }
    tokenClient?.requestAccessToken({ prompt: "login" });
  },

  signOut() {
    const wasAuthed = !!idToken;
    idToken = null;
    persistToken(null);
    if (window.google?.accounts?.id) {
      google.accounts.id.disableAutoSelect?.();
    }
    document.dispatchEvent(new CustomEvent("auth:changed", { detail: { authed: false } }));
    if (wasAuthed) logActivity("logout", "success", "User signed out");
  },

  /**
   * If the current token is expiring within the next 5 minutes, silently
   * request a new token via GIS (prompt: "" = no UI). Resolves with the
   * (possibly refreshed) token. Rejects only if refresh fails.
   */
  async checkAndRefreshToken() {
    const current = idToken || localStorage.getItem(TOKEN_KEY);
    if (!current) return null;
    if (!isTokenExpiringSoon(current)) return current; // still valid

    if (!tokenClient) { if (!gisInitialized) initGis(); }
    if (!tokenClient) throw new Error("Token client not available");

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Token refresh timed out"));
      }, 8000);

      const handler = (e) => {
        cleanup();
        if (e.detail && e.detail.authed && idToken) {
          resolve(idToken);
        } else {
          reject(new Error("Token refresh failed"));
        }
      };
      const cleanup = () => { clearTimeout(timeout); document.removeEventListener("auth:changed", handler); };

      document.addEventListener("auth:changed", handler);
      tokenClient.requestAccessToken({ prompt: "" }); // silent refresh
    });
  },
};

function persistToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/* ----------------------- API wrapper ----------------------- */

/**
 * XMLHttpRequest fallback for fetchGAS.
 * Used when fetch() fails with "Failed to fetch" on GAS's cross-origin
 * redirect chain (script.google.com → script.googleusercontent.com).
 * XHR handles this redirect more reliably in some browsers.
 */
function _fetchGAS_XHR(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.timeout = 15000;
    xhr.onload = () => {
      /* XHR with CORS returns status 200 on success.
         For cross-origin requests, status might be 0 if the redirect
         chain succeeds but the CORS check fails on an intermediate response.
         In that case, we still try to read the response text. */
      if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
        resolve({
          status: 200,
          statusText: "OK",
          text: () => Promise.resolve(xhr.responseText),
        });
      } else if (xhr.status === 0 && !xhr.responseText) {
        /* Network error in XHR */
        reject(new TypeError("Failed to fetch (XHR)"));
      } else {
        /* HTTP error status */
        resolve({
          status: xhr.status,
          statusText: xhr.statusText,
          text: () => Promise.resolve(xhr.responseText),
        });
      }
    };
    xhr.onerror = () => reject(new TypeError("Failed to fetch (XHR)"));
    xhr.ontimeout = () => reject(new Error("XHR timeout"));
    xhr.send();
  });
}

/**
 * fetchGAS(action, {method, body, query})
 * Builds a request to the GAS endpoint, forwards the GIS token if present,
 * merges any extra `query` params alongside `action`, and unwraps the
 * {success, data|error} envelope.
 * Resolves with the raw `data` on success.
 * Rejects with an Error(message, {cause}) on failure.
 */
export async function fetchGAS(action, { method = "GET", body = null, query = null } = {}, _attempt = 0) {
  const RETRY_LIMIT = 2; // 3 total attempts (initial + 2 retries)
  const RETRY_DELAYS = [2000, 4000]; // progressive delays: 2s, 4s

  const url = new URL(CONFIG.API_BASE_URL);
  url.searchParams.set("action", action);
  // Extra query params (e.g. start/end for getCalendarEvents) — set AFTER action
  // so they are not URL-encoded into the action value.
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });
  }

  /*
   * Token is sent as a _token query param (not the Authorization header) so
   * that the request stays a CORS "simple request" (no custom headers) and
   * the browser does NOT send a preflight OPTIONS. Google Apps Script's
   * web-app proxy does not return CORS headers on OPTIONS responses, so
   * preflight-based requests fail with "Failed to fetch". Simple requests
   * (GET with no custom headers, or POST with Content-Type: text/plain) go
   * straight through and inherit access-control-allow-origin from Google's
   * redirect.
   */
  const token = auth.getToken();
  if (token) url.searchParams.set("_token", token);

  // Simple-request headers only — Content-Type: text/plain is a "simple"
  // Content-Type that does not trigger CORS preflight.
  const opts = { method };
  if (body !== null && method !== "GET") {
    opts.headers = { "Content-Type": "text/plain" };
    opts.body = JSON.stringify(body);
  }

  /* AbortController timeout — prevents fetch() hanging indefinitely on
   * GAS cold starts that can take 10+ seconds */
  const _controller = new AbortController();
  const _timeout = setTimeout(() => {
    console.warn('fetchGAS: 15s timeout reached for action=' + action);
    _controller.abort();
  }, 15000);
  opts.signal = _controller.signal;

  /*
   * --- Network error retry ---
   * GAS web app URLs redirect (302) to script.googleusercontent.com. On a
   * cold start, the redirect chain can fail or time out. Retry GET requests.
   * Also: Chrome's fetch() in "cors" mode can fail on the cross-origin
   * redirect chain (script.google.com → script.googleusercontent.com).
   * XMLHttpRequest handles this redirect more reliably in some browsers.
   */
  let resp;
  let _usedXHR = false;
  try {
    if (_attempt === 0) console.log('fetchGAS: ' + method + ' ' + url.toString().substring(0, 200) + (url.toString().length > 200 ? '...' : '') + ' (len=' + url.toString().length + ')');
    resp = await fetch(url.toString(), opts);
    clearTimeout(_timeout);
    if (_attempt === 0) console.log('fetchGAS: response status=' + resp.status + ' for action=' + action);
  } catch (networkErr) {
    clearTimeout(_timeout);
    /* Chrome reports GAS redirect/CORS failures with slightly different
       messages ("Failed to fetch", "Load failed", or "NetworkError").
       Try XHR on every GET attempt, not only attempt 0: the old code used
       XHR once and then reverted to fetch() for the two retries, so a
       persistent redirect failure always ended as a misleading network error. */
    const networkMessage = String(networkErr?.message || networkErr);
    const isLikelyCorsFailure = /failed to fetch|load failed|networkerror|network error/i.test(networkMessage);
    if (method === "GET" && isLikelyCorsFailure) {
      console.warn('fetchGAS: fetch() failed, trying XHR fallback for ' + action + ' (attempt ' + _attempt + ')');
      try {
        resp = await _fetchGAS_XHR(url.toString());
        _usedXHR = true;
        console.log('fetchGAS: XHR fallback succeeded, status=' + resp.status + ' for action=' + action);
      } catch (xhrErr) {
        console.error('fetchGAS: XHR fallback also failed:', xhrErr.message);
        /* Fall through to retry/error handling below */
      }
    }
    /* Retry on network error (excluding auth errors which come as JSON 401) */
    if (!resp && method === "GET" && _attempt < RETRY_LIMIT) {
      if (_attempt === 0) {
        logActivity("network_error", "failed", networkErr.message, { action, method, attempt: _attempt + 1 });
        console.warn('fetchGAS: warming up backend for ' + action + ' (attempt ' + (_attempt + 2) + '/' + (RETRY_LIMIT + 1) + ')');
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[_attempt]));
      return fetchGAS(action, { method, body, query }, _attempt + 1);
    }
    /* If both fetch() and XHR failed and no retry, throw */
    if (!resp) {
      throw new Error('Network error: ' + networkErr.message + ' (url_len=' + url.toString().length + ', method=' + method + ', attempt=' + _attempt + ')', { cause: networkErr });
    }
    /* If XHR fallback succeeded, resp is set — continue to response processing */
  }

  const text = await resp.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_e) {
    /* Non-JSON response — GAS may have returned an anti-bot HTML page,
       a 404 redirect, or a cold-start interstitial. Retry GET requests
       with progressive delays to let the GAS instance warm up. */
    if (method === "GET" && _attempt < RETRY_LIMIT) {
      if (_attempt === 0) {
        logActivity("backend_error", "failed", `Non-JSON response (${resp.status})`, { action, method, attempt: _attempt + 1, textSnippet: text.slice(0, 80) });
        console.warn(`fetchGAS: retrying ${action} after non-JSON (${resp.status}) —`, text.slice(0, 80));
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[_attempt]));
      return fetchGAS(action, { method, body, query }, _attempt + 1);
    }
    throw new Error(`Backend returned non-JSON (${resp.status}): ${text.slice(0, 120)}`);
  }

  if (!payload.success) {
    /* Apps Script ContentService always returns HTTP 200 — the real status
       code is embedded in the JSON body (payload.status). Check both the
       status field AND the error message text, so this works with backends
       that haven't been redeployed to include payload.status. */
    const statusCode = payload.status || resp.status;
    const errMsg = payload.error || "";
    const isAuthErr = statusCode === 401 || errMsg.includes("Authentication required") || errMsg.includes("Invalid token");
      /* 401 → backend not authenticated: tell the app to prompt sign-in */
    if (isAuthErr) {
      logActivity("auth_required", "failed", errMsg, { action, statusCode });
      document.dispatchEvent(new CustomEvent("auth:required", { detail: { message: errMsg } }));
    }
    /* 403 → signed in but not on allow-list */
    if (statusCode === 403 || errMsg.includes("not authorized") || errMsg.includes("Access denied")) {
      logActivity("auth_denied", "failed", errMsg, { action, statusCode });
      document.dispatchEvent(new CustomEvent("auth:denied", { detail: { message: errMsg } }));
    }
    const err = new Error(errMsg || `Request failed (action=${action})`);
    err.status = statusCode;
    throw err;
  }
  return payload.data;
}

/** Convenience API object: get/post/del helpers around fetchGAS. */

/* ─── Response cache ───
   GET responses are cached for 5 min so navigating between pages
   doesn't hit the GAS backend (cold-start ~1-2s) repeatedly.
   The cache lives in BOTH an in-memory Map (fast access) and
   sessionStorage (survives page reloads). When the page is refreshed,
   fresh cached responses are served from sessionStorage immediately,
   avoiding GAS cold-start latency.
   POST/DELETE automatically invalidates the cache. */
const CACHE_TTL_MS = 300_000;
const cache = new Map(); // key → { data, timestamp }
const CACHE_PREFIX = "paraiso_api_";

function cacheKey(action, query) {
  if (!query) return action;
  return action + "?" + Object.entries(query)
    .filter(([_, v]) => v != null && v !== "")
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function cacheGet(key) {
  /* Check in-memory Map first (fast path) */
  const hit = cache.get(key);
  if (hit) {
    if (Date.now() - hit.timestamp <= CACHE_TTL_MS) return hit.data;
    cache.delete(key);
    return null;
  }
  /* Fall back to sessionStorage — survives page reloads */
  try {
    const stored = sessionStorage.getItem(CACHE_PREFIX + key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.timestamp <= CACHE_TTL_MS) {
        cache.set(key, parsed);
        return parsed.data;
      }
      sessionStorage.removeItem(CACHE_PREFIX + key);
    }
  } catch { /* ignore JSON parse errors */ }
  return null;
}

function cacheSet(key, data) {
  const entry = { data, timestamp: Date.now() };
  cache.set(key, entry);
  /* Persist to sessionStorage so the cache survives page reloads */
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch { /* ignore storage quota errors */ }
}

function invalidateCache(pattern) {
  if (!pattern) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key === pattern || key.startsWith(pattern)) cache.delete(key);
  }
  /* Also clear matching sessionStorage entries */
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX + pattern)) {
        sessionStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }
}

export const api = {
  isCached(action, query) {
    const key = cacheKey(action, query);
    /* Check in-memory first; if not there, try sessionStorage */
    return cacheGet(key) !== null;
  },
  clearCache() {
    invalidateCache();
  },
  async get(action, query) {
    const key = cacheKey(action, query);
    const cached = cacheGet(key);
    if (cached) return cached;
    const data = await fetchGAS(action, { method: "GET", query });
    cacheSet(key, data);
    return data;
  },
  async post(action, data) {
    const result = await fetchGAS(action, { method: "POST", body: data });
    /* Invalidate cached GETs for the affected resource */
    const singular = { addCustomer: "getCustomers", updateCustomer: "getCustomers", deleteCustomer: "getCustomers",
      addFinance: "getFinances", updateFinance: "getFinances", deleteFinance: "getFinances",
      addBooking: "getBookings", updateBooking: "getBookings", deleteBooking: "getBookings",
      addSupply: "getSupplies", updateSupply: "getSupplies", deleteSupply: "getSupplies",
      updateWebsiteContent: "getWebsiteContent",
      uploadImage: "getWebsiteContent" };
    if (singular[action]) invalidateCache(singular[action]);
    return result;
  },
  del(action, data) {
    return api.post(action, data);
  },
};

/**
 * logActivity(action, status, details, data)
 * Sends an activity log entry to the backend's public logActivity endpoint.
 * Fire-and-forget: any errors are swallowed so logging never breaks the
 * user flow. Used for sign-in successes/failures, network errors, etc.
 */
function logActivity(action, status, details, data) {
  try {
    const payload = { action, status };
    if (details) payload.details = String(details).slice(0, 500);
    if (data) payload.data = data;
    /* Send via fetchGAS — if it fails, silently ignore */
    fetchGAS("logActivity", { method: "POST", body: payload }).catch(() => {});
  } catch { /* swallow — logging is best-effort */ }
}

export default auth;
