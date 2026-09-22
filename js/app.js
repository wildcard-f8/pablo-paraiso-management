/* app.js - Main router, navigation, theme, and shared helpers.
   Imports page modules on demand. Mounts the active page into #pageSlot.
*/
import { CONFIG } from "./config.js?v=23";
import { api, auth } from "./auth.js?v=23";
import { utils, $, $$ } from "./utils.js?v=23";
import { createDashboard } from "./dashboard.js?v=23";
import { createFinances } from "./finances.js?v=23";
import { createCustomers } from "./customers.js?v=23";
import { createBookings } from "./bookings.js?v=23";
import { createCalendar } from "./calendar.js?v=23";
import { createSupplies } from "./supplies.js?v=23";
import { createWebsite } from "./website.js?v=23";
import { exportSpreadsheet, importSpreadsheet } from "./export.js?v=23";


let currentParams = {};
let isFirstLoad = true;
let authErrorActive = false;

/* ── Routing table ── */
const ROUTES = {
  dashboard: { label: "Dashboard", factory: createDashboard },
  bookings: { label: "Bookings", factory: createBookings },
  calendar: { label: "Calendar", factory: createCalendar },
  customers: { label: "Customers", factory: createCustomers },
  finances: { label: "Finances", factory: createFinances },
  supplies: { label: "Supplies", factory: createSupplies },
  website:  { label: "Website",  factory: createWebsite },
  about: { label: "About", factory: createAbout },
};

