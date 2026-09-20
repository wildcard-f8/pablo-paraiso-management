# Pablo Paraiso Management App

A zero-cost, single-page property-rental management app for retreat hosts.
Frontend is a static HTML/CSS/ES-module site hosted on **GitHub Pages**;
backend is a **Google Apps Script** web app backed by **Google Sheets** and
**Google Calendar**.

## Project structure

```
retreat-management/
├── SPEC.md              # API contract & data model (source of truth)
├── index.html           # App shell: top bar, sidebar, page slot, modal, toasts
├── css/style.css        # Design tokens, responsive layout, dark/light theme
├── js/
│   ├── config.js        # API_BASE_URL + GOOGLE_CLIENT_ID + demo flags
│   ├── auth.js          # Google Identity Services + fetchGAS envelope wrapper
│   ├── app.js           # Router, navigation, modal API, toasts, seeding
│   ├── dashboard.js     # Summary cards + 4 Chart.js charts
│   ├── finances.js      # Table CRUD + income-vs-expenses bar chart
│   ├── customers.js     # Table CRUD
│   ├── bookings.js      # Table CRUD + calendar link
│   ├── calendar.js      # FullCalendar v6 with event CRUD
│   └── supplies.js      # Table CRUD + low-stock alerts
└── README.md            # This file
```

## Local preview (no backend)

The frontend is pure static files. You can open `index.html` directly in a
browser, but `fetch()` calls to the backend will fail unless
`js/config.js` points at a **deployed** Google Apps Script. To serve files
locally:

```bash
npx serve .      # or: python -m http.server 8000
```

Then open http://localhost:8000. All GET endpoints return
`{success:true, data:[...]}` and POSTs accept JSON bodies — the
`fetchGAS` wrapper in `js/auth.js` unwraps that envelope for you.

## Deploying the backend (Google Apps Script)

The backend code lives in `backend/code.gs`. Follow these steps:

1. Create a new Google Apps Script project at https://script.google.com.
2. Add a Google Sheets file with tabs: `Finances`, `Customers`,
   `Bookings`, `Supplies`, `Properties`, `Config`.
3. Write `code.gs` implementing `doGet(e)` / `doPost(e)` routed by the
   `action` query/body parameter (e.g. `?action=getFinances`).
4. Add the headers below and return JSON `{success, data|error}`.
5. Deploy → **New deployment** → **Web app** →
   *Execute as*: Me · *Who has access*: Anyone, even anonymous.
   *(Access control is enforced in code via `requireAuth()` — see
   "Managing authorized users" below.)*
6. Copy the **Web app URL** into `js/config.js` as `API_BASE_URL`
   (replace `[SCRIPT_ID]`).

Required CORS + JSON headers in your GAS `doGet`/`doPost`:

```js
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://YOURUSERNAME.github.io",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
  };
}
```

> **Tip:** if you want the demo to seed its own empty Sheets, the app calls
> `getProperties` at startup. Ensure the `Properties` tab exists (it can be
> empty on a fresh sheet).

## Google Identity Services (OAuth 2.0)

The app supports **optional** Google sign-in. The auth button (`#authBtn` in
`index.html`) toggles between "Sign in" and "Sign out" based on the
`auth:changed` event dispatched by `auth.js`.

### Step-by-step setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) →
   **APIs & Services** → **Credentials**.
2. Click **+ Create credentials** → **OAuth client ID** →
   **Web application**.
3. Under **Authorized JavaScript origins**, add your GitHub Pages URL, e.g.:
   ```
   https://wildcard-f8.github.io
   ```
4. Under **Authorized redirect URIs**, add:
   ```
   https://wildcard-f8.github.io/retreat-management/
   ```
   *(Not strictly required for GIS — GIS uses a pop-up, not redirects —
   but it does not hurt to include it.)*
4. Click **Create**. Copy the **Client ID** (looks like
   `XXXXXXXXXXXX-XXXXXXXXXX.apps.googleusercontent.com`).
5. Paste it into `js/config.js`:
   ```js
   GOOGLE_CLIENT_ID: "XXXXXXXXXXXX-XXXXXXXXXX.apps.googleusercontent.com",
   ```
6. Commit & push — GitHub Pages redeploys automatically.

### Managing authorized users

Access is restricted to a specific list of Google accounts (an allow-list).
When a user signs in, the backend verifies their GIS token via Google's
tokeninfo endpoint and checks their email against the allow-list. Users
not on the list receive a `403 Forbidden` response and see an "Access denied"
message in the UI.

To set the allow-list:

1. Open your Apps Script project at `script.google.com`.
2. In the Apps Script editor, select `setAuthorizedUsers` from the
   function dropdown.
