/* utils.js — Shared helper functions (no circular deps).
   Extracted from app.js so page modules can import utils
   without creating a circular dependency:  app ↔ dashboard.
*/
import { CONFIG } from "./config.js?v=16";

export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

export const formatCurrency = (n) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: CONFIG.CURRENCY, maximumFractionDigits: 0 }).format(n || 0);

export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—");

export const formatDateISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

export const uid = () => Math.random().toString(36).slice(2, 9);

export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");

export const statusPill = (status) => {
  const cls = {
    confirmed: "pill pill--confirmed",
    pending: "pill pill--pending",
    cancelled: "pill pill--cancelled",
    paid: "pill pill--paid",
    overdue: "pill pill--overdue",
  }[status] || "pill";
  return `<span class="${cls}">${capitalize(status || "unknown")}</span>`;
};

export const moneyPill = (type) =>
  `<span class="pill ${type === "income" ? "pill--income" : "pill--expense"}">${capitalize(type)}</span>`;

export const confirm = (msg) => window.confirm(msg);

export const escapeHTML = (str) => {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/* Generic table builder used by CRUD pages */
export const buildTable = (columns, rows, rowActions, emptyMsg = "No records.") => {
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
      tr.innerHTML = `${columns.map((c) => `<td>${escapeHTML(row[c] ?? row[c.toLowerCase()] ?? "")}</td>`).join("")}` +
        `<td class="row-actions">${rowActions(row)}</td>`;
      tbody.appendChild(tr);
    });
  }
  return t;
};

/* The utils object (for backward-compat with modules that call utils.method) */
export const utils = {
  $,
  $$,
  formatCurrency,
  formatDate,
  formatDateISO,
  uid,
  capitalize,
  statusPill,
  moneyPill,
  confirm,
  escapeHTML,
  buildTable,
};

export default utils;
