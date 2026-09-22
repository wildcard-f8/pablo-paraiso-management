/* dashboard.js - Dashboard: summary cards + Chart.js visuals.
   Charts: revenue vs expenses (bar), booking income over time (line),
           expenses by category (doughnut), bookings by status (doughnut),
           occupancy rate over time (bar).
*/
import { api } from "./auth.js?v=33";
import { utils } from "./utils.js?v=33";
import { CONFIG } from "./config.js?v=33";

let charts = {};
let dashboardRoot = null;
let appRef = null;
let loadGeneration = 0;
let datePreset = ""; // "", "week", "month", "year", "custom"
let dashboardDateFrom = "";
let dashboardDateTo = "";
let cachedFinances = [];
let cachedBookings = [];
let cachedSupplies = [];
let cachedCustomers = [];

/* Resolve a CSS custom property to its actual computed value so Chart.js
   can use it. Chart.js does NOT understand CSS variables on its own —
   passing "var(--color-text-dim)" results in a fallback of black. */
function resolveColor(cssVar) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  /* Fallback must be a light colour — the default theme is dark.
     A black fallback (#000) on a dark canvas makes text completely
     unreadable if CSS vars have not loaded or the query fails. */
  return val || "#f1f5f9";
}

/* Theme-aware color palette for charts */
function chartColors() {
  return {
    text:   resolveColor("--color-text"),
    textDim: resolveColor("--color-text-dim"),
    border: resolveColor("--color-border"),
    surface: resolveColor("--color-surface-2"),
    grid:   resolveColor("--color-border"),
  };
}

function resolveDateRange() {
  return utils.computeDateRange(datePreset, dashboardDateFrom, dashboardDateTo);
}

export function createDashboard(_args, ref) {
  appRef = ref;
  const section = document.createElement("section");
  section.className = "dashboard-page";
  section.innerHTML = `
    <div class="toolbar">
      <div class="date-range-view">
        <select class="view-select" id="dashboardDatePreset">
          <option value="">All time</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
          <option value="year">Last 365 days</option>
          <option value="custom">Custom range…</option>
        </select>
        <div class="date-custom" id="dashboardDateCustom">
          <label for="dashboardDateFrom">From</label>
          <input type="date" id="dashboardDateFrom" />
          <label for="dashboardDateTo">To</label>
          <input type="date" id="dashboardDateTo" />
          <button class="btn btn--ghost btn--sm" onclick="appClearDashboardDates()">Clear</button>
        </div>
      </div>
    </div>

    <div class="stats-grid" id="statsGrid">
      <div class="card card--stat"><div class="card__label">Total Revenue</div><div class="card__value" id="statRevenue">—</div><div class="card__trend" id="trendRevenue"></div></div>
      <div class="card card--stat"><div class="card__label">Total Expenses</div><div class="card__value" id="statExpenses">—</div><div class="card__trend" id="trendExpenses"></div></div>
      <div class="card card--stat"><div class="card__label">Net Profit</div><div class="card__value" id="statNet">—</div><div class="card__trend" id="trendNet"></div></div>
      <div class="card card--stat"><div class="card__label">Occupancy Rate</div><div class="card__value" id="statOccupancy">—</div><div class="card__trend" id="trendOccupancy"></div></div>
      <div class="card card--stat"><div class="card__label">Active Bookings</div><div class="card__value" id="statBookings">—</div><div class="card__trend" id="trendBookings"></div></div>
      <div class="card card--stat"><div class="card__label">Low Stock Items</div><div class="card__value" id="statLowStock">—</div><div class="card__trend" id="trendLowStock"></div></div>
    </div>

    <div class="charts-grid">
      <div class="card chart-card">
        <h3>Revenue vs Expenses</h3>
        <canvas id="chartRevenueExpenses" height="240"></canvas>
      </div>
      <div class="card chart-card">
        <h3>Expenses by Category</h3>
        <canvas id="chartExpensesCategory" height="240"></canvas>
      </div>
      <div class="card chart-card chart-card--full">
        <h3>Booking Income Over Time</h3>
        <canvas id="chartBookingIncome" height="240"></canvas>
      </div>
      <div class="card chart-card">
        <h3>Occupancy Rate Over Time</h3>
        <canvas id="chartOccupancy" height="240"></canvas>
      </div>
      <div class="card chart-card">
        <h3>Bookings by Status</h3>
        <canvas id="chartBookingsStatus" height="240"></canvas>
      </div>
    </div>
  `;

  // Capture the (still-detached) root so async data loads can query it.
  dashboardRoot = section;
  loadGeneration++;
  loadDashboard();

  // Wire up view selector + date inputs after the section is attached.
  setTimeout(() => {
    const presetEl = dashboardRoot.querySelector("#dashboardDatePreset");
    const customEl = dashboardRoot.querySelector("#dashboardDateCustom");
    const df = dashboardRoot.querySelector("#dashboardDateFrom");
    const dt = dashboardRoot.querySelector("#dashboardDateTo");

    if (presetEl) presetEl.addEventListener("change", (e) => {
      datePreset = e.target.value;
      if (datePreset === "custom") {
        customEl.classList.add("date-custom--visible");
      } else {
        customEl.classList.remove("date-custom--visible");
        dashboardDateFrom = "";
        dashboardDateTo = "";
      }
      applyDashboardFilters();
    });
    if (df) df.addEventListener("change", (e) => {
      dashboardDateFrom = e.target.value;
      applyDashboardFilters();
    });
    if (dt) dt.addEventListener("change", (e) => {
      dashboardDateTo = e.target.value;
      applyDashboardFilters();
    });
  }, 0);

  section._unmount = function unmount() {
    Object.values(charts).forEach((c) => c.destroy());
    charts = {};
    dashboardRoot = null;
  };
  return section;
}

