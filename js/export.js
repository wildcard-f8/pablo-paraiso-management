/* export.js - Offline backup and merge via a single CSV file.
   Export: fetches all data, combines into one CSV with an entityType
   column (users open in Excel, filter by entityType, edit, save).
   Import: reads the CSV, splits by entityType, reconstructs JSON,
   sends to backend for merge.

   No ZIP, no JSZip, no multi-file juggling — just one CSV in, one CSV out.
*/
import { api } from "./auth.js?v=41";

const ENTITY_KEYS = ["finances", "customers", "bookings", "supplies", "calendarEvents"];
// Maps backend entity keys to entityType labels used in the CSV
const ENTITY_LABELS = {
  finances: "Finances",
  customers: "Customers",
  bookings: "Bookings",
  supplies: "Supplies",
  calendarEvents: "CalendarEvents",
};
// Maps entityType labels back to internal keys
const LABEL_TO_KEY = Object.fromEntries(
  Object.entries(ENTITY_LABELS).map(([k, v]) => [v.toLowerCase(), k])
);

/**
 * Fetches all data entities from the backend.
 * @return {Promise<Object>} Spreadsheet snapshot
 */
async function fetchSpreadsheetSnapshot() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const end   = new Date(today.getFullYear(), today.getMonth() + 3, 0);

  const [finances, customers, bookings, supplies, calendarEvents] = await Promise.all([
    api.get("getFinances"),
    api.get("getCustomers"),
    api.get("getBookings"),
    api.get("getSupplies"),
    api.get("getCalendarEvents", { start: start.toISOString(), end: end.toISOString() }),
  ]);

  return { finances, customers, bookings, supplies, calendarEvents };
}

/* ── CSV helpers ── */

/**
 * Escapes a value for safe inclusion in a CSV field.
 * - Strings with commas, quotes, or newlines are wrapped in double quotes
 * - Internal double quotes are doubled ("")
 * - null/undefined become empty strings
 */
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Converts an array of objects to a CSV string.
 * Collects all unique keys across all records to handle sparse data.
 * @param {Object[]} data
 * @return {string} CSV content
 */
function toCSV(data) {
  if (!data || !data.length) return "";
  const keys = [];
  const seen = new Set();
  data.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    });
  });
  const lines = [keys.map(csvEscape).join(",")];
  data.forEach((row) => {
    lines.push(keys.map((k) => csvEscape(row[k])).join(","));
  });
  return lines.join("\r\n") + "\r\n";
}

/**
 * Single-pass CSV parser that handles quoted fields, embedded commas,
 * escaped double-quotes, and embedded newlines (multi-line values).
 * Returns an array of objects using the first row as headers.
 * @param {string} csv
 * @return {Object[]}
 */
function parseCSV(csv) {
  const rows = [];
  let curField = "";
  let curRow = [];
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const ch = csv[i];
    if (ch === '"') {
      if (inQuotes && csv[i + 1] === '"') { curField += '"'; i += 2; continue; }
      inQuotes = !inQuotes; i++; continue;
    }
    if (ch === ',' && !inQuotes) { curRow.push(curField); curField = ""; i++; continue; }
    if (ch === '\n' && !inQuotes) { curRow.push(curField); rows.push(curRow); curRow = []; curField = ""; i++; continue; }
    if (ch === '\r' && !inQuotes) {
      curRow.push(curField); rows.push(curRow); curRow = []; curField = "";
      if (csv[i + 1] === '\n') i++;
      i++; continue;
    }
    curField += ch; i++;
  }
  if (curRow.length > 0 || curField.length > 0) {
    curRow.push(curField); rows.push(curRow);
  }
  if (!rows.length) return [];
  const header = rows[0];
  const result = [];
  for (let r = 1; r < rows.length; r++) {
    const row = {};
    header.forEach((h, j) => { row[h] = rows[r][j] !== undefined ? rows[r][j] : ""; });
    result.push(row);
  }
  return result;
}

function downloadCSV(csvText, filename) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Export ── */

/**
 * Downloads all data as a SINGLE CSV file for local backup.
 * Each row has an 'entityType' column (Finances, Customers, Bookings,
 * Supplies, CalendarEvents) so users can filter/sort in Excel.
 * @param {Function} [onProgress] - optional callback(message) for status updates
 * @return {Promise<string>} filename
 */
