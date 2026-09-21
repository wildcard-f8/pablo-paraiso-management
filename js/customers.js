/* customers.js - Table CRUD for Customer records.
   Endpoints: getCustomers, addCustomer, updateCustomer, deleteCustomer.
   Model: {id,name,email,phone,address,notes}
*/
import { api } from "./auth.js?v=9";
import { utils } from "./utils.js?v=9";

let container = null;
let data = [];
let searchTerm = "";
let appRef = null;

function buildColumns() {
  return ["Name", "Email", "Phone", "Address"];
}

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

  loadCustomers().catch((err) => appRef.showToast(`Load failed: ${err.message}`, "error"));

  const unmount = function unmount() { container = null; };
  section._unmount = unmount;
  return section;
}

async function loadCustomers() {
  data = await api.get("getCustomers");
  data = data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  renderTable();
}

function renderTable() {
  if (!container) return;
  const cols = buildColumns();
  const term = searchTerm.toLowerCase();
  const rows = data
    .filter((c) =>
      !term ||
      (c.name || "").toLowerCase().includes(term) ||
      (c.email || "").toLowerCase().includes(term) ||
      (c.phone || "").toLowerCase().includes(term)
    )
    .map((c) => ({
      id: c.id,
      Name: utils.escapeHTML(c.name || ""),
      Email: utils.escapeHTML(c.email || ""),
      Phone: utils.escapeHTML(c.phone || ""),
      Address: utils.escapeHTML(c.address || ""),
    }));

  const t = document.createElement("table");
  t.className = "table";
  t.innerHTML =
    `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}<th>Actions</th></tr></thead><tbody></tbody>`;
  const tbody = t.querySelector("tbody");
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="${cols.length + 1}" class="empty-msg">No customers match your filter.</td>`;
    tbody.appendChild(tr);
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.id = row.id;
    tr.innerHTML =
      `<td>${row.Name}</td><td>${row.Email}</td><td>${row.Phone}</td><td>${row.Address}</td>` +
      `<td class="row-actions"><button class="btn btn--sm btn--icon" title="Edit" onclick="appEditCustomer('${row.id}')">✏</button>` +
      `<button class="btn btn--sm btn--icon btn--danger" title="Delete" onclick="appDeleteCustomer('${row.id}')">🗑</button></td>`;
    tbody.appendChild(tr);
  });
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
