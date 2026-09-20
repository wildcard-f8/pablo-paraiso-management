/* supplies.js - Table CRUD + low-stock alerting.
   Endpoints: getSupplies, addSupply, updateSupply, deleteSupply.
   Model: {id, name, category, quantity, unit, unitCost, lastOrdered, supplier, minStock}
*/
import { api } from "./auth.js";
import { utils, app } from "./app.js";
import { CONFIG } from "./config.js";

let container = null;
let data = [];
let searchTerm = "";

function buildColumns() {
  return ["Name", "Category", "Quantity", "Unit", "Unit Cost", "Stock Value", "Last Ordered", "Supplier", "Min Stock"];
}

export function createSupplies(_args, appRef) {
  const section = document.createElement("section");
  section.className = "supplies-page";
  section.innerHTML = `
    <div class="toolbar">
      <input class="search-box" id="supplySearch" placeholder="Search name, category, supplier…" type="search" inputmode="search" />
      <button class="btn btn--danger btn--sm" id="lowStockToggle" onclick="appToggleLowStock()">⚠ Low stock only</button>
      <button class="btn btn--primary btn--sm" onclick="appAddSupply()">＋ Add Supply</button>
    </div>

    <div id="lowStockAlert" class="card" style="display:none; border-color: var(--color-danger); margin-bottom: var(--space-4);">
      <strong>⚠ Low stock alert:</strong> <span id="lowStockCount"></span> item(s) below minimum.
    </div>

    <div class="card">
      <div id="supplyTable" style="overflow:auto"></div>
    </div>
  `;
  container = section.querySelector("#supplyTable");
  section.querySelector("#supplySearch").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderTable();
  });

  loadSupplies().catch((err) => app.showToast(`Load failed: ${err.message}`, "error"));

  const unmount = function unmount() { container = null; };
  section._unmount = unmount;
  return section;
}

let showLowStockOnly = false;

async function loadSupplies() {
  data = await api.get("getSupplies");
  data = data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  updateLowStockBanner();
  renderTable();
}

function isLowStock(s) {
  const qty = Number(s.quantity || 0);
  const min = Number(s.minStock || CONFIG.DEFAULT_MIN_STOCK);
  return qty <= min;
}

function updateLowStockBanner() {
  const low = data.filter(isLowStock);
  const banner = document.getElementById("lowStockAlert");
  const count = document.getElementById("lowStockCount");
  if (banner && count) {
    count.textContent = low.length;
    banner.style.display = low.length ? "block" : "none";
  }
}

window.appToggleLowStock = function () {
  showLowStockOnly = !showLowStockOnly;
  document.getElementById("lowStockToggle").classList.toggle("active", showLowStockOnly);
  renderTable();
};