export async function exportSpreadsheet(onProgress = () => {}) {
  onProgress("Fetching data from server…");
  const snapshot = await fetchSpreadsheetSnapshot();

  // Collect all unique keys across all entities (entityType first)
  const allKeys = ["entityType"];
  const seenKeys = new Set(["entityType"]);
  ENTITY_KEYS.forEach((key) => {
    const records = snapshot[key] || [];
    records.forEach((row) => {
      Object.keys(row).forEach((k) => {
        if (!seenKeys.has(k)) { seenKeys.add(k); allKeys.push(k); }
      });
    });
  });

  // Build CSV rows
  const lines = [allKeys.map(csvEscape).join(",")];
  let totalRecords = 0;

  ENTITY_KEYS.forEach((entityKey) => {
    const records = snapshot[entityKey] || [];
    const label = ENTITY_LABELS[entityKey];
    onProgress(`  ${label}: ${records.length} records`);
    totalRecords += records.length;
    records.forEach((row) => {
      const values = allKeys.map((k) => k === "entityType" ? label : row[k]);
      lines.push(values.map(csvEscape).join(","));
    });
  });

  const csvText = lines.join("\r\n") + "\r\n";
  onProgress(`Total: ${totalRecords} records. Preparing download…`);

  const filename = `pablo-paraiso-backup-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCSV(csvText, filename);
  onProgress(`Saved ${filename} (${totalRecords} records)`);
  return filename;
}

/* ── Import ── */

/**
 * Reads a CSV backup file and merges it with online data.
 *
 * The CSV must have an 'entityType' column with values matching the entity
 * labels: Finances, Customers, Bookings, Supplies, CalendarEvents.
 *
 * Merge strategy: additive + update-only, never delete.
 *   - New local records → inserted online
 *   - Updated local records (newer lastModified) → overwrite online
 *   - Online-only records (new web bookings) → preserved
 *   - Conflicts → flagged, online version kept
 *   - Deletions → never propagated
 *   - Calendar merge → skipped entirely
 *
 * @param {File|File[]} fileOrFiles - CSV backup file(s)
 * @param {Function} [onProgress] - optional callback(message) for status updates
 * @return {Promise<Object>} merge results
 */
export async function importSpreadsheet(fileOrFiles, onProgress = () => {}) {
  onProgress("Reading local backup…");

  // Normalise to array — accept both a single file and multiple files
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  let allRows = [];

  for (const file of files) {
    if (!file.name.endsWith(".csv") && !(file.type && file.type.startsWith("text/"))) {
      throw new Error("Please upload a .csv file.");
    }
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) continue;

    // Verify header has entityType column
    const headers = Object.keys(rows[0]);
    if (headers.indexOf("entityType") === -1) {
      throw new Error(
        `File "${file.name}" does not have an "entityType" column. ` +
        "Please export from Pablo Paraiso Management and upload the same file."
      );
    }

    onProgress(`  ${file.name}: ${rows.length} rows`);
    allRows = allRows.concat(rows);
  }

  // Group rows by entityType
  const grouped = {};
  allRows.forEach((row) => {
    const label = (row.entityType || "").trim();
    const key = LABEL_TO_KEY[label.toLowerCase()];
    if (!key) {
      onProgress(`  ⚠ Unknown entityType "${label}" — skipped`);
      return;
    }
    if (!grouped[key]) grouped[key] = [];
    const record = Object.assign({}, row);
    delete record.entityType;
    grouped[key].push(record);
  });

  // Build payload for backend
  const payload = { data: {} };
  let totalRecords = 0;
  ENTITY_KEYS.forEach((key) => {
    const records = grouped[key] || [];
    payload.data[key] = records;
    totalRecords += records.length;
    onProgress(`  ${ENTITY_LABELS[key]}: ${records.length} records`);
  });

  if (totalRecords === 0) {
    throw new Error("No data found in the selected file(s).");
  }
  onProgress(`Total: ${totalRecords} records. Merging with online data…`);

  const result = await api.post("mergeSpreadsheet", payload);

  const summary = `${result.added} added, ${result.updated} updated, ${result.preserved} preserved`;
  if (result.conflicts && result.conflicts.length > 0) {
    onProgress(summary + `, ${result.conflicts.length} conflict(s) flagged`);
  } else {
    onProgress(summary + " — merge complete");
  }

  return result;
}

export default { exportSpreadsheet, importSpreadsheet };
