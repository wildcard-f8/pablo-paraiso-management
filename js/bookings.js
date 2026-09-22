/* bookings.js - Table CRUD for Booking records + calendar link.
   Endpoints: getBookings, addBooking, updateBooking, deleteBooking, getCustomers.
   Model: {id, customerId, checkIn, checkOut, nights, total, status}
*/
import { api } from "./auth.js?v=41";
import { utils } from "./utils.js?v=41";
import { refreshDashboard } from "./dashboard.js?v=41";
import { CONFIG } from "./config.js?v=41";
import { applySort, toggleSort, sortableHeader } from "./sort.js?v=41";



const COLUMNS = [
  { key: "customer", label: "Customer", type: "string" },
  { key: "checkIn", label: "Check In", type: "date" },
  { key: "checkOut", label: "Check Out", type: "date" },
  { key: "createdAt", label: "Booked On", type: "date" },
  { key: "nights", label: "Nights", type: "number" },
  { key: "total", label: "Total", type: "number" },
  { key: "status", label: "Status", type: "string" },
];

let container = null;
let appRef = null;
let data = [];
let customers = {};
let searchTerm = "";
let statusFilter = "all";
let sortState = null;
let dateFrom = "";
let dateTo = "";
let datePreset = "";

export function createBookings(_args, ref) {
  appRef = ref;
  const section = document.createElement("section");
  section.className = "bookings-page";
  section.innerHTML = `
    <div class="toolbar">
      <div class="actions">
        <input class="search-box" id="bookingSearch" placeholder="Search customer…" type="search" inputmode="search" />
        <select id="bookingStatusFilter">
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div class="date-range-view">
          <select class="view-select" id="bookingDatePreset">
            <option value="">All time</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="year">Last 365 days</option>
            <option value="custom">Custom range…</option>
          </select>
          <div class="date-custom" id="bookingDateCustom">
            <label for="bookingDateFrom">From</label>
            <input type="date" id="bookingDateFrom" />
            <label for="bookingDateTo">To</label>
            <input type="date" id="bookingDateTo" />
            <button class="btn btn--ghost btn--sm" onclick="appClearBookingDates()">Clear</button>
          </div>
        </div>
      </div>
      <button class="btn btn--primary btn--sm" onclick="appAddBooking()">＋ Add Booking</button>
    </div>
    <div class="card">
      <div id="bookingTable" class="table-scroll"></div>
    </div>
  `;
  container = section.querySelector("#bookingTable");
  section.querySelector("#bookingSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderTable();
  });
  section.querySelector("#bookingStatusFilter").addEventListener("change", () => {
    statusFilter = section.querySelector("#bookingStatusFilter").value;
    renderTable();
  });
  section.querySelector("#bookingDateFrom").addEventListener("change", (e) => {
    dateFrom = e.target.value;
    renderTable();
  });
  section.querySelector("#bookingDateTo").addEventListener("change", (e) => {
    dateTo = e.target.value;
    renderTable();
  });
  section.querySelector("#bookingDatePreset").addEventListener("change", (e) => {
    datePreset = e.target.value;
    const customEl = section.querySelector("#bookingDateCustom");
    if (datePreset === "custom") {
      customEl.classList.add("date-custom--visible");
    } else {
      customEl.classList.remove("date-custom--visible");
      dateFrom = "";
      dateTo = "";
    }
    renderTable();
  });

  /* Sortable column headers */
  container.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (!th) return;
    const col = COLUMNS.find((c) => c.key === th.dataset.col);
    if (!col) return;
    sortState = toggleSort(sortState, col.key);
    renderTable();
  });

  appRef.showPageLoader("Loading bookings…");
  loadBookings().catch((err) => {
    if (!err.message?.includes("Authentication required") && !err.message?.includes("not authorized") && !err.message?.includes("Invalid token")) {
      appRef.showToast(`Load failed: ${err.message}`, "error");
    }
  }).finally(() => {
    appRef.hidePageLoader();
  });

  const unmount = function unmount() { container = null; };
  section._unmount = unmount;
  return section;
}

async function loadBookings() {
  const [bk, cust] = await Promise.all([
    api.get("getBookings"),
    api.get("getCustomers"),
  ]);
  data = bk;
  customers = Object.fromEntries(cust.map((c) => [c.id, c]));
  renderTable();
}

function customerName(id) {
  return customers[id]?.name || id || "—";
}

