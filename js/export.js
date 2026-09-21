/* export.js - Offline backup and merge:
   Export all entities as JSON for local storage,
   and import a local backup to merge with online data.
*/
import { api } from "./auth.js?v=12";

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

/**
 * Downloads all data as a JSON file for local backup.
 * @param {Function} [onProgress] - optional callback(message) for status updates
 * @return {Promise<string>} filename
 */
export async function exportSpreadsheet(onProgress = () => {}) {
  onProgress("Fetching data from server…");
  const snapshot = await fetchSpreadsheetSnapshot();

  const blob = new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(),
    appName: "Pablo Paraiso Management",
    version: "1.0",
    data: snapshot,
  }, null, 2)], { type: "application/json" });

  const filename = `pablo-paraiso-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  onProgress(`Saved ${filename}`);
  return filename;
}

/**
 * Reads a local JSON backup file and merges it with online data.
 * Merge strategy: additive + update-only, never delete.
 *   - New local records → inserted online
 *   - Updated local records (newer lastModified) → overwrite online
 *   - Online-only records (new web bookings) → preserved
 *   - Conflicts → flagged, online version kept
 *   - Deletions → never propagated
 *
 * @param {File} file - The JSON backup file
 * @param {Function} [onProgress] - optional callback(message) for status updates
 * @return {Promise<Object>} merge results
 */
export async function importSpreadsheet(file, onProgress = () => {}) {
  onProgress("Reading local backup…");

  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    throw new Error("Invalid JSON file: " + e.message);
  }

  if (!payload.data) {
    throw new Error("Not a valid Pablo Paraiso backup file");
  }

  const entityKeys = ["finances", "customers", "bookings", "supplies"];
  let totalRecords = 0;
  entityKeys.forEach(k => {
    const count = (payload.data[k] || []).length;
    totalRecords += count;
    onProgress(`  ${k}: ${count} records`);
  });
  onProgress(`Total: ${totalRecords} records. Merging with online data…`);

  const result = await api.post("mergeSpreadsheet", payload);

  const summary = `${result.added} added, ${result.updated} updated, ${result.preserved} preserved`;
  if (result.conflicts.length > 0) {
    onProgress(summary + `, ${result.conflicts.length} conflict(s) flagged`);
  } else {
    onProgress(summary + " — merge complete");
  }

  return result;
}

export default { exportSpreadsheet, importSpreadsheet };
