/* export.js - Offline backup and merge via CSV files.
   Export: fetches all data, converts each entity to CSV, bundles into a
   single ZIP for download (one CSV per entity — users unzip and open in Excel).
   Import: reads a ZIP, parses CSVs back to JSON, sends to backend for merge.
*/
import { api } from "./auth.js?v=17";

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

  return {
    finances,
    customers,
    bookings,
    supplies,
    calendarEvents,
  };
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

  // Gather all unique keys, preserving first-seen order
  const keys = [];
  const seen = new Set();
  data.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
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
      if (inQuotes && csv[i + 1] === '"') {
        // Escaped double-quote inside a quoted field
        curField += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      curRow.push(curField);
      curField = "";
      i++;
      continue;
    }

    if (ch === '\n' && !inQuotes) {
      curRow.push(curField);
      rows.push(curRow);
      curRow = [];
      curField = "";
      i++;
      continue;
    }

    if (ch === '\r' && !inQuotes) {
      curRow.push(curField);
      rows.push(curRow);
      curRow = [];
      curField = "";
      // Skip a following \n (handles \r\n)
      if (csv[i + 1] === '\n') i++;
      i++;
      continue;
    }

    curField += ch;
    i++;
  }

  // Handle last row (if content doesn't end with a newline)
  if (curRow.length > 0 || curField.length > 0) {
    curRow.push(curField);
    rows.push(curRow);
  }

  if (!rows.length) return [];

  // First row is the header
  const header = rows[0];
  const result = [];
  for (let r = 1; r < rows.length; r++) {
    const row = {};
    header.forEach((h, j) => {
      row[h] = rows[r][j] !== undefined ? rows[r][j] : "";
    });
    result.push(row);
  }
  return result;
}

/**
 * Reads a file as an ArrayBuffer (used for ZIP reading).
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Downloads a ZIP blob as a file.
 */
function downloadZip(blob, filename) {
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
 * Downloads all data as a ZIP of CSV files for local backup.
 * Each entity (finances, customers, bookings, supplies, calendarEvents)
 * becomes its own CSV file inside the ZIP.
 * @param {Function} [onProgress] - optional callback(message) for status updates
 * @return {Promise<string>} filename
 */
export async function exportSpreadsheet(onProgress = () => {}) {
  onProgress("Fetching data from server…");
  const snapshot = await fetchSpreadsheetSnapshot();

  const entityKeys = ["finances", "customers", "bookings", "supplies", "calendarEvents"];
  let totalRecords = 0;
  entityKeys.forEach((k) => {
    const count = (snapshot[k] || []).length;
    totalRecords += count;
    onProgress(`  ${k}: ${count} records`);
  });
  onProgress(`Total: ${totalRecords} records. Creating CSV files…`);

  // Use global JSZip (loaded via CDN script tag in index.html)
  const zip = new JSZip();

  entityKeys.forEach((key) => {
    const data = snapshot[key] || [];
    const csv = toCSV(data);
    zip.file(`${key}.csv`, csv);
  });

  // Add a metadata CSV for informational purposes
  zip.file("README.csv", [
    "key,value",
    `appName,Pablo Paraiso Management`,
    `exportedAt,${new Date().toISOString().slice(0, 10)}`,
    `totalRecords,${totalRecords}`,
    "",
  ].join("\r\n"));

  onProgress("Generating ZIP…");
  const blob = await zip.generateAsync({ type: "blob" });
  const filename = `pablo-paraiso-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  downloadZip(blob, filename);

  onProgress(`Saved ${filename} (${totalRecords} records in ${entityKeys.length + 1} CSV files)`);
  return filename;
}

/* ── Import ── */

/**
 * Reads a local ZIP backup file (containing CSV files) and merges it with
 * online data. Also accepts individual CSV files.
 *
 * Merge strategy: additive + update-only, never delete.
 *   - New local records → inserted online
 *   - Updated local records (newer lastModified) → overwrite online
 *   - Online-only records (new web bookings) → preserved
 *   - Conflicts → flagged, online version kept
 *   - Deletions → never propagated
 *
 * @param {File} file - ZIP file with CSVs (or individual CSV)
 * @param {Function} [onProgress] - optional callback(message) for status updates
 * @return {Promise<Object>} merge results
 */
export async function importSpreadsheet(file, onProgress = () => {}) {
  onProgress("Reading local backup…");

  const entityKeys = ["finances", "customers", "bookings", "supplies", "calendarEvents"];
  const isZip = file.name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";

  let payload = { data: {} };

  if (isZip) {
    onProgress("Extracting ZIP…");
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);

    const csvFiles = Object.keys(zip.files).filter((name) => name.endsWith(".csv") && name !== "README.csv");

    for (const name of csvFiles) {
      const csvText = await zip.files[name].async("string");
      // Derive entity key from filename (e.g. "finances.csv" → "finances")
      const key = name.replace(/\.csv$/, "").replace(/^.*\//, "");
      if (entityKeys.includes(key)) {
        const records = parseCSV(csvText);
        payload.data[key] = records;
        onProgress(`  ${key}: ${records.length} records`);
      }
    }
  } else if (file.name.endsWith(".csv") || file.type === "text/csv" || file.type === "text/plain") {
    // Single CSV file — try to determine entity from filename
    const csvText = await file.text();
    const key = file.name.replace(/\.csv$/, "").toLowerCase();

    onProgress(`  ${key}: parsing…`);
    const records = parseCSV(csvText);
    onProgress(`  ${key}: ${records.length} records`);

    if (entityKeys.includes(key)) {
      payload.data[key] = records;
    } else {
      throw new Error(`Unknown CSV entity in filename: "${key}". Expected one of: ${entityKeys.join(", ")}`);
    }
  } else {
    throw new Error("Please upload a .zip file (containing CSV files) or a single .csv file.");
  }

  const totalRecords = entityKeys.reduce((sum, k) => sum + (payload.data[k] || []).length, 0);
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