const app = {
  init() {
    /* Register navigation listeners FIRST — they must survive any
       downstream error so the sidebar / back-button still work. */
    window.addEventListener("hashchange", () => this.parseHash());
    window.addEventListener("refreshData", () => this.refreshCurrentPage());
    window.addEventListener("load", () => {
      isFirstLoad = false;
      /* Only welcome + seed when the user is authenticated */
      if (auth.isAuthed()) {
        this.showToast(`Welcome to ${CONFIG.APP_NAME}`, "info");
        /* On first load, maybeSeed() may run. API responses are cached
           (see auth.js cache), so by the time the dashboard loads its
           own data, all GET calls are served from cache — no redundant
           network round-trips to the GAS backend (which has cold-start
           latency of ~1-2s). */
        this.maybeSeed();
      }
    });
    try {
      this.bindShell();
      this.bindAuth();
      this.initTheme();
      this.initNotifications();
      this.bindIdleTimeout();
      /* When the tab regains focus, silently refresh the token if needed.
         This handles the "left open for hours" scenario: the periodic
         check in auth.js should have refreshed proactively, but this
         is a second line of defence. */
      window.addEventListener("focus", () => {
        if (auth.isAuthed()) {
          /* On tab focus, silently refresh token if needed. If the token
             was refreshed, auth:changed fires and dispatches refreshData
             to re-fetch the current page's data. No manual API call needed
             here — the event chain handles it. */
          auth.checkAndRefreshToken().catch(() => {
            /* Silent refresh failed — the next API call will get 401
               and trigger auth:required (graceful overlay). */
          });
        }
      });
      this.parseHash();  // render initial route
    } catch (err) {
      console.error("App init error:", err);
      this.showToast("Something went wrong. Please refresh the page.", "error");
    }
  },

  bindShell() {
    $("#menuBtn").addEventListener("click", () => {
      const expanded = $("#menuBtn").getAttribute("aria-expanded") === "true";
      $("#menuBtn").setAttribute("aria-expanded", !expanded);
      $("#sidebar").classList.toggle("open");
    });
    $("#modalClose").addEventListener("click", () => app.closeModal());
    $("#modalCancel").addEventListener("click", () => app.closeModal());
    $("#modalOverlay").addEventListener("click", (e) => {
      if (e.target === $("#modalOverlay")) app.closeModal();
    });
    $("#themeToggle").addEventListener("click", () => app.toggleTheme());

    /* Export button — saves a single CSV file with all backend data */
    const exportBtn = $("#exportBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        app.exportData();
      });
    }

    /* Import (merge) button — uploads a local CSV backup to merge with online data */
    const importBtn = $("#importBtn");
    if (importBtn) {
      importBtn.addEventListener("click", () => {
        app.importData();
      });
    }
  },

  /* ── Page loading overlay ── */
  showPageLoader(message = "Loading…") {
    const slot = $("#pageSlot");
    if (!slot) return;
    /* Only show if not already loading */
    if (slot.querySelector(".page-loader")) return;
    const loader = document.createElement("div");
    loader.className = "page-loader";
    loader.innerHTML = `<div class="page-loader__content"><span class="spinner"></span><span class="page-loader__text">${message}</span></div>`;
    slot.appendChild(loader);
  },
  hidePageLoader() {
    const el = $("#pageSlot .page-loader");
    if (el) el.remove();
  },

  /* -- Auth (Google Identity Services) -- */
  bindAuth() {
    auth.init();
    const btn = $("#authBtn");
    const gate = $("#authGate");
    const gateBtn = $("#authGateBtn");
    const denied = $("#authDenied");
    const verifying = $("#authVerifying");

    /* Show / hide the "verifying" spinner on the gate */
    const showVerifying = () => {
      verifying.style.display = "flex";
      gateBtn.style.display = "none";
      denied.style.display = "none";
    };
    const hideVerifying = () => {
      verifying.style.display = "none";
      gateBtn.style.display = "";
      denied.style.display = "none";
    };

    /* Sync gate visibility based on stored token */
    const syncGate = () => {
      const authed = auth.isAuthed();
      gate.classList.toggle("app-authed", authed);
      btn.classList.toggle("signed-in", authed);
      // After the fade-out transition, remove pointer-events
      if (authed) {
        setTimeout(() => gate.classList.add("auth-gate__hidden"), 300);
      } else {
        gate.classList.remove("auth-gate__hidden");
        denied.style.display = "none";
      }
    };
    syncGate();

    btn.addEventListener("click", () => {
      if (auth.isAuthed()) { auth.signOut(); }
      else { auth.signIn(); }
    });
    gateBtn.addEventListener("click", () => {
      if (auth.isAuthed()) { auth.signOut(); }
      else { auth.signIn(); }
    });

    /*
     * Called after GIS sign-in. Instead of immediately navigating to the
     * dashboard, we verify the token against the backend. Only if the
     * backend says the user is authorized do we hide the gate and render
     * the dashboard. If unauthorized (403), the auth:denied handler
     * shows the "access denied" message on the gate — the dashboard never
     * renders. If the token is invalid (401), auth:required shows the
     * sign-in screen again.
     */
    document.addEventListener("auth:changed", (e) => {
      const authed = e.detail && e.detail.authed;
      btn.classList.toggle("signed-in", authed);
      if (authed) {
        const wasAuthed = gate.classList.contains("app-authed");
        authErrorActive = false;  // reset debounce flag
        if (wasAuthed) {
          /* Token was silently refreshed — user is already viewing the app.
             Just refresh the current page's data instead of rebuilding
             the whole view (which causes disruptive loading spinners). */
          window.dispatchEvent(new CustomEvent("refreshData"));
          return;
        }
        /* First-time sign-in (or token restore on page load): show
           "verifying…" spinner while we test the token against backend. */
        gate.classList.remove("auth-gate__hidden");
        gate.classList.remove("app-authed");
        showVerifying();

        /* Probe the backend — a successful call proves the token is
         * valid AND the user is on the allow-list. */
        api.get("getCustomers")
          .then(() => {
            /* Token is valid and user is authorized — reveal the app */
            hideVerifying();
            syncGate();
            /* Preload all entity data in parallel to warm the 60s cache.
             * This eliminates cold-start latency when the user navigates
             * to any page. Silently fail — individual pages will retry
             * on their own with their own loading states. */
            Promise.all([
              api.get("getFinances"),
              api.get("getBookings"),
              api.get("getCustomers"),
              api.get("getSupplies"),
            ]).catch(() => {});
            /* Fetch website content to apply dynamic logo */
            api.get("getWebsiteContent").then((data) => {
              if (data && data.logo) {
                const logoIcons = document.querySelectorAll(".logo__icon");
                logoIcons.forEach((img) => {
                  if (img.src.includes("logo_transparent") || img.src.includes("house")) {
                    img.src = data.logo + (data.logo.includes("?") ? "&v=" : "?v=") + Date.now();
                  }
                });
              }
            }).catch(() => {});
            /* Navigate to dashboard (or whatever hash was set) */
            app.navigate(currentParams.page || "dashboard", currentParams.args);
          })
          .catch((err) => {
            /* The auth:required / auth:denied handlers (below) have already
             * run by now via the fetchGAS throw — they reset the gate to
             * the sign-in or denied screen. Here we just make sure the
             * verifying spinner is cleaned up. */
            hideVerifying();
          });
      } else {
        hideVerifying();
        syncGate();
      }
    });

    /* Backend returned 401 — token invalid/expired: sign out and show
       a graceful "session expired" overlay so the user can re-sign in
       without a full page reload, and without losing their page context. */
    document.addEventListener("auth:required", (e) => {
      /* Debounce: only handle the first auth:required until user re-signs-in */
      if (authErrorActive) return;
      authErrorActive = true;
      auth.signOut();  // clear stale token so the gate shows "Sign in"
      btn.classList.add("pulse");
      setTimeout(() => btn.classList.remove("pulse"), 6000);
      hideVerifying();
      syncGate();
      /* Show a "session expired" overlay in the page slot instead of
         blanking it entirely — preserves page context for when the
         user re-authenticates. */
      const slot = $("#pageSlot");
      if (slot) {
        slot.innerHTML = `
          <div class="session-expired">
            <div class="session-expired__content">
              <h3>Session Expired</h3>
              <p>Your session has expired for security reasons.</p>
              <button class="btn btn--primary" id="reSignInBtn">
                <span>Sign In Again</span>
              </button>
            </div>
          </div>
        `;
        $("#reSignInBtn")?.addEventListener("click", () => {
          authErrorActive = false;
          auth.signIn();
        });
      }
    });

    /* Backend returned 403 — valid token but not on allow-list: sign out, show denied */
    document.addEventListener("auth:denied", (e) => {
      auth.signOut();  // clear token so gate shows "Sign in" button, not "Sign out"
      app.showToast(e.detail?.message || "Access denied.", "error");
      hideVerifying();
      denied.style.display = "block";
      gate.classList.remove("app-authed");
      gate.classList.remove("auth-gate__hidden");
      btn.classList.add("pulse");
      setTimeout(() => btn.classList.remove("pulse"), 6000);
      /* Clear any dashboard content that may have started rendering */
      $("#pageSlot").innerHTML = "";
    });
  },

  /* ── Idle timeout (auto sign-out) ── */
  bindIdleTimeout() {
    /* Auto-sign-out after 30 minutes of inactivity — the property
       data is sensitive and tabs are often left open on shared desks. */
    const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
    let idleTimer = null;
    const events = ["mousemove", "mousedown", "keypress", "touchstart", "scroll"];

    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      /* Only set a new timer if the user is currently authenticated */
      if (auth.isAuthed()) {
        idleTimer = setTimeout(() => {
          this.showToast("Signing out due to inactivity…", "info", 3000);
          auth.signOut();
        }, IDLE_TIMEOUT_MS);
      }
    };

    /* Track the last activity so we don't reset the timer during
       silent refreshes that dispatch auth:changed. */
    events.forEach((evt) => {
      document.addEventListener(evt, resetIdle, { passive: true });
    });

    /* Start the timer on init; reset whenever auth state changes so
       the clock starts fresh after sign-in and stops after sign-out. */
    resetIdle();
    document.addEventListener("auth:changed", () => resetIdle());

    /* When navigating between pages, reset the timer too (user is active) */
    window.addEventListener("hashchange", () => resetIdle());
  },

  parseHash() {
    const hash = window.location.hash.slice(2) || "dashboard"; // drop leading '#/'
    const [name, ...rest] = hash.split("/");
    currentParams = { raw: hash, page: name, args: rest };
    this.navigate(name, rest);
  },

  navigate(pageName, args = []) {
    try {
      if (!ROUTES[pageName]) {
        this.navigate("dashboard");
        return;
      }
      // close sidebar on mobile after nav
      $("#sidebar").classList.remove("open");
      $("#menuBtn").setAttribute("aria-expanded", "false");

      this.updateNav(pageName);
      this.setTitle(ROUTES[pageName].label);

      const slot = $("#pageSlot");
      // Tear down previous view.
      if (slot._unmount) {
        slot._unmount();
        slot._unmount = null;
      }
      slot.innerHTML = "";

      // Factory returns the root DOM element (and may attach a _unmount fn).
      const view = ROUTES[pageName].factory(args, this);
      if (view && view.nodeType === 1) {
        if (typeof view._unmount === "function") slot._unmount = view._unmount;
        slot.appendChild(view);
      }
      // scroll top on navigate
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(`Navigate error (${pageName}):`, err);
      this.showToast(`Page error: ${err.message}`, "error");
    }
  },

  refreshCurrentPage() {
    const page = currentParams.page;
    if (page === "dashboard" && typeof window.refreshDashboard === "function") {
      window.refreshDashboard();
    } else if (page === "finances" && typeof window.refreshFinances === "function") {
      window.refreshFinances();
    } else if (page === "bookings" && typeof window.refreshBookings === "function") {
      window.refreshBookings();
    } else if (page === "customers" && typeof window.refreshCustomers === "function") {
      window.refreshCustomers();
    } else if (page === "supplies" && typeof window.refreshSupplies === "function") {
      window.refreshSupplies();
    } else if (page === "website" && typeof window.refreshWebsite === "function") {
      window.refreshWebsite();
    }
  },

  updateNav(activePage) {
    $$("a[data-page]").forEach((link) => {
      const page = link.dataset.page;
      link.classList.toggle("active", page === activePage);
      link.setAttribute("aria-current", page === activePage ? "page" : "false");
    });
  },

  setTitle(title) {
    document.title = `${title} — ${CONFIG.APP_NAME}`;
  },

  /* ── Theme ── */
  initTheme() {
    const saved = localStorage.getItem("theme");
    /* Default to light mode (matches Pablo Paraiso website). */
    const useLight = saved !== "dark";
    document.documentElement.classList.toggle("theme-light", useLight);
    this.syncThemeToggle();
  },

  syncThemeToggle() {
    const isLight = document.documentElement.classList.contains("theme-light");
    $("#themeToggle").classList.toggle("active", isLight);
  },

  toggleTheme() {
    document.documentElement.classList.toggle("theme-light");
    const isLight = document.documentElement.classList.contains("theme-light");
    localStorage.setItem("theme", isLight ? "light" : "dark");
    this.syncThemeToggle();
    document.dispatchEvent(new CustomEvent("themechange", { detail: { isLight } }));
  },

  /* ── Offline export ── */
  async exportData() {
    const btn = $("#exportBtn");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Exporting…"; }
    try {
      const filename = await exportSpreadsheet((msg) => {
        this.showToast(msg, "info", 5000);
      });
    } catch (err) {
      this.showToast("Export failed: " + (err.message || "Unknown error"), "error", 5000);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "💾 Export CSV"; }
    }
  },

  /* ── Offline import / merge ── */
  async importData() {
    const btn = $("#importBtn");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Importing…"; }

    /* Create a hidden file input on demand — accept CSV files */
    let fileInput = $("#importFileInput");
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.id = "importFileInput";
      fileInput.accept = ".csv,text/csv,text/plain";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);
    }

    const files = await new Promise((resolve) => {
      fileInput.onchange = () => resolve(Array.from(fileInput.files));
      fileInput.click();
    });

    if (!files || files.length === 0) {
      if (btn) { btn.disabled = false; btn.textContent = "⬆ Import CSV"; }
      return;
    }

    try {
      const result = await importSpreadsheet(files, (msg) => {
        this.showToast(msg, "info", 5000);
      });

      let summary = `Merged: ${result.added} added, ${result.updated} updated, ${result.preserved} preserved.`;
      if (result.conflicts.length > 0 || result.errors.length > 0) {
        summary += ` ${result.conflicts.length} conflict(s), ${result.errors.length} error(s).`;
      }
      this.showToast(summary, "info", 8000);

      /* If there were conflicts, show details */
      if (result.conflicts.length > 0) {
        setTimeout(() => {
          const detail = result.conflicts.map(c =>
            `${c.table} ${c.id}: local "${c.localModified}" vs online "${c.onlineModified}"`
          ).join("\n");
          this.showToast("Conflicts (online version kept): " + detail, "info", 10000);
        }, 1000);
      }

      /* Refresh current view data */
      const event = new CustomEvent("refreshData");
      window.dispatchEvent(event);
    } catch (err) {
      this.showToast("Import failed: " + (err.message || "Unknown error"), "error", 5000);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "⬆ Import CSV"; }
      fileInput.value = "";
    }
  },

  /* ── Modal API ── */
  openModal({ title, fields, submitLabel = "Save", onSubmit, size = "normal" }) {
    $("#modalTitle").textContent = title;
    $("#modalSubmit").textContent = submitLabel;
    $("#modalBody").innerHTML = "";

    const rowClass = size === "fullscreen" ? "" : "";
    fields.forEach((f) => {
      const wrap = document.createElement("div");
      wrap.className = `field ${rowClass}`;
      const label = document.createElement("label");
      label.textContent = f.label;
      label.htmlFor = f.name;
      const el = this.renderField(f);
      wrap.appendChild(label);
      wrap.appendChild(el);
      if (f.hint) {
        const hint = document.createElement("span");
        hint.className = "hint";
        hint.textContent = f.hint;
        wrap.appendChild(hint);
      }
      $("#modalBody").appendChild(wrap);
    });

    $("#modalOverlay").classList.add("show");
    $("#modalOverlay").removeAttribute("aria-hidden");
    $("#modalSubmit").focus();

    $("#modalForm").onsubmit = (e) => {
      e.preventDefault();
      const data = this.serializeForm();
      onSubmit(data);
    };
    $("#modalForm").classList.toggle("form--wide", size === "fullscreen");
  },

  renderField(f) {
    let el;
    if (f.type === "select") {
      el = document.createElement("select");
      el.name = f.name;
      el.id = f.name;
      (f.options || []).forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === f.default) o.selected = true;
        el.appendChild(o);
      });
    } else if (f.tag === "textarea" || f.type === "textarea") {
      el = document.createElement("textarea");
      el.name = f.name;
      el.id = f.name;
      if (f.default !== undefined && f.default !== null) el.value = f.default;
    } else {
      el = document.createElement(f.tag || "input");
      el.type = f.type || "text";
      el.name = f.name;
      el.id = f.name;
      if (f.default !== undefined && f.default !== null) {
        if (f.type === "checkbox") el.checked = !!f.default;
        else el.value = f.default;
      }
      if (f.required) el.required = true;
      if (el.type === "number") el.step = "0.01";
    }
    return el;
  },

  serializeForm() {
    const form = $("#modalForm");
    const data = {};
    new FormData(form).forEach((val, key) => {
      const input = form.elements[key];
      if (input && input.type === "number") {
        data[key] = val === "" ? "" : Number(val);
      } else if (input && input.type === "checkbox") {
        data[key] = input.checked;
      } else {
        data[key] = val;
      }
    });
    return data;
  },

  closeModal() {
    $("#modalOverlay").classList.remove("show");
    $("#modalOverlay").setAttribute("aria-hidden", "true");
    $("#modalForm").onsubmit = null;
  },

  /* ── Toast ── */
  showToast(message, type = "info", duration = 3200) {
    /* Store in notification history */
    const notif = { id: Date.now(), message, type, timestamp: new Date().toISOString() };
    this._notifications = this._notifications || [];
    this._notifications.unshift(notif);
    /* Keep last 50 */
    if (this._notifications.length > 50) this._notifications = this._notifications.slice(0, 50);
    /* Persist to localStorage */
    try { localStorage.setItem("paraiso_notifications", JSON.stringify(this._notifications)); } catch { /* ignore */ }
    /* Update badge */
    const badge = $("#notificationBadge");
    if (badge) {
      badge.textContent = String(this._notifications.length);
      badge.style.display = "inline-flex";
    }

    const container = $("#toastContainer");
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast__msg">${message}</span><button class="toast__close" aria-label="Close">&times;</button>`;
    t.querySelector(".toast__close").addEventListener("click", () => {
      t.classList.remove("show");
      t.addEventListener("transitionend", () => t.remove(), { once: true });
    });
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      t.addEventListener("transitionend", () => t.remove(), { once: true });
    }, duration);
  },

