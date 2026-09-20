/* auth.js - Google Identity Services + API client.

   Handles:
   • Google Sign-In via Google Identity Services (GIS)
   • A fetch() wrapper that normalizes GAS JSON responses
     ({ success, data|error }) regardless of HTTP status.
   • Token-bearing requests forwarded to the backend.

   Usage: auth.init() boots GIS; auth.isAuthed() returns bool;
          auth.api(action, body) => Promise<data>.
*/
import { CONFIG } from "./config.js";

const TOKEN_KEY = "retreat_gis_token";

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
      idToken = response?.access_token || response?.id_token || null;
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
    tokenClient?.requestAccessToken({ prompt: "consent" });
  },

  signOut() {
    idToken = null;
    persistToken(null);
    if (window.google?.accounts?.id) {
      google.accounts.id.disableAutoSelect?.();
    }
    document.dispatchEvent(new CustomEvent("auth:changed", { detail: { authed: false } }));
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

  const headers = { "Content-Type": "application/json" };
  const token = auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const opts = { method, headers };
  if (body !== null && method !== "GET") {
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
    throw new Error(payload.error || `Request failed (action=${action})`);
  }
  return payload.data;
}

/** Convenience API object: get/post/del helpers around fetchGAS. */
export const api = {
  get(action, query) {
    return fetchGAS(action, { method: "GET", query });
  },
  post(action, data) {
    return fetchGAS(action, { method: "POST", body: data });
  },
  del(action, data) {
    return fetchGAS(action, { method: "POST", body: data });
  },
};

export default auth;
