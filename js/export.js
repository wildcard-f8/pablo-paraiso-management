/* export.js - Offline backup: fetch all entities from the backend and
   download as a JSON file for local storage / later merge upload.
*/
import { api } from "./auth.js?v=9";

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

export default exportSpreadsheet;