async function loadDashboard() {
  const myGeneration = loadGeneration;
  /* Only show the page loader if we need to fetch from the backend.
     If all data is in the cache (sessionStorage), the Promise.all
     below resolves in milliseconds — no need for a spinner flash. */
  const allCached = api.isCached("getFinances") &&
    api.isCached("getBookings") &&
    api.isCached("getCustomers") &&
    api.isCached("getSupplies");
  if (!allCached) appRef.showPageLoader("Starting up backend (may take a few seconds)…");
  try {
    const [finances, bookings, customers, supplies] = await Promise.all([
      api.get("getFinances"),
      api.get("getBookings"),
      api.get("getCustomers"),
      api.get("getSupplies"),
    ]);

    // Guard: if a newer dashboard load was kicked off, abandon this one
    if (myGeneration !== loadGeneration) { appRef.hidePageLoader(); return; }

    // Cache the full (unfiltered) data so date-range re-renders skip re-fetching
    cachedFinances = finances;
    cachedBookings = bookings;
    cachedSupplies = supplies;
    cachedCustomers = customers;

    renderDashboard(cachedFinances, cachedBookings, cachedSupplies, cachedCustomers);
    appRef.hidePageLoader();
  } catch (err) {
    /* If the error is auth-related, the auth:required/auth:denied handler
       already showed the appropriate toast — don't double-notify. */
    const msg = err.message || String(err);
    if (!msg.includes("Authentication required") && !msg.includes("not authorized") && !msg.includes("Invalid token")) {
      appRef.showToast(`Failed to load dashboard: ${msg}`, "error");
    }
    appRef.hidePageLoader();
    const s = dashboardRoot && dashboardRoot.querySelector("#statsGrid");
    if (s) s.innerHTML = `<div class="empty-state"><p>${utils.escapeHTML(utils.capitalize(msg))}</p></div>`;
  }
}

function applyDashboardFilters() {
  const { from, to } = resolveDateRange();
  let f = cachedFinances, b = cachedBookings;
  if (from || to) {
    f = utils.filterByDateRange(f, "date", from || null, to || null);
    b = utils.filterByDateRange(b, "checkIn", from || null, to || null);
  }
  renderDashboard(f, b, cachedSupplies, cachedCustomers);
}

function renderDashboard(finances, bookings, supplies, customers) {
  if (!dashboardRoot) return;
  const slot = dashboardRoot.querySelector("#statsGrid");
  if (!slot) return;

  const { from, to } = resolveDateRange();

  const income = finances.filter((f) => f.type === "income");
  const expenses = finances.filter((f) => f.type === "expense");
  const totalIncome = income.reduce((s, f) => s + Number(f.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, f) => s + Number(f.amount || 0), 0);
  const net = totalIncome - totalExpenses;

  const activeBookings = bookings.filter((b) => b.status === "confirmed");
  const lowStock = supplies.filter((s) => Number(s.quantity || 0) <= Number(s.minStock || 0));

  // Occupancy rate for the current period
  const occupancy = utils.computeOccupancyRate(bookings, from || null, to || null);

  const el = (id, val, prefix = "") => {
    const e = dashboardRoot.querySelector(`#${id}`);
    if (e) e.textContent = prefix + val;
  };
  el("statRevenue", utils.formatCurrency(totalIncome));
  el("statExpenses", utils.formatCurrency(totalExpenses));
  el("statNet", utils.formatCurrency(net));
  el("statOccupancy", `${occupancy.toFixed(2)}%`);
  el("statBookings", activeBookings.length);
  el("statLowStock", lowStock.length);

  const trendNet = dashboardRoot.querySelector("#trendNet");
  if (trendNet) {
    trendNet.textContent = net >= 0
      ? `Net positive: ${utils.formatCurrency(net)}`
      : `Net negative: ${utils.formatCurrency(Math.abs(net))}`;
    trendNet.className = "card__trend " + (net >= 0 ? "trend--positive" : "trend--negative");
  }

  const trendOcc = dashboardRoot.querySelector("#trendOccupancy");
  if (trendOcc) {
    trendOcc.textContent = occupancy > 0
      ? `${occupancy.toFixed(2)}% occupied in selected period`
      : "No bookings in period";
    trendOcc.className = "card__trend " + (occupancy >= 50 ? "trend--positive" : occupancy === 0 ? "" : "trend--negative");
  }

  renderCharts(finances, bookings, supplies, customers);
}

