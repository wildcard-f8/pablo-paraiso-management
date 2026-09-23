/* supplies.js - Table CRUD + low-stock alerting.
   Endpoints: getSupplies, addSupply, updateSupply, deleteSupply.
   Model: {id, name, category, quantity, unit, unitCost, lastOrdered, supplier, minStock}
*/
import { api } from "./auth.js?v=46";
import { utils } from "./utils.js?v=46";
import { CONFIG } from "./config.js?v=46";
import { applySort, toggleSort, sortableHeader } from "./sort.js?v=46";

let container = null;
let data = [];
let appRef = null;
let searchTerm = "";
let sortState = null;

/* Column definitions with key/label/type for sorting */
const COLUMNS = [
  { key: "name", label: "Name", type: "string" },
  { key: "category", label: "Category", type: "string" },
  { key: "quantity", label: "Quantity", type: "number" },
  { key: "unit", label: "Unit", type: "string" },
  { key: "unitCost", label: "Unit Cost", type: "number" },
  { key: "stockValue", label: "Stock Value", type: "number" },
  { key: "lastOrdered", label: "Last Ordered", type: "date" },
  { key: "supplier", label: "Supplier", type: "string" },
  { key: "minStock", label: "Min Stock", type: "number" },
];

export function createSupplies(_args, ref) {
  appRef = ref;
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
      <div id="supplyTable" class="table-scroll"></div>
    </div>
  `;
  container = section.querySelector("#supplyTable");
  section.querySelector("#supplySearch").addEventListener("input", (e) => {
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

  appRef.showPageLoader("Loading supplies…");
  loadSupplies().catch((err) => {
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

let showLowStockOnly = false;

async function loadSupplies() {
  data = await api.get("getSupplies");
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

function enrich(s) {
  const unitCost = Number(s.unitCost || 0);
  const qty = Number(s.quantity || 0);
  const low = isLowStock(s);
  return {
    id: s.id,
    name: utils.escapeHTML(s.name || "") + (low ? ' <span class="pill pill--danger">⚠ low</span>' : ""),
    category: utils.escapeHTML(s.category || ""),
    quantity: qty,
    unit: utils.escapeHTML(s.unit || ""),
    unitCost: utils.formatCurrency(unitCost),
    stockValue: utils.formatCurrency(unitCost * qty),
    lastOrdered: utils.formatDate(s.lastOrdered),
    supplier: utils.escapeHTML(s.supplier || ""),
    minStock: s.minStock ?? "",
    _low: low,
    _sortName: utils.escapeHTML(s.name || ""),
    _sortCategory: utils.escapeHTML(s.category || ""),
    _sortUnit: utils.escapeHTML(s.unit || ""),
    _sortSupplier: utils.escapeHTML(s.supplier || ""),
    _sortQuantity: qty,
    _sortUnitCost: unitCost,
    _sortStockValue: unitCost * qty,
    _sortLastOrdered: s.lastOrdered || "",
    _sortMinStock: Number(s.minStock || 0),
  };
}

function applySortEnriched(rows, cols, sortState) {
  if (!sortState || !sortState.column) return rows;
  const col = cols.find((c) => c.key === sortState.column);
  if (!col) return rows;
  const dir = sortState.direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => dir * sortCompare(a, b, col));
}

function sortCompare(a, b, col) {
  var av = a["_sort" + capitalize(col.key)] !== undefined ? a["_sort" + capitalize(col.key)] : a[col.key];
  var bv = b["_sort" + capitalize(col.key)] !== undefined ? b["_sort" + capitalize(col.key)] : b[col.key];
  if (col.type === "number") {
    return (Number(av) || 0) - (Number(bv) || 0);
  }
  if (col.type === "date") {
    return new Date(av || 0).getTime() - new Date(bv || 0).getTime();
  }
  return String(av || "").localeCompare(String(bv || ""));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderTable() {
  if (!container) return;
  const cols = COLUMNS;
  const term = searchTerm.toLowerCase();
  const filtered = data.filter((s) => {
    const text = `${s.name || ""} ${s.category || ""} ${s.supplier || ""}`.toLowerCase();
    const matches = !term || text.includes(term);
    const lowOk = !showLowStockOnly || isLowStock(s);
    return matches && lowOk;
  });
  const enriched = filtered.map(enrich);
  const sorted = applySortEnriched(enriched, cols, sortState);

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
  if (sorted.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="${cols.length + 1}" class="empty-msg">No supplies match your filter.</td>`;
    tbody.appendChild(tr);
  }
  sorted.forEach((row) => {
    const tr = document.createElement("tr");
    if (row._low) tr.style.background = "rgba(248,113,113,.08)";
    tr.dataset.id = row.id;
    const cells = cols.map((col) => {
      const td = document.createElement("td");
      // Use enriched (formatted) values for display
      td.innerHTML = row[col.key];
      return td;
    });
    const actionsTd = document.createElement("td");
    actionsTd.className = "row-actions";
    actionsTd.innerHTML =
      `<button class="btn btn--sm btn--icon" title="Edit" onclick="appEditSupply('${row.id}')">✏</button>` +
      `<button class="btn btn--sm btn--icon btn--danger" title="Delete" onclick="appDeleteSupply('${row.id}')">🗑</button>`;
    cells.push(actionsTd);
    cells.forEach((td) => tr.appendChild(td));
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(t);
}

function supplyFields(s) {
  return [
    { name: "name", label: "Item Name", type: "text", default: s?.name || "", required: true },
    { name: "category", label: "Category", type: "text", default: s?.category || "" },
    { name: "quantity", label: "Quantity On Hand", type: "number", default: s?.quantity || 0, required: true },
    { name: "unit", label: "Unit", type: "text", default: s?.unit || "pieces" },
    { name: "unitCost", label: `Unit Cost (${CONFIG.CURRENCY})`, type: "number", default: s?.unitCost || 0, hint: "Used to compute stock value." },
    { name: "lastOrdered", label: "Last Ordered", type: "date", default: s?.lastOrdered || utils.formatDateISO(new Date()) },
    { name: "supplier", label: "Supplier", type: "text", default: s?.supplier || "" },
    { name: "minStock", label: "Minimum Stock", type: "number", default: s?.minStock ?? CONFIG.DEFAULT_MIN_STOCK, hint: "Trigger for low-stock alert." },
  ];
}

window.appAddSupply = function () {
  appRef.openModal({
    title: "Add Supply",
    submitLabel: "Add",
    fields: supplyFields(null),
    onSubmit: async (form) => {
      try {
        const clean = { ...form, quantity: Number(form.quantity || 0), unitCost: Number(form.unitCost || 0), minStock: Number(form.minStock || 0) };
        delete clean.__k;
        await api.post("addSupply", clean);
        appRef.closeModal();
        appRef.showToast("Supply added", "info", 1500);
        await loadSupplies();
      } catch (err) {
        appRef.showToast(`Save failed: ${err.message}`, "error");
      }
    },
  });
};

window.appEditSupply = async function (id) {
  const s = data.find((x) => x.id === id);
  if (!s) return;
  appRef.openModal({
    title: "Edit Supply",
    submitLabel: "Save",
    fields: supplyFields(s),
    onSubmit: async (form) => {
      try {
        const clean = { id, ...form, quantity: Number(form.quantity || 0), unitCost: Number(form.unitCost || 0), minStock: Number(form.minStock || 0) };
        delete clean.__k;
        await api.post("updateSupply", clean);
        appRef.closeModal();
        appRef.showToast("Supply updated", "info", 1500);
        await loadSupplies();
      } catch (err) {
        appRef.showToast(`Update failed: ${err.message}`, "error");
      }
    },
  });
};

window.appDeleteSupply = async function (id) {
  const s = data.find((x) => x.id === id);
  if (!utils.confirm(`Delete ${s ? s.name : "supply"}?`)) return;
  try {
    await api.post("deleteSupply", { id });
    appRef.showToast("Supply deleted", "info", 1500);
    await loadSupplies();
  } catch (err) {
    appRef.showToast(`Delete failed: ${err.message}`, "error");
  }
};

export async function refreshSupplies() {
  await loadSupplies();
}