function renderTable() {
  if (!container) return;
  const cols = COLUMNS;
  const term = searchTerm.toLowerCase();
  let filtered = data;
  const { from, to } = utils.computeDateRange(datePreset, dateFrom, dateTo);
  if (from || to) {
    filtered = utils.filterByDateRange(filtered, "checkIn", from || null, to || null);
  }
  filtered = filtered
    .filter((b) => {
      const matches =
        (customerName(b.customerId) || "").toLowerCase().includes(term) ||
        String(b.status || "").toLowerCase().includes(term);
      const statusOk = statusFilter === "all" || (b.status || "") === statusFilter;
      return matches && statusOk;
    });

  const sorted = applySort(filtered, cols, sortState);

  const rows = sorted.map((b) => ({
    id: b.id,
    customer: customerName(b.customerId),
    checkIn: b.checkIn || "",
    checkOut: b.checkOut || "",
    createdAt: b.createdAt || "",
    nights: b.nights ?? "",
    total: Number(b.total || 0),
    status: b.status || "",
  }));

  const t = document.createElement("table");
  t.className = "table";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  cols.forEach((col) => {
    const th = sortableHeader(col.label, sortState, col.key);
    th.dataset.col = col.key;
    headerRow.appendChild(th);
  });
  const actionsTh = document.createElement("th");
  actionsTh.textContent = "Actions";
  headerRow.appendChild(actionsTh);
  thead.appendChild(headerRow);
  t.appendChild(thead);
  const tbody = document.createElement("tbody");

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="${cols.length + 1}" class="empty-msg">No bookings match your filter.</td>`;
    tbody.appendChild(tr);
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.id = row.id;
    const cells = cols.map((col) => {
      const td = document.createElement("td");
      if (col.key === "total") {
        td.textContent = utils.formatCurrency(row.total);
      } else if (col.key === "nights") {
        td.textContent = row.nights;
      } else if (col.key === "status") {
        td.innerHTML = utils.statusPill(row.status);
      } else if (col.key === "customer") {
        td.textContent = row.customer;
      } else {
        td.textContent = utils.formatDate(row[col.key]);
      }
      return td;
    });
    const actionsTd = document.createElement("td");
    actionsTd.className = "row-actions";
    actionsTd.innerHTML =
      `<button class="btn btn--sm btn--icon" title="Edit" onclick="appEditBooking('${row.id}')">✏</button>` +
      `<button class="btn btn--sm btn--icon btn--danger" title="Delete" onclick="appDeleteBooking('${row.id}')">🗑</button>` +
      `<a href="#/calendar" class="btn btn--sm btn--icon" title="View in calendar" onclick="appViewBookingInCalendar('${row.id}')">🗓</a>`;
    cells.push(actionsTd);
    cells.forEach((td) => tr.appendChild(td));
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(t);
}

/* Customer option list for the select dropdown. */
function customerOptions() {
  return Object.entries(customers).map(([id, c]) => ({ value: id, label: c.name || id }));
}

window.appAddBooking = async function () {
  if (!Object.keys(customers).length) await loadBookings();
  appRef.openModal({
    title: "Add Booking",
    submitLabel: "Add",
    size: "fullscreen",
    fields: [
      { name: "customerId", label: "Customer", type: "select", options: customerOptions(), default: "", required: true },
      { name: "checkIn", label: "Check-in", type: "date", default: utils.formatDateISO(new Date()), required: true },
      { name: "checkOut", label: "Check-out", type: "date", default: "", required: true },
      { name: "nights", label: "Nights", type: "number", default: "", hint: "Auto-calculated if blank." },
      { name: "total", label: `Total (${CONFIG.CURRENCY})`, type: "number", default: "", required: true },
      { name: "status", label: "Status", type: "select", options: [{ value: "confirmed", label: "Confirmed" }, { value: "pending", label: "Pending" }, { value: "cancelled", label: "Cancelled" }], default: "confirmed", required: true },
    ],
    onSubmit: async (form) => {
      try {
        const clean = {
          ...form,
          nights: form.nights ? Number(form.nights) : 0,
          total: Number(form.total || 0),
        };
        delete clean.__k;
        await api.post("addBooking", clean);
        appRef.closeModal();
        appRef.showToast("Booking added", "info", 1500);
        await loadBookings();
        refreshDashboard?.();
      } catch (err) {
        appRef.showToast(`Save failed: ${err.message}`, "error");
      }
    },
  });
};

window.appEditBooking = async function (id) {
  const b = data.find((x) => x.id === id);
  if (!b) return;
  if (!Object.keys(customers).length) await loadBookings();
  appRef.openModal({
    title: "Edit Booking",
    submitLabel: "Save",
    size: "fullscreen",
    fields: [
      { name: "customerId", label: "Customer", type: "select", options: customerOptions(), default: b.customerId || "", required: true },
      { name: "checkIn", label: "Check-in", type: "date", default: b.checkIn || "", required: true },
      { name: "checkOut", label: "Check-out", type: "date", default: b.checkOut || "", required: true },
      { name: "nights", label: "Nights", type: "number", default: b.nights || "" },
      { name: "total", label: `Total (${CONFIG.CURRENCY})`, type: "number", default: b.total || "", required: true },
      { name: "status", label: "Status", type: "select", options: [{ value: "confirmed", label: "Confirmed" }, { value: "pending", label: "Pending" }, { value: "cancelled", label: "Cancelled" }], default: b.status || "confirmed", required: true },
    ],
    onSubmit: async (form) => {
      try {
        const clean = { id, ...form, nights: form.nights ? Number(form.nights) : 0, total: Number(form.total || 0) };
        delete clean.__k;
        await api.post("updateBooking", clean);
        appRef.closeModal();
        appRef.showToast("Booking updated", "info", 1500);
        await loadBookings();
      } catch (err) {
        appRef.showToast(`Update failed: ${err.message}`, "error");
      }
    },
  });
};

window.appDeleteBooking = async function (id) {
  const b = data.find((x) => x.id === id);
  if (!utils.confirm(`Delete booking ${b?.id}?`)) return;
  try {
    await api.post("deleteBooking", { id });
    appRef.showToast("Booking deleted", "info", 1500);
    await loadBookings();
  } catch (err) {
    appRef.showToast(`Delete failed: ${err.message}`, "error");
  }
};

window.appViewBookingInCalendar = function (id) {
  // navigate to calendar and open an informational toast
  window.location.hash = "#/calendar";
  setTimeout(() => appRef.showToast(`Find booking ${id} on the calendar.`, "info"), 300);
};

window.appClearBookingDates = function () {
  datePreset = "";
  dateFrom = "";
  dateTo = "";
  const presetEl = document.getElementById("bookingDatePreset");
  const customEl = document.getElementById("bookingDateCustom");
  const df = document.getElementById("bookingDateFrom");
  const dt = document.getElementById("bookingDateTo");
  if (presetEl) presetEl.value = "";
  if (customEl) customEl.classList.remove("date-custom--visible");
  if (df) df.value = "";
  if (dt) dt.value = "";
  renderTable();
};

export async function refreshBookings() {
  await loadBookings();
}
