/* app.js - Main router, navigation, theme, and shared helpers.
   Imports page modules on demand. Mounts the active page into #pageSlot.
*/
import { CONFIG } from "./config.js";
import { api, auth } from "./auth.js";
import { createDashboard } from "./dashboard.js";
import { createFinances } from "./finances.js";
import { createCustomers } from "./customers.js";
import { createBookings } from "./bookings.js";
import { createCalendar } from "./calendar.js";
import { createSupplies } from "./supplies.js";

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

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
  about: { label: "About", factory: createAbout },
};

const app = {
  init() {
    this.bindShell();
    this.bindAuth();
    this.initTheme();
    this.parseHash();
    window.addEventListener("hashchange", () => this.parseHash());
    window.addEventListener("load", () => {
      isFirstLoad = false;
      /* Only welcome + seed when the user is authenticated */
      if (auth.isAuthed()) {
        this.showToast(`Welcome to ${CONFIG.APP_NAME}`, "info");
        this.maybeSeed();
      }
    });
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
        authErrorActive = false;  // reset debounce flag
        /* Show "verifying..." spinner while we test the token */
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

    /* Backend returned 401 — token invalid/expired: sign out and prompt sign-in */
    document.addEventListener("auth:required", (e) => {
      /* Debounce: only show the first auth:required toast until user re-signs-in */
      if (authErrorActive) return;
      authErrorActive = true;
      auth.signOut();  // clear stale token so the gate shows "Sign in"
      app.showToast(e.detail?.message || "Please sign in to view this page.", "info");
      btn.classList.add("pulse");
      setTimeout(() => btn.classList.remove("pulse"), 6000);
      hideVerifying();
      syncGate();
      /* Clear any dashboard content that may have started rendering */
      $("#pageSlot").innerHTML = "";
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

  parseHash() {
    const hash = window.location.hash.slice(2) || "dashboard"; // drop leading '#/'
    const [name, ...rest] = hash.split("/");
    currentParams = { raw: hash, page: name, args: rest };
    this.navigate(name, rest);
  },

  navigate(pageName, args = []) {
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
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const useLight = saved === "light" || (saved === null && !prefersDark);
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

  /* ── Seeding (first-run demo data) ── */
  maybeSeed() {
    if (!CONFIG.DEMO.seedIfEmpty) return;
    this.checkAndSeedDemo();
  },

  async checkAndSeedDemo() {
    try {
      const [fin, cust, book, sup, prop] = await Promise.all([
        api.get("getFinances"),
        api.get("getCustomers"),
        api.get("getBookings"),
        api.get("getSupplies"),
        api.get("getProperties"),
      ]);
      const counts = [fin, cust, book, sup, prop].map((x) => (Array.isArray(x) ? x.length : 0));
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
      customerId: "C0002", property: "Mountain Cabin", checkIn: "2024-02-10",
      checkOut: "2024-02-14", nights: 4, total: 10000, status: "confirmed", createdAt: "2024-01-15",
    });
    await api.post("addBooking", {
      customerId: "C0003", property: "Lakeside Villa", checkIn: "2024-02-20",
      checkOut: "2024-02-27", nights: 7, total: 28000, status: "confirmed", createdAt: "2024-02-01",
    });
    await api.post("addBooking", {
      customerId: "C0004", property: "Mountain Cabin", checkIn: "2024-03-05",
      checkOut: "2024-03-08", nights: 3, total: 7500, status: "pending", createdAt: "2024-02-20",
    });
    await api.post("addBooking", {
      customerId: "C0005", property: "Lakeside Villa", checkIn: "2024-03-15",
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

/* Shared helpers exported for page modules */
export function utils() {}
utils.$ = $;
utils.$$ = $$;
utils.formatCurrency = (n) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: CONFIG.CURRENCY, maximumFractionDigits: 0 }).format(n || 0);
utils.formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—");
utils.formatDateISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};
utils.uid = () => Math.random().toString(36).slice(2, 9);
utils.capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
utils.statusPill = (status) => {
  const cls = {
    confirmed: "pill pill--confirmed",
    pending: "pill pill--pending",
    cancelled: "pill pill--cancelled",
    paid: "pill pill--paid",
    overdue: "pill pill--overdue",
  }[status] || "pill";
  return `<span class="${cls}">${utils.capitalize(status || "unknown")}</span>`;
};
utils.moneyPill = (type) =>
  `<span class="pill ${type === "income" ? "pill--income" : "pill--expense"}">${utils.capitalize(type)}</span>`;

/* Confirm dialog (native, but themed via string) */
utils.confirm = (msg) => window.confirm(msg);

/* Escape HTML helper to avoid injection in generated tables */
utils.escapeHTML = (str) => {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/* Generic table builder used by CRUD pages */
utils.buildTable = (columns, rows, rowActions, emptyMsg = "No records.") => {
  const t = document.createElement("table");
  t.className = "table";
  t.innerHTML = `
    <thead><tr>${columns.map((c) => `<th>${c}</th>`).join("")}<th class="row-actions-head">Actions</th></tr></thead>
    <tbody></tbody>
  `;
  const tbody = t.querySelector("tbody");
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="${columns.length + 1}" class="empty-msg">${emptyMsg}</td>`;
    tbody.appendChild(tr);
  } else {
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      tr.innerHTML = `${columns.map((c) => `<td>${utils.escapeHTML(row[c] ?? row[c.toLowerCase()] ?? "")}</td>`).join("")}` +
        `<td class="row-actions">${rowActions(row)}</td>`;
      tbody.appendChild(tr);
    });
  }
  return t;
};

export { app, $ };
export default app;

/* Kick off when DOM ready */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => app.init());
} else {
  app.init();
}