/* ── Notification history ── */
    initNotifications() {
    /* Load persisted notifications */
    try {
    const saved = localStorage.getItem("paraiso_notifications");
    this._notifications = saved ? JSON.parse(saved) : [];
    } catch {
    this._notifications = [];
    }
    this._renderNotifications();

    /* Bell click → toggle dropdown */
    const bell = $("#notificationBell");
    const dropdown = $("#notificationDropdown");
    if (bell) {
    bell.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleDropdown();
    });
    }
    /* Close dropdown when clicking outside */
    document.addEventListener("click", (e) => {
    if (dropdown && !dropdown.contains(e.target) && dropdown.style.display !== "none") {
      dropdown.style.display = "none";
    }
    });
    /* "Clear all" button */
    const clearBtn = $("#notificationClear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => this.clearNotifications());
    }
  },

    _toggleDropdown() {
    const dropdown = $("#notificationDropdown");
    const bell = $("#notificationBell");
    if (!dropdown) return;
    if (dropdown.style.display === "none" || dropdown.style.display === "") {
    dropdown.style.display = "block";
    this._renderNotifications();
    /* Mark as read: clear badge */
    const badge = $("#notificationBadge");
    if (badge) badge.style.display = "none";
    } else {
    dropdown.style.display = "none";
    }
    },

    _renderNotifications() {
    const list = $("#notificationList");
    const badge = $("#notificationBadge");
    if (!list) return;
    const notifs = this._notifications || [];
    if (notifs.length === 0) {
    list.innerHTML = '<div class="notification-list__empty">No notifications yet.</div>';
    if (badge) badge.style.display = "none";
    return;
    }
    list.innerHTML = "";
    notifs.forEach((n) => {
    const item = document.createElement("div");
    item.className = `notification-item notification-item--${n.type || "info"}`;
    const time = new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    item.innerHTML = `<span class="notification-item__msg">${n.message}</span><span class="notification-item__time">${time}</span>`;
    list.appendChild(item);
    });
    if (badge) {
    badge.textContent = String(notifs.length);
    badge.style.display = "inline-flex";
    }
    },

    clearNotifications() {
    this._notifications = [];
    try { localStorage.removeItem("paraiso_notifications"); } catch { /* ignore */ }
    const list = $("#notificationList");
    if (list) list.innerHTML = '<div class="notification-list__empty">No notifications yet.</div>';
    const badge = $("#notificationBadge");
    if (badge) badge.style.display = "none";
    },

    /* ── Seeding (first-run demo data) ── */
  maybeSeed() {
    if (!CONFIG.DEMO.seedIfEmpty) return;
    this.checkAndSeedDemo();
  },

  async checkAndSeedDemo() {
    try {
      const [fin, cust, book, sup] = await Promise.all([
        api.get("getFinances"),
        api.get("getCustomers"),
        api.get("getBookings"),
        api.get("getSupplies"),
      ]);
      const counts = [fin, cust, book, sup].map((x) => (Array.isArray(x) ? x.length : 0));
      if (counts.every((c) => c === 0)) {
        await this.seedDemoData();
        this.showToast("Demo data seeded for first-run experience.", "info", 5000);
      }
    } catch (e) {
    /* Backend not reachable or not authorized; stay silent in UI but log. */
      console.warn("Seeding check skipped:", e.message);
    }
  },

  async seedDemoData() {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const isoDate = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    // Customers
    await api.post("addCustomer", {
      name: "Maria Santos", email: "maria@example.com", phone: "+639123456789",
      address: "Mandaluyong City", notes: "Repeat guest",
    });
    await api.post("addCustomer", {
      name: "Carlos Reyes", email: "carlos@example.com", phone: "+639876543210",
      address: "Makati City", notes: "",
    });

    // Finances — income
    await api.post("addFinance", {
      date: "2024-02-03", type: "income", category: "Booking",
      description: "Payment for B0002", amount: 25000, bookingId: "B0002",
    });
    await api.post("addFinance", {
      date: "2024-02-15", type: "income", category: "Booking",
      description: "Payment for B0003", amount: 30000, bookingId: "B0003",
    });
    await api.post("addFinance", {
      date: "2024-03-01", type: "income", category: "Booking",
      description: "Payment for B0004", amount: 20000, bookingId: "B0004",
    });
    await api.post("addFinance", {
      date: "2024-03-12", type: "income", category: "Booking",
      description: "Payment for B0005", amount: 35000, bookingId: "B0005",
    });

    // Finances — expenses
    await api.post("addFinance", {
      date: "2024-02-10", type: "expense", category: "Cleaning",
      description: "Weekly cleaning service", amount: 1500, bookingId: "",
    });
    await api.post("addFinance", {
      date: "2024-02-20", type: "expense", category: "Utilities",
      description: "Electricity and water", amount: 3500, bookingId: "",
    });
    await api.post("addFinance", {
      date: "2024-03-05", type: "expense", category: "Maintenance",
      description: "Pool repair", amount: 5000, bookingId: "",
    });
    await api.post("addFinance", {
      date: "2024-03-18", type: "expense", category: "Supplies",
      description: "Toiletries restock", amount: 2500, bookingId: "",
    });

    // Bookings
    await api.post("addBooking", {
      customerId: "C0002", property: "Pablo Paraiso Pool House", checkIn: "2024-02-10",
      checkOut: "2024-02-14", nights: 4, total: 10000, status: "confirmed", createdAt: "2024-01-15",
    });
    await api.post("addBooking", {
      customerId: "C0003", property: "Pablo Paraiso Pool House", checkIn: "2024-02-20",
      checkOut: "2024-02-27", nights: 7, total: 28000, status: "confirmed", createdAt: "2024-02-01",
    });
    await api.post("addBooking", {
      customerId: "C0004", property: "Pablo Paraiso Pool House", checkIn: "2024-03-05",
      checkOut: "2024-03-08", nights: 3, total: 7500, status: "pending", createdAt: "2024-02-20",
    });
    await api.post("addBooking", {
      customerId: "C0005", property: "Pablo Paraiso Pool House", checkIn: "2024-03-15",
      checkOut: "2024-03-22", nights: 7, total: 35000, status: "confirmed", createdAt: "2024-03-01",
    });

    // Supplies
    await api.post("addSupply", {
      name: "Shampoo", category: "Bathroom", quantity: 5, unit: "bottles",
      unitCost: 300, lastOrdered: "2024-02-01", supplier: "CleanCo", minStock: 8,
    });
    await api.post("addSupply", {
      name: "Coffee Beans", category: "Kitchen", quantity: 2, unit: "kg",
      unitCost: 800, lastOrdered: "2024-02-15", supplier: "Roastery", minStock: 3,
    });
    await api.post("addSupply", {
      name: "Bed Sheets", category: "Linens", quantity: 12, unit: "sets",
      unitCost: 1200, lastOrdered: "2024-01-20", supplier: "ABC Supplier", minStock: 6,
    });
  },
};

