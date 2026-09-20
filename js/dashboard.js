/* dashboard.js - Dashboard: summary cards + Chart.js visuals.
   Charts: revenue vs expenses (bar), booking income over time (line),
           expenses by category (doughnut), bookings by status (doughnut).
*/
import { api } from "./auth.js?v=9";
import { utils } from "./utils.js?v=9";
import { CONFIG } from "./config.js?v=9";

let charts = {};
let dashboardRoot = null;
let appRef = null;

/* Resolve a CSS custom property to its actual computed value so Chart.js
   can use it. Chart.js does NOT understand CSS variables on its own —
   passing "var(--color-text-dim)" results in a fallback of black. */
function resolveColor(cssVar) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return val || "#000000";
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

export function createDashboard(_args, ref) {
  appRef = ref;
  const section = document.createElement("section");
  section.className = "dashboard-page";
  section.innerHTML = `
    <div class="stats-grid" id="statsGrid">
      <div class="card card--stat"><div class="card__label">Total Revenue</div><div class="card__value" id="statRevenue">—</div><div class="card__trend" id="trendRevenue"></div></div>
      <div class="card card--stat"><div class="card__label">Total Expenses</div><div class="card__value" id="statExpenses">—</div><div class="card__trend" id="trendExpenses"></div></div>
      <div class="card card--stat"><div class="card__label">Net Profit</div><div class="card__value" id="statNet">—</div><div class="card__trend" id="trendNet"></div></div>
      <div class="card card--stat"><div class="card__label">Active Bookings</div><div class="card__value" id="statBookings">—</div><div class="card__trend" id="trendBookings"></div></div>
      <div class="card card--stat"><div class="card__label">Customers</div><div class="card__value" id="statCustomers">—</div><div class="card__trend" id="trendCustomers"></div></div>
      <div class="card card--stat"><div class="card__label">Low Stock Items</div><div class="card__value" id="statLowStock">—</div><div class="card__trend" id="trendLowStock"></div></div>
    </div>

    <div class="charts-grid">
      <div class="card chart-card">
        <h3>Revenue vs Expenses</h3>
        <canvas id="chartRevenueExpenses" height="160"></canvas>
      </div>
      <div class="card chart-card">
        <h3>Expenses by Category</h3>
        <canvas id="chartExpensesCategory" height="160"></canvas>
      </div>
      <div class="card chart-card chart-card--full">
        <h3>Booking Income Over Time</h3>
        <canvas id="chartBookingIncome" height="150"></canvas>
      </div>
      <div class="card chart-card">
        <h3>Bookings by Status</h3>
        <canvas id="chartBookingsStatus" height="160"></canvas>
      </div>
    </div>
  `;

  // Capture the (still-detached) root so async data loads can query it.
  // querySelector works on detached trees; the element is attached to the
  // document by the router before the await resolves, so DOM queries that
  // depend on being live in-document succeed.
  dashboardRoot = section;

  loadDashboard();

  section._unmount = function unmount() {
    Object.values(charts).forEach((c) => c.destroy());
    charts = {};
    dashboardRoot = null;
  };
  return section;
}

async function loadDashboard() {
  const slot = dashboardRoot && dashboardRoot.querySelector("#statsGrid");
  if (!slot) return;
  try {
    const [finances, bookings, customers, supplies] = await Promise.all([
      api.get("getFinances"),
      api.get("getBookings"),
      api.get("getCustomers"),
      api.get("getSupplies"),
    ]);

    const income = finances.filter((f) => f.type === "income");
    const expenses = finances.filter((f) => f.type === "expense");
    const totalIncome = income.reduce((s, f) => s + Number(f.amount || 0), 0);
    const totalExpenses = expenses.reduce((s, f) => s + Number(f.amount || 0), 0);
    const net = totalIncome - totalExpenses;

    const activeBookings = bookings.filter((b) => b.status === "confirmed");
    const lowStock = supplies.filter((s) => Number(s.quantity || 0) <= Number(s.minStock || 0));

    const el = (id, val, prefix = "") => {
      const e = document.getElementById(id);
      if (e) e.textContent = prefix + val;
    };
    el("statRevenue", utils.formatCurrency(totalIncome));
    el("statExpenses", utils.formatCurrency(totalExpenses));
    el("statNet", utils.formatCurrency(net));
    el("statBookings", activeBookings.length);
    el("statCustomers", customers.length);
    el("statLowStock", lowStock.length);

    document.getElementById("trendNet").textContent = net >= 0
      ? `Net positive: ${utils.formatCurrency(net)}`
      : `Net negative: ${utils.formatCurrency(Math.abs(net))}`;

    renderCharts(finances, bookings, supplies, customers);
  } catch (err) {
    /* If the error is auth-related, the auth:required/auth:denied handler
       already showed the appropriate toast — don't double-notify. */
    const msg = err.message || String(err);
    if (!msg.includes("Authentication required") && !msg.includes("not authorized") && !msg.includes("Invalid token")) {
      appRef.showToast(`Failed to load dashboard: ${msg}`, "error");
    }
    const s = dashboardRoot && dashboardRoot.querySelector("#statsGrid");
    if (s) s.innerHTML = `<div class="empty-state"><p>${utils.escapeHTML(utils.capitalize(msg))}</div></div>`;
  }
}

function renderCharts(finances, bookings, supplies, customers) {
  const ctx = (id) => document.getElementById(id);
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
        },
        x: {
          ticks: { color: C.textDim },
          grid: { display: false },
        },
      },
    },
  });

  /* Chart 4: Bookings by Status (doughnut) — replaces Property Performance,
     which was meaningless with a single property. */
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
