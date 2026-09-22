/* finances.js - Table CRUD + bar chart (income vs expenses by category).
   Endpoint actions: getFinances, addFinance, updateFinance, deleteFinance.
   Model fields: id, date, type, category, description, amount, bookingId
*/
import { api } from "./auth.js?v=21";
import { utils } from "./utils.js?v=21";
import { refreshDashboard } from "./dashboard.js?v=21";
import { CONFIG } from "./config.js?v=21";
import { applySort, toggleSort, sortableHeader } from "./sort.js?v=21";

let tableEl = null;
let appRef = null;
let chart = null;
let data = [];
let filtered = [];
let filterType = "all";
let sortState = null;
let dateFrom = "";
let dateTo = "";
let datePreset = "";

/* Column definitions with key/label/type for sorting */
const COLUMNS = [
  { key: "date", type: "date" },
  { key: "type", type: "string" },
  { key: "category", type: "string" },
  { key: "description", type: "string" },
  { key: "amount", type: "number" },
  { key: "bookingId", type: "string" },
];

function rowActionHandlers(row) {
  const edit = `<button class="btn btn--sm btn--icon" title="Edit" onclick="appEditFinance('${row.id}')">✏</button>`;
  const del = `<button class="btn btn--sm btn--icon btn--danger" title="Delete" onclick="appDeleteFinance('${row.id}')">🗑</button>`;
  return edit + del;
}

export function createFinances(_args, ref) {
  appRef = ref;
  const section = document.createElement("section");
  section.className = "finances-page";
  section.innerHTML = `
    <div class="toolbar">
      <div class="actions">
        <div class="date-range-view">
          <select class="view-select" id="financeDatePreset">
            <option value="">All time</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="year">Last 365 days</option>
            <option value="custom">Custom range…</option>
          </select>
          <div class="date-custom" id="financeDateCustom">
            <label for="dateFrom">From</label>
            <input type="date" id="dateFrom" />
            <label for="dateTo">To</label>
            <input type="date" id="dateTo" />
            <button class="btn btn--ghost btn--sm" onclick="appClearFinanceDates()">Clear</button>
          </div>
        </div>
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
      <div id="tableContainer" class="table-scroll"></div>
    </div>
    <div class="card chart-card">
      <h3>Income vs Expenses by Category</h3>
      <canvas id="financesChart" height="150"></canvas>
    </div>
  `;
  tableEl = section.querySelector("#tableContainer");
  section.querySelector("#filterType").addEventListener("change", () => {
    filterType = section.querySelector("#filterType").value;
    applyFilters();
  });
  section.querySelector("#searchBox").addEventListener("input", (e) => {
    applySearch(e.target.value);
  });
  section.querySelector("#financeDatePreset").addEventListener("change", (e) => {
    datePreset = e.target.value;
    const customEl = section.querySelector("#financeDateCustom");
    if (datePreset === "custom") {
      customEl.classList.add("date-custom--visible");
    } else {
      customEl.classList.remove("date-custom--visible");
      dateFrom = "";
      dateTo = "";
    }
    applyFilters();
  });
  section.querySelector("#dateFrom").addEventListener("change", (e) => {
    dateFrom = e.target.value;
    applyFilters();
  });
  section.querySelector("#dateTo").addEventListener("change", (e) => {
    dateTo = e.target.value;
    applyFilters();
  });

  /* Sortable column headers */
  if (tableEl) {
    tableEl.addEventListener("click", (e) => {
      const th = e.target.closest("th.sortable");
      if (!th) return;
      const col = COLUMNS.find((c) => c.key === th.dataset.col);
      if (!col) return;
      sortState = toggleSort(sortState, col.key);
      renderTable();
    });
  }

  appRef.showPageLoader("Loading finances…");
  loadFinances().catch((err) => {
    if (!err.message?.includes("Authentication required") && !err.message?.includes("not authorized") && !err.message?.includes("Invalid token")) {
      appRef.showToast(`Load failed: ${err.message}`, "error");
    }
  }).finally(() => {
    appRef.hidePageLoader();
  });

  const unmount = function unmount() {
    if (chart) chart.destroy();
  };
  section._unmount = unmount;
  return section;
}

async function loadFinances() {
  data = await api.get("getFinances");
  applyFilters();
}

function applyFilters() {
  let result = data;
  // Date range filter (supports Week/Month/Year/Custom presets)
  const { from, to } = utils.computeDateRange(datePreset, dateFrom, dateTo);
  if (from || to) {
    result = utils.filterByDateRange(result, "date", from || null, to || null);
  }
  // Type filter
  if (filterType !== "all") {
    result = result.filter((f) => f.type === filterType);
  }
  filtered = result;
  renderTable();
  renderChart();
}

function applySearch(q) {
  const term = (q || "").toLowerCase();
  if (!term) {
    applyFilters();
    return;
  }
  let result = filtered;
  result = result.filter(
    (f) =>
      String(f.category || "").toLowerCase().includes(term) ||
      String(f.description || "").toLowerCase().includes(term)
  );
  // renderTable uses `filtered` — temporarily swap for search
  const prev = filtered;
  filtered = result;
  renderTable();
  filtered = prev; // restore so date/type filters persist on next applyFilters
}

