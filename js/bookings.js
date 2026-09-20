/* bookings.js - Table CRUD for Booking records + calendar link.
   Endpoints: getBookings, addBooking, updateBooking, deleteBooking, getProperties, getCustomers.
   Model: {id, customerId, property, checkIn, checkOut, nights, total, status}
*/
import { api } from "./auth.js";
import { utils } from "./utils.js";
import { refreshDashboard } from "./dashboard.js";
import { CONFIG } from "./config.js";

let container = null;
let appRef = null;
let data = [];
let customers = {};
let properties = {};
let searchTerm = "";
let statusFilter = "all";

function buildColumns() {
  return ["Customer", "Property", "Check In", "Check Out", "Nights", "Total", "Status"];
}

export function createBookings(_args, ref) {
  appRef = ref;
  const section = document.createElement("section");
  section.className = "bookings-page";
  section.innerHTML = `
    <div class="toolbar">
      <div class="actions">
        <input class="search-box" id="bookingSearch" placeholder="Search customer, property…" type="search" inputmode="search" />
        <select id="bookingStatusFilter">
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <button class="btn btn--primary btn--sm" onclick="appAddBooking()">＋ Add Booking</button>
    </div>
    <div class="card">
      <div id="bookingTable" style="overflow:auto"></div>
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

  loadBookings().catch((err) => appRef.showToast(`Load failed: ${err.message}`, "error"));

  const unmount = function unmount() { container = null; };
  section._unmount = unmount;
  return section;
}

async function loadBookings() {
  const [bk, cust, prop] = await Promise.all([
    api.get("getBookings"),
    api.get("getCustomers"),
    api.get("getProperties"),
  ]);
  data = bk;
  customers = Object.fromEntries(cust.map((c) => [c.id, c]));
  properties = Object.fromEntries(prop.map((p) => [p.id, p]));
  const byDate = (b) => (b.checkIn || "");
  data.sort((a, b) => byDate(b).localeCompare(byDate(a)));
  renderTable();
}

function customerName(id) {
  return customers[id]?.name || id || "—";
}

function renderTable() {
  if (!container) return;
  const cols = buildColumns();
  const term = searchTerm.toLowerCase();
  const rows = data
    .filter((b) => {
      const matches =
        (customerName(b.customerId) || "").toLowerCase().includes(term) ||
        (b.property || "").toLowerCase().includes(term);
      const statusOk = statusFilter === "all" || (b.status || "") === statusFilter;
      return matches && statusOk;
    })
    .map((b) => ({
      id: b.id,
      Customer: utils.escapeHTML(customerName(b.customerId)),
      Property: utils.escapeHTML(b.property || ""),
      "Check In": utils.formatDate(b.checkIn),
      "Check Out": utils.formatDate(b.checkOut),
      Nights: b.nights ?? "",
      Total: utils.formatCurrency(b.total),
      Status: utils.statusPill(b.status),
    }));

  const t = document.createElement("table");
  t.className = "table";
  t.innerHTML =
    `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}<th>Actions</th></tr></thead><tbody></tbody>`;
  const tbody = t.querySelector("tbody");
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="${cols.length + 1}" class="empty-msg">No bookings match your filter.</td>`;
    tbody.appendChild(tr);
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.id = row.id;
    tr.innerHTML =
      `<td>${row.Customer}</td><td>${row.Property}</td><td>${row["Check In"]}</td><td>${row["Check Out"]}</td><td>${row.Nights}</td><td>${row.Total}</td><td>${row.Status}</td>` +
      `<td class="row-actions"><button class="btn btn--sm btn--icon" title="Edit" onclick="appEditBooking('${row.id}')">✏</button>` +
      `<button class="btn btn--sm btn--icon btn--danger" title="Delete" onclick="appDeleteBooking('${row.id}')">🗑</button>` +
      `<a href="#/calendar" class="btn btn--sm btn--icon" title="View in calendar" onclick="appViewBookingInCalendar('${row.id}')">🗓</a></td>`;
    tbody.appendChild(tr);
  });
  container.innerHTML = "";
  container.appendChild(t);
}

/* Customer + property option lists for the select dropdowns.
   NOTE: Customer dropdown uses the customer ID (FK); the Booking model's
   `property` field is a free-text NAME string (see seed data + dashboard grouping),
   so the property dropdown must submit the name, not the property id. */
function customerOptions() {
  return Object.entries(customers).map(([id, c]) => ({ value: id, label: c.name || id }));
}
function propertyOptions() {
  return Object.entries(properties).map(([id, p]) => ({
    value: p.name || p.id || "",
    label: `${p.name || id}${p.capacity ? ` (${p.capacity} guests)` : ""}`,
  }));
}

window.appAddBooking = async function () {
  if (!Object.keys(customers).length) await loadBookings();
  appRef.openModal({
    title: "Add Booking",
    submitLabel: "Add",
    size: "fullscreen",
    fields: [
      { name: "customerId", label: "Customer", type: "select", options: customerOptions(), default: "", required: true },
      { name: "property", label: "Property", type: "select", options: propertyOptions(), default: "", required: true },
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
      { name: "property", label: "Property", type: "select", options: propertyOptions(), default: b.property || "", required: true },
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

export async function refreshBookings() {
  await loadBookings();
}
