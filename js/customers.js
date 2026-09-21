/* customers.js - Table CRUD for Customer records.
   Endpoints: getCustomers, addCustomer, updateCustomer, deleteCustomer.
   Model: {id,name,email,phone,address,notes}
*/
import { api } from "./auth.js?v=15";
import { utils } from "./utils.js?v=15";
import { applySort, toggleSort, sortableHeader } from "./sort.js?v=15";

let container = null;
let data = [];
let searchTerm = "";
let appRef = null;
let sortState = null;

/* Column definitions with key/label/type for sorting */
const COLUMNS = [
  { key: "name", label: "Name", type: "string" },
  { key: "email", label: "Email", type: "string" },
  { key: "phone", label: "Phone", type: "string" },
  { key: "address", label: "Address", type: "string" },
];

export function createCustomers(_args, ref) {
  appRef = ref;
  const section = document.createElement("section");
  section.className = "customers-page";
  section.innerHTML = `
    <div class="toolbar">
      <input class="search-box" id="customerSearch" placeholder="Search name, email, phone…" type="search" inputmode="search" />
      <button class="btn btn--primary btn--sm" onclick="appAddCustomer()">＋ Add Customer</button>
    </div>
    <div class="card">
      <div id="customerTable" class="table-scroll"></div>
    </div>
  `;
  container = section.querySelector("#customerTable");
  section.querySelector("#customerSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value;
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

  appRef.showPageLoader("Loading customers…");
  loadCustomers().catch((err) => {
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

async function loadCustomers() {
  data = await api.get("getCustomers");
  renderTable();
}

function renderTable() {
  if (!container) return;
  const cols = COLUMNS;
  const term = searchTerm.toLowerCase();
  const filtered = data.filter((c) =>
    !term ||
    (c.name || "").toLowerCase().includes(term) ||
    (c.email || "").toLowerCase().includes(term) ||
    (c.phone || "").toLowerCase().includes(term)
  );
  const sorted = applySort(filtered, cols, sortState);

  const rows = sorted.map((c) => ({
    id: c.id,
    Name: utils.escapeHTML(c.name || ""),
    Email: utils.escapeHTML(c.email || ""),
    Phone: utils.escapeHTML(c.phone || ""),
    Address: utils.escapeHTML(c.address || ""),
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
    tr.innerHTML = `<td colspan="${cols.length + 1}" class="empty-msg">No customers match your filter.</td>`;
    tbody.appendChild(tr);
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.id = row.id;
    const cells = cols.map((col) => {
      const td = document.createElement("td");
      td.innerHTML = row[col.label];
      return td;
    });
    const actionsTd = document.createElement("td");
    actionsTd.className = "row-actions";
    actionsTd.innerHTML =
      `<button class="btn btn--sm btn--icon" title="Edit" onclick="appEditCustomer('${row.id}')">✏</button>` +
      `<button class="btn btn--sm btn--icon btn--danger" title="Delete" onclick="appDeleteCustomer('${row.id}')">🗑</button>`;
    cells.push(actionsTd);
    cells.forEach((td) => tr.appendChild(td));
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(t);
}

/* ---- CRUD modal helpers ---- */
function customerFields(c) {
  return [
    { name: "name", label: "Full Name", type: "text", default: c?.name || "", required: true },
    { name: "email", label: "Email", type: "email", default: c?.email || "" },
    { name: "phone", label: "Phone", type: "tel", default: c?.phone || "" },
    { name: "address", label: "Address", tag: "textarea", default: c?.address || "" },
    { name: "notes", label: "Notes", tag: "textarea", default: c?.notes || "" },
  ];
}

window.appAddCustomer = function () {
  appRef.openModal({
    title: "Add Customer",
    submitLabel: "Add",
    fields: customerFields(null),
    onSubmit: async (form) => {
      try {
        await api.post("addCustomer", form);
        appRef.closeModal();
        appRef.showToast("Customer added", "info", 1500);
        await loadCustomers();
      } catch (err) {
        appRef.showToast(`Save failed: ${err.message}`, "error");
      }
    },
  });
};

window.appEditCustomer = async function (id) {
  const c = data.find((x) => x.id === id);
  if (!c) return;
  appRef.openModal({
    title: "Edit Customer",
    submitLabel: "Save",
    fields: customerFields(c),
    onSubmit: async (form) => {
      try {
        await api.post("updateCustomer", { id, ...form });
        appRef.closeModal();
        appRef.showToast("Customer updated", "info", 1500);
        await loadCustomers();
      } catch (err) {
        appRef.showToast(`Update failed: ${err.message}`, "error");
      }
    },
  });
};

window.appDeleteCustomer = async function (id) {
  const c = data.find((x) => x.id === id);
  if (!utils.confirm(`Delete ${c ? c.name : "customer"}?`)) return;
  try {
    await api.post("deleteCustomer", { id });
    appRef.showToast("Customer deleted", "info", 1500);
    await loadCustomers();
  } catch (err) {
    appRef.showToast(`Delete failed: ${err.message}`, "error");
  }
};

export async function refreshCustomers() {
  await loadCustomers();
}