function renderTable() {
  if (!tableEl) return;
  const cols = COLUMNS;
  const sorted = applySort(filtered, cols, sortState);

  const rows = sorted.map((f) => ({
    id: f.id,
    date: utils.formatDate(f.date),
    type: utils.moneyPill(f.type),
    category: utils.escapeHTML(f.category || ""),
    description: utils.escapeHTML(f.description || ""),
    amount: utils.formatCurrency(f.amount),
    bookingId: utils.escapeHTML(f.bookingId || ""),
  }));

  const t = document.createElement("table");
  t.className = "table";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  cols.forEach((col) => {
    const label = { date: "Date", type: "Type", category: "Category", description: "Description", amount: "Amount", bookingId: "Booking ID" }[col.key] || col.key;
    const th = sortableHeader(label, sortState, col.key);
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
    tr.innerHTML = `<td colspan="${cols.length + 1}" class="empty-msg">No finance records match your filter.</td>`;
    tbody.appendChild(tr);
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.id = row.id;
    const cells = cols.map((col) => {
      const td = document.createElement("td");
      td.innerHTML = row[col.key];
      return td;
    });
    const actionsTd = document.createElement("td");
    actionsTd.className = "row-actions";
    actionsTd.innerHTML = rowActionHandlers({ id: row.id });
    cells.push(actionsTd);
    cells.forEach((td) => tr.appendChild(td));
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);

  tableEl.innerHTML = "";
  tableEl.appendChild(t);
}

function renderChart() {
  const ctx = document.getElementById("financesChart");
  if (!ctx) return;
  if (chart) chart.destroy();

  const byCat = filtered.reduce((acc, f) => {
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
      plugins: {
        legend: {
          position: "top",
          labels: {
            color: "var(--color-text-dim)",
          },
        },
        tooltip: {
          backgroundColor: "var(--color-surface-2)",
          titleColor: "var(--color-text)",
          bodyColor: "var(--color-text-dim)",
          borderColor: "var(--color-border)",
          borderWidth: 1,
        },
      },
      scales: {
        x: { stacked: true, ticks: { color: "var(--color-text-dim)" }, grid: { display: false } },
        y: { stacked: true, ticks: { color: "var(--color-text-dim)" }, grid: { color: "var(--color-border)" } },
      },
    },
  });
}

window.appClearFinanceDates = function () {
  datePreset = "";
  dateFrom = "";
  dateTo = "";
  const presetEl = document.getElementById("financeDatePreset");
  const customEl = document.getElementById("financeDateCustom");
  const df = document.getElementById("dateFrom");
  const dt = document.getElementById("dateTo");
  if (presetEl) presetEl.value = "";
  if (customEl) customEl.classList.remove("date-custom--visible");
  if (df) df.value = "";
  if (dt) dt.value = "";
  applyFilters();
};

/* ---- Modal CRUD handlers (global for inline onclick) ---- */
window.appAddFinance = function () {
  appRef.openModal({
    title: "Add Finance Record",
    submitLabel: "Add",
    fields: [
      { name: "date", label: "Date", type: "date", default: utils.formatDateISO(new Date()), required: true },
      { name: "type", label: "Type", type: "select", options: [{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }], default: "income", required: true },
      { name: "category", label: "Category", type: "text", default: "Booking" },
      { name: "description", label: "Description", tag: "textarea", default: "" },
      { name: "amount", label: `Amount (${CONFIG.CURRENCY})`, type: "number", default: "", required: true },
      { name: "bookingId", label: "Booking ID (optional)", type: "text", default: "" },
    ],
    onSubmit: async (form) => {
      try {
        const clean = { ...form, amount: Number(form.amount) };
        delete clean.__k;
        await api.post("addFinance", clean);
        appRef.closeModal();
        appRef.showToast("Finance record added", "info", 1500);
        await loadFinances();
        refreshDashboard();
      } catch (err) {
        appRef.showToast(`Save failed: ${err.message}`, "error");
      }
    },
  });
};

window.appEditFinance = async function (id) {
  const record = data.find((f) => f.id === id);
  if (!record) return;
  appRef.openModal({
    title: "Edit Finance Record",
    submitLabel: "Save",
    fields: [
      { name: "date", label: "Date", type: "date", default: record.date || "", required: true },
      { name: "type", label: "Type", type: "select", options: [{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }], default: record.type || "income", required: true },
      { name: "category", label: "Category", type: "text", default: record.category || "" },
      { name: "description", label: "Description", tag: "textarea", default: record.description || "" },
      { name: "amount", label: `Amount (${CONFIG.CURRENCY})`, type: "number", default: record.amount || "", required: true },
      { name: "bookingId", label: "Booking ID", type: "text", default: record.bookingId || "" },
    ],
    onSubmit: async (form) => {
      try {
        const clean = { id, ...form, amount: Number(form.amount) };
        delete clean.__k;
        await api.post("updateFinance", clean);
        appRef.closeModal();
        appRef.showToast("Finance record updated", "info", 1500);
        await loadFinances();
        refreshDashboard();
      } catch (err) {
        appRef.showToast(`Update failed: ${err.message}`, "error");
      }
    },
  });
};

window.appDeleteFinance = async function (id) {
  if (!utils.confirm("Delete this finance record?")) return;
  try {
    await api.post("deleteFinance", { id });
    appRef.showToast("Finance record deleted", "info", 1500);
    await loadFinances();
    refreshDashboard();
  } catch (err) {
    appRef.showToast(`Delete failed: ${err.message}`, "error");
  }
};

export async function refreshFinances() {
  await loadFinances();
}
