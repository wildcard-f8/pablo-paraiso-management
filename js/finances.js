/* finances.js - Table CRUD + bar chart (income vs expenses by category).
   Endpoint actions: getFinances, addFinance, updateFinance, deleteFinance.
   Model fields: id, date, type, category, description, amount, bookingId
*/
import { api } from "./auth.js";
import { utils, app } from "./app.js";
import { refreshDashboard } from "./dashboard.js";

let tableEl = null;
let chart = null;
let data = [];
let filtered = [];
let filterType = "all";

function buildColumns() {
  return ["Date", "Type", "Category", "Description", "Amount", "Booking ID"];
}

function rowActionHandlers(row) {
  const edit = `<button class="btn btn--sm btn--icon" title="Edit" onclick="appEditFinance('${row.id}')">✏</button>`;
  const del = `<button class="btn btn--sm btn--icon btn--danger" title="Delete" onclick="appDeleteFinance('${row.id}')">🗑</button>`;
  return edit + del;
}

export function createFinances(_args, appRef) {
  const section = document.createElement("section");
  section.className = "finances-page";
  section.innerHTML = `
    <div class="toolbar">
      <div class="actions">
        <select id="filterType" class="filter-select">
          <option value="all">All</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <input class="search-box" id="searchBox" placeholder="Search category, description…" type="search" inputmode="search" />
      </div>
      <button class="btn btn--primary btn--sm" onclick="appAddFinance()">＋ Add Finance</button>
    </div>
    <div class="card">
      <div id="tableContainer" style="overflow:auto"></div>
    </div>
    <div class="card chart-card">
      <h3>Income vs Expenses by Category</h3>
      <canvas id="financesChart" height="150"></canvas>
    </div>
  `;
  tableEl = section.querySelector("#tableContainer");
  section.querySelector("#filterType").addEventListener("change", () => {
    filterType = section.querySelector("#filterType").value;
    renderTable();
  });
  section.querySelector("#searchBox").addEventListener("input", (e) => {
    applySearch(e.target.value);
  });

  loadFinances().catch((err) => app.showToast(`Load failed: ${err.message}`, "error"));

  const unmount = function unmount() {
    if (chart) chart.destroy();
  };
  section._unmount = unmount;
  return section;
}

async function loadFinances() {
  data = await api.get("getFinances");
  data = data.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  filtered = [...data];
  renderTable();
  renderChart();
}

function applySearch(q) {
  const term = (q || "").toLowerCase();
  filtered = data.filter(
    (f) =>
      (filterType === "all" || f.type === filterType) &&
      (String(f.category || "").toLowerCase().includes(term) ||
        String(f.description || "").toLowerCase().includes(term))
  );
  renderTable();
}