function renderCharts(finances, bookings, supplies, customers) {
  // Safety net: destroy any existing charts before creating new ones
  // (prevents "Canvas already in use" when the same canvas is reused)
  Object.values(charts).forEach((c) => { if (c) c.destroy(); });
  charts = {};

  const ctx = (id) => dashboardRoot && dashboardRoot.querySelector(`#${id}`);
  const C = chartColors();

  /* Chart 1: Revenue vs Expenses (bar) */
  charts.revenue = new Chart(ctx("chartRevenueExpenses"), {
    type: "bar",
    data: {
      labels: ["Revenue", "Expenses"],
      datasets: [{
        label: `Amount (${CONFIG.CURRENCY})`,
        data: [
          finances.filter((f) => f.type === "income").reduce((s, f) => s + Number(f.amount || 0), 0),
          finances.filter((f) => f.type === "expense").reduce((s, f) => s + Number(f.amount || 0), 0),
        ],
        backgroundColor: ["#4ade80", "#f87171"],
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      color: C.text,
      layout: { padding: { top: 4, bottom: 8, left: 0, right: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: C.surface,
          titleColor: C.text,
          bodyColor: C.textDim,
          borderColor: C.border,
          borderWidth: 1,
        },
      },
      scales: {
        y: {
          ticks: { color: C.textDim },
          grid: { color: C.grid },
          beginAtZero: true,
        },
        x: {
          ticks: { color: C.textDim },
          grid: { display: false },
        },
      },
    },
  });

  /* Chart 2: Expenses by Category (doughnut) */
  const expenseByCat = finances
    .filter((f) => f.type === "expense")
    .reduce((acc, f) => {
      const cat = f.category || "Other";
      acc[cat] = (acc[cat] || 0) + Number(f.amount || 0);
      return acc;
    }, {});
  const catLabels = Object.keys(expenseByCat);
  charts.expenses = new Chart(ctx("chartExpensesCategory"), {
    type: "doughnut",
    data: {
      labels: catLabels.length ? catLabels : ["No expenses"],
      datasets: [{
        data: catLabels.length ? Object.values(expenseByCat) : [0],
        backgroundColor: ["#fbbf24", "#f87171", "#a78bfa", "#3b82f6", "#4ade80", "#facc15"],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      color: C.text,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: C.textDim,
            padding: 16,
          },
        },
        tooltip: {
          backgroundColor: C.surface,
          titleColor: C.text,
          bodyColor: C.textDim,
          borderColor: C.border,
          borderWidth: 1,
        },
      },
    },
  });

  /* Chart 3: Booking Income Over Time (line) */
  const incomeByDate = bookings
    .filter((b) => b.total > 0)
    .reduce((acc, b) => {
      const d = (b.checkIn || "").slice(0, 10);
      acc[d] = (acc[d] || 0) + Number(b.total || 0);
      return acc;
    }, {});
  const sortedDates = Object.keys(incomeByDate).sort();
  charts.booking = new Chart(ctx("chartBookingIncome"), {
    type: "line",
    data: {
      labels: sortedDates.length ? sortedDates : ["No data"],
      datasets: [{
        label: `Income (${CONFIG.CURRENCY})`,
        data: sortedDates.length ? sortedDates.map((d) => incomeByDate[d]) : [0],
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,.12)",
        tension: 0.35,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: "#3b82f6",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      color: C.text,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: C.surface,
          titleColor: C.text,
          bodyColor: C.textDim,
          borderColor: C.border,
          borderWidth: 1,
        },
      },
      scales: {
        y: {
          ticks: { color: C.textDim },
          grid: { color: C.grid },
          beginAtZero: true,
        },
        x: {
          ticks: { color: C.textDim },
          grid: { display: false },
        },
      },
    },
  });

  /* Chart 4: Occupancy Rate Over Time (bar, grouped by week) */
  charts.occupancy = renderOccupancyChart(ctx("chartOccupancy"), bookings, C);

  /* Chart 5: Bookings by Status (doughnut) */
  const byStatus = bookings.reduce((acc, b) => {
    const key = b.status || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const statusLabels = Object.keys(byStatus);
  const statusColors = {
    confirmed: "#4ade80",
    pending: "#fbbf24",
    cancelled: "#f87171",
    completed: "#3b82f6",
    unknown: "#9ca3af",
  };
  charts.status = new Chart(ctx("chartBookingsStatus"), {
    type: "doughnut",
    data: {
      labels: statusLabels.length ? statusLabels : ["No bookings"],
      datasets: [{
        data: statusLabels.length ? statusLabels.map((s) => byStatus[s]) : [0],
        backgroundColor: statusLabels.map((s) => statusColors[s] || "#9ca3af"),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      color: C.text,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: C.textDim,
            padding: 16,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          backgroundColor: C.surface,
          titleColor: C.text,
          bodyColor: C.textDim,
          borderColor: C.border,
          borderWidth: 1,
        },
      },
    },
  });
}

function getWeekStart(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day); // Monday is start of week
  date.setDate(date.getDate() + diff);
  return date;
}

function renderOccupancyChart(canvasEl, bookings, C) {
  if (!canvasEl) return null;
  // Group bookings by week (Mon–Sun) and compute occupancy per week
  const weeks = {};
  bookings.forEach((b) => {
    if (b.status === "cancelled" || !b.checkIn || !b.checkOut) return;
    const cin = new Date(b.checkIn);
    const weekStart = getWeekStart(cin);
    const weekKey = utils.formatDateISO(weekStart);
    if (!weeks[weekKey]) weeks[weekKey] = { bookedNights: 0, totalDays: 7 };
    const cout = new Date(b.checkOut);
    const nights = Math.ceil((cout - cin) / (1000 * 60 * 60 * 24));
    weeks[weekKey].bookedNights += nights;
  });
  const weekKeys = Object.keys(weeks).sort();
  const data = weekKeys.map((k) => parseFloat((weeks[k].bookedNights / weeks[k].totalDays * 100).toFixed(2)));
  return new Chart(canvasEl, {
    type: "bar",
    data: {
      labels: weekKeys.length ? weekKeys : ["No data"],
      datasets: [{
        label: "Occupancy %",
        data: data.length ? data : [0],
        backgroundColor: "rgba(59,130,246,.7)",
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      color: C.text,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: C.surface,
          titleColor: C.text,
          bodyColor: C.textDim,
          borderColor: C.border,
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y}%`,
          },
        },
      },
      scales: {
        y: {
          ticks: { color: C.textDim },
          grid: { color: C.grid },
          beginAtZero: true,
          max: 100,
          title: { display: true, text: "Occupancy %", color: C.textDim, font: { size: 11 } },
        },
        x: {
          ticks: { color: C.textDim },
          grid: { display: false },
        },
      },
    },
  });
}

window.appClearDashboardDates = function () {
  datePreset = "";
  dashboardDateFrom = "";
  dashboardDateTo = "";
  const presetEl = document.getElementById("dashboardDatePreset");
  const customEl = document.getElementById("dashboardDateCustom");
  const df = document.getElementById("dashboardDateFrom");
  const dt = document.getElementById("dashboardDateTo");
  if (presetEl) presetEl.value = "";
  if (customEl) customEl.classList.remove("date-custom--visible");
  if (df) df.value = "";
  if (dt) dt.value = "";
  applyDashboardFilters();
};

export function refreshDashboard() {
  loadDashboard();
}

export function refreshCharts() {
  Object.values(charts).forEach((c) => {
    if (!c) return;
    /* Rebuild options with fresh resolved colours so charts stay legible
       after a theme switch without re-rendering data. */
    const C = chartColors();
    const opts = c.options;
    /* Global font colour — Chart.js v4 respects options.color as the
       default text colour for every text element (labels, ticks, legend,
       tooltip, title). This is the single most important contrast guard. */
    opts.color = C.text;
    opts.maintainAspectRatio = false;
    if (opts.scales) {
      ["x", "y"].forEach((axis) => {
        if (opts.scales[axis]) {
          if (opts.scales[axis].ticks) opts.scales[axis].ticks.color = C.textDim;
          if (opts.scales[axis].grid) {
            opts.scales[axis].grid.color = C.grid;
          }
        }
      });
    }
    if (opts.plugins && opts.plugins.tooltip) {
      opts.plugins.tooltip.backgroundColor = C.surface;
      opts.plugins.tooltip.titleColor = C.text;
      opts.plugins.tooltip.bodyColor = C.textDim;
      opts.plugins.tooltip.borderColor = C.border;
    }
    if (opts.plugins && opts.plugins.legend && opts.plugins.legend.labels) {
      opts.plugins.legend.labels.color = C.textDim;
    }
    c.update();
  });
}

/* Listen for theme changes from the shell and refresh chart colours */
document.addEventListener("themechange", () => {
  if (Object.keys(charts).length) refreshCharts();
});