function renderTable() {
  if (!container) return;
  const cols = buildColumns();
  const term = searchTerm.toLowerCase();
  const rows = data
    .filter((s) => {
      const text = `${s.name || ""} ${s.category || ""} ${s.supplier || ""}`.toLowerCase();
      const matches = !term || text.includes(term);
      const lowOk = !showLowStockOnly || isLowStock(s);
      return matches && lowOk;
    })
    .map((s) => {
      const unitCost = Number(s.unitCost || 0);
      const qty = Number(s.quantity || 0);
      const low = isLowStock(s);
      return {
        id: s.id,
        Name: utils.escapeHTML(s.name || "") + (low ? ' <span class="pill pill--danger">⚠ low</span>' : ""),
        Category: utils.escapeHTML(s.category || ""),
        Quantity: qty,
        Unit: utils.escapeHTML(s.unit || ""),
        "Unit Cost": utils.formatCurrency(unitCost),
        "Stock Value": utils.formatCurrency(unitCost * qty),
        "Last Ordered": utils.formatDate(s.lastOrdered),
        Supplier: utils.escapeHTML(s.supplier || ""),
        "Min Stock": s.minStock ?? "",
        _low: low,
      };
    });

  const t = document.createElement("table");
  t.className = "table";
  t.innerHTML =
    `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}<th>Actions</th></tr></thead><tbody></tbody>`;
  const tbody = t.querySelector("tbody");
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="${cols.length + 1}" class="empty-msg">No supplies match your filter.</td>`;
    tbody.appendChild(tr);
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    if (row._low) tr.style.background = "rgba(248,113,113,.08)";
    tr.dataset.id = row.id;
    tr.innerHTML =
      `<td>${row.Name}</td><td>${row.Category}</td><td>${row.Quantity}</td><td>${row.Unit}</td><td>${row["Unit Cost"]}</td><td>${row["Stock Value"]}</td><td>${row["Last Ordered"]}</td><td>${row.Supplier}</td><td>${row["Min Stock"]}</td>` +
      `<td class="row-actions"><button class="btn btn--sm btn--icon" title="Edit" onclick="appEditSupply('${row.id}')">✏</button>` +
      `<button class="btn btn--sm btn--icon btn--danger" title="Delete" onclick="appDeleteSupply('${row.id}')">🗑</button></td>`;
    tbody.appendChild(tr);
  });
  container.innerHTML = "";
  container.appendChild(t);
}

function supplyFields(s) {
  return [
    { name: "name", label: "Item Name", type: "text", default: s?.name || "", required: true },
    { name: "category", label: "Category", type: "text", default: s?.category || "" },
    { name: "quantity", label: "Quantity On Hand", type: "number", default: s?.quantity || 0, required: true },
    { name: "unit", label: "Unit", type: "text", default: s?.unit || "pieces" },
    { name: "unitCost", label: "Unit Cost (USD)", type: "number", default: s?.unitCost || 0, hint: "Used to compute stock value." },
    { name: "lastOrdered", label: "Last Ordered", type: "date", default: s?.lastOrdered || utils.formatDateISO(new Date()) },
    { name: "supplier", label: "Supplier", type: "text", default: s?.supplier || "" },
    { name: "minStock", label: "Minimum Stock", type: "number", default: s?.minStock ?? CONFIG.DEFAULT_MIN_STOCK, hint: "Trigger for low-stock alert." },
  ];
}

window.appAddSupply = function () {
  app.openModal({
    title: "Add Supply",
    submitLabel: "Add",
    fields: supplyFields(null),
    onSubmit: async (form) => {
      try {
        const clean = { ...form, quantity: Number(form.quantity || 0), unitCost: Number(form.unitCost || 0), minStock: Number(form.minStock || 0) };
        delete clean.__k;
        await api.post("addSupply", clean);
        app.closeModal();
        app.showToast("Supply added", "info", 1500);
        await loadSupplies();
      } catch (err) {
        app.showToast(`Save failed: ${err.message}`, "error");
      }
    },
  });
};

window.appEditSupply = async function (id) {
  const s = data.find((x) => x.id === id);
  if (!s) return;
  app.openModal({
    title: "Edit Supply",
    submitLabel: "Save",
    fields: supplyFields(s),
    onSubmit: async (form) => {
      try {
        const clean = { id, ...form, quantity: Number(form.quantity || 0), unitCost: Number(form.unitCost || 0), minStock: Number(form.minStock || 0) };
        delete clean.__k;
        await api.post("updateSupply", clean);
        app.closeModal();
        app.showToast("Supply updated", "info", 1500);
        await loadSupplies();
      } catch (err) {
        app.showToast(`Update failed: ${err.message}`, "error");
      }
    },
  });
};

window.appDeleteSupply = async function (id) {
  const s = data.find((x) => x.id === id);
  if (!utils.confirm(`Delete ${s ? s.name : "supply"}?`)) return;
  try {
    await api.post("deleteSupply", { id });
    app.showToast("Supply deleted", "info", 1500);
    await loadSupplies();
  } catch (err) {
    app.showToast(`Delete failed: ${err.message}`, "error");
  }
};

export async function refreshSupplies() {
  await loadSupplies();
}