3. **Edit the email list** inside the function (the line with `/* ← EDIT THIS LINE */`):
   ```js
   var emails = "your-email@gmail.com, teammate@company.com, manager@retreat.com";
   ```
4. Click **▶ Run** → review and grant permissions if prompted.
5. The allow-list is stored in **Script Properties** and persists
   across deployments.

To view the current allow-list at any time:
```js
getAuthorizedUsers()  // prints to Logs (View → Logs)
```

### What users see

| Scenario | What happens in the UI |
|---|---|
| Not signed in | Dashboard shows empty state with "Authentication required" · `#authBtn` pulses orange |
| Signed in, not authorized | Toast: "user@email is not authorized…" · Dashboard shows empty state |
| Signed in and authorized | Dashboard charts and summary cards load normally |

| Event | What fires | What the button does |
|---|---|---|
| `auth.init()` | Loads `https://accounts.google.com/gsi/client`, restores token from `localStorage` | — |
| User clicks **#authBtn** (signed out) | `auth.signIn()` → `tokenClient.requestAccessToken({ prompt: "consent" })` | Button label flips to "Sign out" (CSS `.signed-in` class toggles) |
| User clicks **#authBtn** (signed in) | `auth.signOut()` → clears token, dispatches `auth:changed` | Button label flips to "Sign in" |
| `auth:changed` event | `app.bindAuth()` listens and toggles `.signed-in` class on `#authBtn` | — |
| Every `fetchGAS()` call | If `auth.getToken()` is truthy, adds `Authorization: Bearer <token>` header | Token forwarded to backend |

### Backend token validation (optional)

By default the backend (`code.gs`) is deployed as **"Anyone, even anonymous"**. The
`Authorization` header is forwarded and **validated in code** via
`requireAuth()` — the frontend GIS token is verified against Google's
tokeninfo endpoint and the user's email is checked against an allow-list.
For user-level access control see **Managing authorized users** above.

The app degrades gracefully: if no `GOOGLE_CLIENT_ID` is configured,
the sign-in button is hidden and the app shows an "Authentication required"
message on every API call.

## First-run seeding

On the first run with **empty** Sheets, `app.maybeSeed()` auto-inserts a
handful of demo records (a customer, two finance rows, a towel supply) so
charts and tables render immediately. Set `CONFIG.DEMO.seedIfEmpty = false`
to disable.

## Features

### Dashboard
- Summary cards: **Total Revenue**, **Total Expenses**, **Net Profit**,
  **Active Bookings**, **Customers**, **Low Stock Items**.
- Charts (Chart.js v4):
  1. **Revenue vs Expenses** — bar.
  2. **Expenses by Category** — doughnut.
  3. **Booking Income Over Time** — line.
  4. **Property Performance** — horizontal bar.

### Finances
- Search + type filter (income / expense / all).
- Table CRUD with add/edit modals (date, type, category, description,
  amount, bookingId).
- Inline bar chart: income vs expenses stacked by category.

### Customers
- Searchable table. Add/edit modal with name, email, phone, address,
  notes.

### Bookings
- Search + status filter.
- Add/edit modal with customer & property dropdowns, date pickers,
  nights (auto), total, status.
- Each row links to the calendar entry.

### Calendar
- FullCalendar v6: month / week / day / list views.
- Populated from `getCalendarEvents` (date-range params).
- Click an event → navigate to the booking it references.
- Drag-and-drop + resize to update start/end; new events via date-range
  select or the + button.

### Supplies
- Search + "Low stock only" toggle.
- Table with stock-value = quantity × unitCost.
- Low-stock rows are highlighted (red tint) and a banner summarises how
  many items are below `minStock`.

### Cross-cutting
- **Responsive** layout (sidebar collapses to overlay on mobile).
- **Dark / light** theme toggle (persisted in `localStorage`).
- **Toast** notifications for success / error.
- **Modal** reuse across all CRUD pages.

## CDNs (zero build step)

| Library        | Version | CDN link                                              |
|----------------|---------|-------------------------------------------------------|
| Chart.js       | v4      | `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js` |
| FullCalendar   | v6      | `https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js` |
| Google Identity Services | — | `https://accounts.google.com/gsi/client` (loaded in `auth.js`) |

These are loaded once in `auth.js` (GIS) and at the top of `index.html`
(Chart.js + FullCalendar) so every page module can use them.

## Notes

- **No build step** — the app is plain ES modules. Each page module exports
  `create<Name>(args, appRef)` returning an `unmount()` function.
- The `fetchGAS` wrapper returns the raw `data` (array or object) and
  throws a typed `Error` when `success:false`.
- Demo seeding only adds entities the SPEC documents as POST-able
  (`addCustomer`, `addFinance`, `addSupply`).
- Error states render a friendly empty-state / toast instead of crashing.