function createAbout() {
  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = `
    <h1>About Pablo Paraiso Management</h1>
    <p>A zero-cost property rental management app for retreat hosts. Frontend
       lives on GitHub Pages; backend is a Google Apps Script web app backed by
       Google Sheets and Google Calendar.</p>
    <h3>Tech stack</h3>
    <ul>
      <li><strong>Frontend</strong>: Vanilla HTML / CSS / ES modules — no bundlers.</li>
      <li><strong>Auth</strong>: Google Identity Services (GIS).</li>
      <li><strong>Charts</strong>: Chart.js v4 (CDN).</li>
      <li><strong>Calendar</strong>: FullCalendar v6 (CDN).</li>
      <li><strong>Backend</strong>: Google Apps Script (GAS) REST API.</li>
      <li><strong>Data</strong>: Google Sheets + Google Calendar.</li>
    </ul>
    <h3>Endpoints</h3>
    <p class="muted">See SPEC.md and <code>js/config.js</code> (API_BASE_URL + GOOGLE_CLIENT_ID).</p>
    <footer class="page-footer">Built for retreat hosts. Zero infrastructure cost.</footer>
  `;
  return el;
}

/* Shared helpers re-exported for backward compat with modules that
   import utils from app.js. New code should import from ./utils.js directly. */
export { utils, $, $$ } from "./utils.js?v=23";

/* Export app and default */
export { app };
export default app;

/* Kick off when DOM ready */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => app.init());
} else {
  app.init();
}