function renderTable() {
  if (!tableEl) return;
  const cols = buildColumns();
  // map rows to column keys
  const rows = filtered.map((f) => ({
    id: f.id,
    Date: utils.formatDate(f.date),
    Type: utils.moneyPill(f.type),
    Category: utils.escapeHTML(f.category || ""),
    Description: utils.escapeHTML(f.description || ""),
    Amount: utils.formatCurrency(f.amount),
    "Booking ID": utils.escapeHTML(f.bookingId || ""),
  }));
  // Build a proper table via utils.buildTable
  const t = document.createElement("table");
  t.className = "table";
  t.innerHTML =
    `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}<th>Actions</th></tr></thead><tbody></tbody>`;
  const tbody = t.querySelector("tbody");
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="${cols.length + 1}" class="empty-msg">No finance records match your filter.</td>`;
    tbody.appendChild(tr);
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.id = row.id;
    tr.innerHTML =
      `<td>${row.Date}</td><td>${row.Type}</td><td>${row.Category}</td><td>${row.Description}</td><td>${row.Amount}</td><td>${row["Booking ID"]}</td>` +
      `<td class="row-actions">` + rowActionHandlers({ id: row.id }) + `</td>`;
    tbody.appendChild(tr);
  });
  tableEl.innerHTML = "";
  tableEl.appendChild(t);
}

function renderChart() {
  const ctx = document.getElementById("financesChart");
  if (!ctx) return;
  if (chart) chart.destroy();

  const byCat = data.reduce((acc, f) => {
    const cat = f.category || "Other";
    const amt = Number(f.amount || 0);
    if (!acc[cat]) acc[cat] = { income: 0, expense: 0 };
    if (f.type === "income") acc[cat].income += amt;
    else acc[cat].expense += amt;
    return acc;
  }, {});
  const cats = Object.keys(byCat);

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: cats.length ? cats : ["No data"],
      datasets: [
        { label: "Income", data: cats.length ? cats.map((c) => byCat[c].income) : [0], backgroundColor: "#4ade80", borderRadius: 4 },
        { label: "Expenses", data: cats.length ? cats.map((c) => byCat[c].expense) : [0], backgroundColor: "#f87171", borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "top" } },
      scales: {
        x: { stacked: true, ticks: { color: "var(--color-text-muted)" }, grid: { display: false } },
        y: { stacked: true, ticks: { color: "var(--color-text-muted)" }, grid: { color: "var(--color-border)" } },
      },
    },
  });
}

/* ---- Modal CRUD handlers (global for inline onclick) ---- */
window.appAddFinance = function () {
  app.openModal({
    title: "Add Finance Record",
    submitLabel: "Add",
    fields: [
      { name: "date", label: "Date", type: "date", default: utils.formatDateISO(new Date()), required: true },
      { name: "type", label: "Type", type: "select", options: [{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }], default: "income", required: true },
      { name: "category", label: "Category", type: "text", default: "Booking" },
      { name: "description", label: "Description", tag: "textarea", default: "" },
      { name: "amount", label: "Amount (USD)", type: "number", default: "", required: true },
      { name: "bookingId", label: "Booking ID (optional)", type: "text", default: "" },
    ],
    onSubmit: async (form) => {
      try {
        const clean = { ...form, amount: Number(form.amount) };
        delete clean.__k;
        await api.post("addFinance", clean);
        app.closeModal();
        app.showToast("Finance record added", "info", 1500);
        await loadFinances();
        refreshDashboard();
      } catch (err) {
        app.showToast(`Save failed: ${err.message}`, "error");
      }
    },
  });
};

window.appEditFinance = async function (id) {
  const record = data.find((f) => f.id === id);
  if (!record) return;
  app.openModal({
    title: "Edit Finance Record",
    submitLabel: "Save",
    fields: [
      { name: "date", label: "Date", type: "date", default: record.date || "", required: true },
      { name: "type", label: "Type", type: "select", options: [{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }], default: record.type || "income", required: true },
      { name: "category", label: "Category", type: "text", default: record.category || "" },
      { name: "description", label: "Description", tag: "textarea", default: record.description || "" },
      { name: "amount", label: "Amount (USD)", type: "number", default: record.amount || "", required: true },
      { name: "bookingId", label: "Booking ID", type: "text", default: record.bookingId || "" },
    ],
    onSubmit: async (form) => {
      try {
        const clean = { id, ...form, amount: Number(form.amount) };
        delete clean.__k;
        await api.post("updateFinance", clean);
        app.closeModal();
        app.showToast("Finance record updated", "info", 1500);
        await loadFinances();
        refreshDashboard();
      } catch (err) {
        app.showToast(`Update failed: ${err.message}`, "error");
      }
    },
  });
};

window.appDeleteFinance = async function (id) {
  if (!utils.confirm("Delete this finance record?")) return;
  try {
    await api.post("deleteFinance", { id });
    app.showToast("Finance record deleted", "info", 1500);
    await loadFinances();
    refreshDashboard();
  } catch (err) {
    app.showToast(`Delete failed: ${err.message}`, "error");
  }
};

export async function refreshFinances() {
  await loadFinances();
}
