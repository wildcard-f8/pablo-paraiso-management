/* utils.js — Shared helper functions (no circular deps).
   Extracted from app.js so page modules can import utils
   without creating a circular dependency:  app ↔ dashboard.
*/
import { CONFIG } from "./config.js?v=19";

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

/**
 * Safely parses a date string/number/Date into a Date object.
 * Returns null if the value cannot be parsed.
 */
export const parseDateSafe = (val) => {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
};

/**
 * Filters an array of records to those whose dateField falls within [fromISO, toISO].
 * Pass null/undefined for either bound to apply only one side.
 * @param {Object[]} data
 * @param {string} dateField - property name containing a date string
 * @param {string|null} fromISO - start date (YYYY-MM-DD), inclusive
 * @param {string|null} toISO - end date (YYYY-MM-DD), inclusive
 * @return {Object[]}
 */
export const filterByDateRange = (data, dateField, fromISO, toISO) => {
  if (!data || !data.length) return [];
  if (!fromISO && !toISO) return data;
  const from = fromISO ? new Date(fromISO + "T00:00:00") : null;
  const to = toISO ? new Date(toISO + "T23:59:59") : null;
  return data.filter((item) => {
    const d = parseDateSafe(item[dateField]);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
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
  parseDateSafe,
  filterByDateRange,
};

export default utils;
