# Pablo Paraiso Management — Backend (Google Apps Script)

Zero-cost REST API backend using Google Apps Script that reads/writes Google
Sheets and Google Calendar. Deployed as a web app with "Anyone, even anonymous"
access.

## Quick Start

1. **Create a Google Apps Script project**

   Go to [script.google.com](https://script.google.com) and start a new project
   (or click **New project** in an existing one).

2. **Paste this code**

   Replace the default `Code.gs` contents with the contents of `code.gs` in
   this folder.

3. **Initialize the database (seeding)**

   In the Apps Script editor, select the `seedDatabase` function from the
   dropdown at the top and click **▶ Run**.

   This will:
   - Create a new Google Sheet named "Pablo Paraiso Management — Database"
   - Set the `SHEET_ID` script property automatically
   - Write headers and sample data to every tab (Finances, Customers,
     Bookings, Supplies, Properties, Config)

   ⚠️ **Important:** The first run will ask you to review and grant
   permissions for `SpreadsheetApp` and `CalendarApp` scopes. Click through
   **Review Permissions** → select your Google account → **Allow**.

4. **Deploy as a web app**

   - Click the **Deploy** button (🚀 icon) → **New deployment**
   - Select **Web app**
   - **Description:** `Pablo Paraiso Management API`
   - **Execute as:** `Me` (your account — required for CalendarApp access)
   - **Who has access:** `Anyone, even anonymous`
   - Click **Deploy**
   - Copy the **Web app URL** — it looks like:
     `https://script.google.com/macros/s/[SCRIPT_ID]/dev`

5. **Configure the frontend**

   In your frontend `config.js`:
   ```js
   const API_BASE_URL = 'https://script.google.com/macros/s/[SCRIPT_ID]/dev';
   ```

## API Reference

### Response Format

Every request returns JSON with the same envelope:

```json
{ "success": true,  "data": ... }
{ "success": false, "error": "..." }
```

### GET Endpoints (`?action=<action>`)

| Action             | Query Params           | Returns                    |
|--------------------|------------------------|----------------------------|
| `getFinances`      | —                      | Array of Finance records   |
| `getCustomers`     | —                      | Array of Customer records  |
| `getBookings`      | —                      | Array of Booking records   |
| `getSupplies`      | —                      | Array of Supply records    |
| `getProperties`    | —                      | Array of Property records  |
| `getCalendarEvents`| `start=ISO&end=ISO`    | Array of CalendarEvent recs|

**Example:**
```
GET https://script.google.com/macros/s/[SCRIPT_ID]/dev?action=getFinances
```

### POST Endpoints (JSON body)

All POST requests send `?action=<action>` as a query parameter and the payload
as a JSON body with `Content-Type: application/json`.

| Action                | Body Fields                                                        |
|-----------------------|--------------------------------------------------------------------|
| `addFinance`          | `date, type, category, description, amount, bookingId`             |
| `updateFinance`       | `id, date, type, category, description, amount, bookingId`        |
| `deleteFinance`       | `id`                                                               |
| `addCustomer`         | `name, email, phone, address, notes`                             |
| `updateCustomer`      | `id, name, email, phone, address, notes`                          |
| `deleteCustomer`      | `id`                                                               |
| `addBooking`          | `customerId, property, checkIn, checkOut, nights, total, status` |
| `updateBooking`       | `id, customerId, property, checkIn, checkOut, nights, total, status` |
| `deleteBooking`       | `id`                                                               |
| `addSupply`           | `name, category, quantity, unit, unitCost, lastOrdered, supplier, minStock` |
| `updateSupply`        | `id, name, category, quantity, unit, unitCost, lastOrdered, supplier, minStock` |
| `deleteSupply`        | `id`                                                               |
| `addCalendarEvent`    | `bookingId, title, start, end, allDay, color`                     |
| `updateCalendarEvent` | `id, title, start, end, allDay, color`                            |
| `deleteCalendarEvent` | `id`                                                               |

**Example (create a finance record):**
```js
fetch(API_BASE_URL + '?action=addFinance', {
  method: 'POST',
  mode: 'cors',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    date: '2024-02-01',
    type: 'income',
    category: 'Booking',
    description: 'Payment for B0002',
    amount: 18000,
    bookingId: 'B0002'
  })
});
```

### Data Models

```
Finance      { id:"F0001", date:"2024-01-15", type:"income", category:"Booking",
               description:"Payment B0001", amount:15000, bookingId:"B0001" }

Customer     { id:"C0001", name:"John Smith", email:"john@example.com",
               phone:"+1234567890", address:"123 Main St", notes:"VIP" }

Booking      { id:"B0001", customerId:"C0001", property:"Lakeside Villa",
               checkIn:"2024-01-20", checkOut:"2024-01-25", nights:5,
               total:15000, status:"confirmed", createdAt:"2024-01-01" }

Supply       { id:"S0001", name:"Towels", category:"Linens", quantity:20,
               unit:"pieces", unitCost:500, lastOrdered:"2024-01-01",
               supplier:"ABC Supplier", minStock:10 }

Property     { id:"P0001", name:"Lakeside Villa", address:"123 Lake View",
               capacity:6, dailyRate:3000 }

CalendarEvent{ id:"evtId...", title:"Booking: John Smith",
               start:"2024-01-20T15:00:00", end:"2024-01-25T11:00:00",
               allDay:false, color:"#3b82f6", bookingId:"B0001" }
```

### ID Generation

IDs are auto-generated when records are **added**:

| Entity     | Prefix | Example |
|------------|--------|---------|
| Finance    | F      | F0001   |
| Customer   | C      | C0001   |
| Booking    | B      | B0001   |
| Supply     | S      | S0001   |
| Property   | P      | P0001   |

The numeric portion increments based on the highest existing ID in the sheet.

## Google Sheets Structure

A single spreadsheet with one tab per entity:

| Tab         | Columns                                                            |
|-------------|--------------------------------------------------------------------|
| `Finances`  | id, date, type, category, description, amount, bookingId          |
| `Customers` | id, name, email, phone, address, notes                            |
| `Bookings`  | id, customerId, property, checkIn, checkOut, nights, total, status, createdAt |
| `Supplies`  | id, name, category, quantity, unit, unitCost, lastOrdered, supplier, minStock |
| `Properties`| id, name, address, capacity, dailyRate                          |
| `Config`    | key, value                                                        |

## Google Calendar Integration

The backend uses the script owner's **primary calendar** (`CalendarApp.getDefaultCalendar()`).
- Events created by `addCalendarEvent` store the `bookingId` and `color` in the
  event description so they can be round-tripped.
- `getCalendarEvents` reads events within the `start`–`end` window.
- All calendar operations (`add`, `update`, `delete`) use the primary calendar.

## CORS

The following headers are set on every response so the GitHub Pages frontend
can call the API directly:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 3600
```

The backend also handles `OPTIONS` preflight requests via `doOptions(e)`.

## Configuration

| Property     | Where                          | Description                          |
|--------------|--------------------------------|--------------------------------------|
| `SHEET_ID`   | Script Properties              | The Google Sheet ID for your database |

To set it manually (if `seedDatabase` doesn't do it for you):

1. In the Apps Script editor, click the **gear icon** → **Project settings**
2. Under **Script properties**, click **Add row**
3. Key: `SHEET_ID` — Value: `[your-spreadsheet-id]`

## Development & Testing

Run `seedDatabase()` from the Apps Script editor to reset all sheets with
sample data. This is safe to re-run; it clears and re-populates all tabs.

```
Script ID (for frontend):  https://script.google.com/home/projects/[SCRIPT_ID]
Deploy as web app:         https://script.google.com/macros/s/[SCRIPT_ID]/dev
```
