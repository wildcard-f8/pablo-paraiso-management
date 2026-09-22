/* utils.js — Shared helper functions (no circular deps).
   Extracted from app.js so page modules can import utils
   without creating a circular dependency:  app ↔ dashboard.
*/
import { CONFIG } from "./config.js?v=28";

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

/** Returns today's date as YYYY-MM-DD (ISO local). */
export const todayISO = () => formatDateISO(new Date());

/** Returns the date N days ago as YYYY-MM-DD. */
export const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDateISO(d);
};

/**
 * Computes a { from, to } date range (YYYY-MM-DD) from a preset name.
 * "custom" returns { from: customFrom, to: customTo }.
 * Empty/invalid preset returns { from: "", to: "" } (show everything).
 */
export const computeDateRange = (preset, customFrom = "", customTo = "") => {
  switch (preset) {
    case "week":
      return { from: daysAgoISO(7), to: todayISO() };
    case "month":
      return { from: daysAgoISO(30), to: todayISO() };
    case "year":
      return { from: daysAgoISO(365), to: todayISO() };
    case "custom":
    default:
      return { from: customFrom || "", to: customTo || "" };
  }
};

/**
 * Computes occupancy rate (%) from a list of bookings within a date range.
 * Counts booked nights (checkIn..checkOut) that fall within [fromISO, toISO],
 * divided by total available days in that range.
 * @param {Object[]} bookings - each has checkIn, checkOut, status
 * @param {string|null} fromISO - period start (YYYY-MM-DD)
 * @param {string|null} toISO - period end (YYYY-MM-DD)
 * @return {number} occupancy percentage 0–100
 */
export const computeOccupancyRate = (bookings, fromISO, toISO) => {
  if (!bookings || !bookings.length) return 0;
  // When no explicit range is given (All time), derive it from the
  // earliest check-in and latest check-out across all non-cancelled
  // bookings so the percentage reflects the full operational window.
  let actualFrom = fromISO;
  let actualTo = toISO;
  if (!actualFrom) {
    const cinDates = bookings
      .filter((b) => b.status !== "cancelled" && b.checkIn && b.checkOut)
      .map((b) => parseDateSafe(b.checkIn))
      .filter((d) => d && !isNaN(d.getTime()));
    if (cinDates.length) {
      cinDates.sort((a, b) => a - b);
      actualFrom = formatDateISO(cinDates[0]);
    }
  }
  if (!actualFrom) return 0;
  if (!actualTo) {
    const coutDates = bookings
      .filter((b) => b.status !== "cancelled" && b.checkIn && b.checkOut)
      .map((b) => parseDateSafe(b.checkOut))
      .filter((d) => d && !isNaN(d.getTime()));
    if (coutDates.length) {
      coutDates.sort((a, b) => a - b);
      actualTo = formatDateISO(coutDates[coutDates.length - 1]);
    }
  }
  const from = new Date(actualFrom + "T00:00:00");
  const to = actualTo ? new Date(actualTo + "T23:59:59") : new Date(actualFrom + "T23:59:59");
  if (from > to) return 0; /* guard against inverted range producing negatives */
  // Total available days in the period
  const totalDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;
  if (totalDays <= 0) return 0;
  // Count booked nights within the period
  let bookedNights = 0;
  bookings.forEach((b) => {
    if (b.status === "cancelled") return;
    const cin = parseDateSafe(b.checkIn);
    const cout = parseDateSafe(b.checkOut);
    if (!cin || !cout) return;
    // Clamp booking dates to the period boundaries
    const start = cin < from ? from : cin;
    const end = cout > to ? to : cout;
    if (start <= end) {
      bookedNights += Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    }
  });
  /* Return with one decimal place for precision */
  return parseFloat(((bookedNights / totalDays) * 100).toFixed(2));
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
  todayISO,
  daysAgoISO,
  computeDateRange,
  computeOccupancyRate,
};

export default utils;
