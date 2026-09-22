/* auth.js - Google Identity Services + API client.

   Handles:
   • Google Sign-In via Google Identity Services (GIS)
   • A fetch() wrapper that normalizes GAS JSON responses
     ({ success, data|error }) regardless of HTTP status.
   • Token-bearing requests forwarded to the backend.

   Usage: auth.init() boots GIS; auth.isAuthed() returns bool;
          auth.api(action, body) => Promise<data>.
*/
import { CONFIG } from "./config.js?v=18";

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
      idToken = response?.id_token || response?.access_token || null;
      persistToken(idToken);
      document.dispatchEvent(new CustomEvent("auth:changed", { detail: { authed: !!idToken } }));
    },
    error_callback: (e) => {
      console.error("GIS error:", e);
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
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) idToken = stored;

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
    idToken = null;
    persistToken(null);
    if (window.google?.accounts?.id) {
      google.accounts.id.disableAutoSelect?.();
    }
    document.dispatchEvent(new CustomEvent("auth:changed", { detail: { authed: false } }));
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
 * fetchGAS(action, {method, body, query})
 * Builds a request to the GAS endpoint, forwards the GIS token if present,
 * merges any extra `query` params alongside `action`, and unwraps the
 * {success, data|error} envelope.
 * Resolves with the raw `data` on success.
 * Rejects with an Error(message, {cause}) on failure.
 */
export async function fetchGAS(action, { method = "GET", body = null, query = null } = {}) {
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
   * web-app proxy does not return CORS headers on OPTIONS, which causes the
   * preflight to fail with "Failed to fetch". Simple requests (GET with no
   * custom headers, or POST with Content-Type: text/plain) go straight
   * through and inherit access-control-allow-origin from Google's redirect.
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

  let resp;
  try {
    resp = await fetch(url.toString(), opts);
  } catch (networkErr) {
    throw new Error(`Network error: ${networkErr.message}`, { cause: networkErr });
  }

  const text = await resp.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_e) {
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
    const isDeniedErr = statusCode === 403 || errMsg.includes("not authorized") || errMsg.includes("Access denied");
    /* 401 → backend not authenticated: tell the app to prompt sign-in */
    if (isAuthErr) {
      document.dispatchEvent(new CustomEvent("auth:required", { detail: { message: errMsg } }));
    }
    /* 403 → signed in but not on the allow-list */
    if (isDeniedErr) {
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
   POST/DELETE automatically invalidates the cache.
   5 min strikes a balance between freshness and avoiding cold starts. */
const CACHE_TTL_MS = 300_000;
const cache = new Map(); // key → { data, timestamp }

function cacheKey(action, query) {
  if (!query) return action;
  return action + "?" + Object.entries(query)
    .filter(([_, v]) => v != null && v !== "")
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function invalidateCache(pattern) {
  if (!pattern) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key === pattern || key.startsWith(pattern)) cache.delete(key);
  }
}

export const api = {
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

export default auth;
