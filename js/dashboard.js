/* dashboard.js - Dashboard: summary cards + Chart.js visuals.
   Charts: revenue vs expenses (bar), booking income over time (line),
          expenses by category (doughnut), property performance (bar).
*/
import { api } from "./auth.js";
import { utils, app } from "./app.js";
import { CONFIG } from "./config.js";

let charts = {};
let dashboardRoot = null;

export function createDashboard(_args, appRef) {
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
        <h3>Property Performance</h3>
        <canvas id="chartPropertyPerformance" height="160"></canvas>
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
    const [finances, bookings, customers, supplies, properties] = await Promise.all([
      api.get("getFinances"),
      api.get("getBookings"),
      api.get("getCustomers"),
      api.get("getSupplies"),
      api.get("getProperties"),
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

    renderCharts(finances, bookings, supplies, properties, customers);
  } catch (err) {
    /* If the error is auth-related, the auth:required/auth:denied handler
       already showed the appropriate toast — don't double-notify. */
    const msg = err.message || String(err);
    if (!msg.includes("Authentication required") && !msg.includes("not authorized") && !msg.includes("Invalid token")) {
      app.showToast(`Failed to load dashboard: ${msg}`, "error");
    }
    const s = dashboardRoot && dashboardRoot.querySelector("#statsGrid");
    if (s) s.innerHTML = `<div class="empty-state"><p>${utils.escapeHTML(utils.capitalize(msg))}</div></div>`;
  }
}

function renderCharts(finances, bookings, supplies, properties, customers) {
  const ctx = (id) => document.getElementById(id);

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
          backgroundColor: "var(--color-surface-2)",
          titleColor: "var(--color-text)",
          bodyColor: "var(--color-text-dim)",
          borderColor: "var(--color-border)",
          borderWidth: 1,
        },
      },
      scales: {
        y: {
          ticks: { color: "var(--color-text-muted)" },
          grid: { color: "var(--color-border)" },
        },
        x: {
          ticks: { color: "var(--color-text-muted)" },
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
            color: "var(--color-text-dim)",
            padding: 16,
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
          backgroundColor: "var(--color-surface-2)",
          titleColor: "var(--color-text)",
          bodyColor: "var(--color-text-dim)",
          borderColor: "var(--color-border)",
          borderWidth: 1,
        },
      },
      scales: {
        y: {
          ticks: { color: "var(--color-text-muted)" },
          grid: { color: "var(--color-border)" },
        },
        x: {
          ticks: { color: "var(--color-text-muted)" },
          grid: { display: false },
        },
      },
    },
  });

  /* Chart 4: Property Performance (bar) — total booking value per property */
  const byProp = bookings.reduce((acc, b) => {
    const key = b.property || "Unknown";
    acc[key] = (acc[key] || 0) + Number(b.total || 0);
    return acc;
  }, {});
  const pLabels = Object.keys(byProp);
  charts.property = new Chart(ctx("chartPropertyPerformance"), {
    type: "bar",
    data: {
      labels: pLabels.length ? pLabels : ["No bookings"],
      datasets: [{
        label: `Total Value (${CONFIG.CURRENCY})`,
        data: pLabels.length ? Object.values(byProp) : [0],
        backgroundColor: "#3b82f6",
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "var(--color-surface-2)",
          titleColor: "var(--color-text)",
          bodyColor: "var(--color-text-dim)",
          borderColor: "var(--color-border)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: "var(--color-text-muted)" },
          grid: { color: "var(--color-border)" },
        },
        y: {
          ticks: { color: "var(--color-text-muted)" },
          grid: { display: false },
        },
      },
    },
  });
}

export function refreshDashboard() {
  loadDashboard();
}
