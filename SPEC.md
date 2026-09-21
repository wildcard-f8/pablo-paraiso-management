# Pablo Paraiso Management App - Specification

## Architecture

- **Frontend**: Static HTML/CSS/JS, hosted on GitHub Pages (zero cost)
- **Backend**: Google Apps Script web app (zero cost), acts as REST API
- **Data**: Google Sheets
- **Calendar**: Google Calendar API (via Apps Script)

## API Contract

Backend URL: `https://script.google.com/macros/s/[SCRIPT_ID]/dev`

All responses: `{ "success": true, "data": ... }` or `{ "success": false, "error": "..." }`

### GET Endpoints
- `?action=getFinances` → array of Finance records
- `?action=getCustomers` → array of Customer records
- `?action=getBookings` → array of Booking records
- `?action=getSupplies` → array of Supply records
- `?action=getCalendarEvents&start=ISO&end=ISO` → array of CalendarEvent records (from the configured CALENDAR_ID)
- `?action=submitPublicBooking` *(public — no auth)* → `{success, message, bookingId, eventId}`

### POST Endpoints (JSON body)
- `?action=addFinance` body: `{date,type,category,description,amount,bookingId}`
- `?action=updateFinance` body: `{id,date,type,category,description,amount,bookingId}`
- `?action=deleteFinance` body: `{id}`
- `?action=addCustomer` body: `{name,email,phone,address,notes}`
- `?action=updateCustomer` body: `{id,name,email,phone,address,notes}`
- `?action=deleteCustomer` body: `{id}`
- `?action=addBooking` body: `{customerId,property,checkIn,checkOut,nights,total,status}`
- `?action=updateBooking` body: `{id,customerId,property,checkIn,checkOut,nights,total,status}`
- `?action=deleteBooking` body: `{id}`
- `?action=addSupply` body: `{name,category,quantity,unit,unitCost,lastOrdered,supplier,minStock}`
- `?action=updateSupply` body: `{id,name,category,quantity,unit,unitCost,lastOrdered,supplier,minStock}`
- `?action=deleteSupply` body: `{id}`
- `?action=addCalendarEvent` body: `{bookingId,title,start,end,allDay,color}`
- `?action=updateCalendarEvent` body: `{id,title,start,end,allDay,color}`
- `?action=deleteCalendarEvent` body: `{id}`
| `- `?action=submitPublicBooking` *(public — no auth)* body: `{name,email,phone,eventType,date,timeSlot,guests,package,budget,message}` — maps to Booking + Customer + CalendarEvent on the management app's sheet/calendar
| `- `?action=mergeSpreadsheet` body: `{data:{finances[],customers[],bookings[],supplies[]}}` → `{success,added,updated,preserved,conflicts[],errors[]}` — merges a local JSON backup with online data

## Data Models

### Finance
`{id:"F0001", date:"2024-01-15", type:"income", category:"Booking", description:"Payment B0001", amount:15000, bookingId:"B0001", lastModified:"2024-01-15T10:30:00.000Z"}`

### Customer
`{id:"C0001", name:"John Smith", email:"john@example.com", phone:"+123****7890", address:"123 Main St", notes:"VIP", lastModified:"2024-01-15T10:30:00.000Z"}`

### Booking
`{id:"B0001", customerId:"C0001", property:"Pablo Paraiso Pool House", checkIn:"2024-01-20", checkOut:"2024-01-25", nights:5, total:15000, status:"confirmed", createdAt:"2024-01-01", eventType:"Pool Party", guests:20, budget:"", specialRequests:"", lastModified:"2024-01-15T10:30:00.000Z"}`

### Supply
`{id:"S0001", name:"Towels", category:"Linens", quantity:20, unit:"pieces", unitCost:500, lastOrdered:"2024-01-01", supplier:"ABC Supplier", minStock:10, lastModified:"2024-01-15T10:30:00.000Z"}`

**New fields** (for website bookings): `eventType`, `guests`, `budget`, `specialRequests`
**New field** (for offline merge): `lastModified` — ISO timestamp, auto-set on add/update

### CalendarEvent
`{id:"evt1", title:"Booking: John Smith", start:"2024-01-20T15:00:00", end:"2024-01-25T11:00:00", allDay:false, color:"#3b82f6", bookingId:"B0001"}`

## Google Sheets Structure

Single spreadsheet with sheets (tabs):
| - `Finances`: id, date, type, category, description, amount, bookingId, lastModified
| - `Customers`: id, name, email, phone, address, notes, lastModified
| - `Bookings`: id, customerId, property, checkIn, checkOut, nights, total, status, createdAt, eventType, guests, budget, specialRequests, lastModified
| - `Supplies`: id, name, category, quantity, unit, unitCost, lastOrdered, supplier, minStock, lastModified
|- `Config`: key, value (for settings)
|- `ActivityLog`: Timestamp, Action, Status, Request Data (JSON), Details, Client IP
|- `WebBookings`: id, timestamp, name, email, phone, eventType, date, timeSlot, guests, package, budget, duration, calendarEventId, specialRequests, status, details

### Script Properties
|- `SHEET_ID`: Google Sheet ID (set via `seedDatabase()` or manually)
|- `CALENDAR_ID`: Google Calendar ID (e.g. `c_1234@group.calendar.google.com` or `"primary"`). If unset, falls back to the script owner's default calendar.
|- `AUTHORIZED_USERS`: comma-separated list of authorized Google emails (for management app auth only — the public `submitPublicBooking` endpoint bypasses auth)

## Frontend Requirements

- Single-page app, vanilla JS, no frameworks
- Google Identity Services for auth (optional, or simple password)
- Chart.js for graphs (CDN)
- FullCalendar for calendar (CDN)
- Responsive, clean modern design
- Pages/sections:
  1. Dashboard: summary cards + charts (revenue vs expenses, booking income, booking status)
  2. Finances: table + add/edit modal + bar chart (income vs expenses by category)
  3. Customers: table + add/edit modal
  4. Bookings: table + add/edit modal + link to calendar
  5. Calendar: FullCalendar with booking events
  6. Supplies: table + add/edit modal + low stock alerts
- Config: `config.js` with `API_BASE_URL` and `GOOGLE_CLIENT_ID`
- Dark/light mode toggle
- All data loaded from backend API

## Backend Requirements

- Google Apps Script (`code.gs`) deployed as web app
- `doGet(e)` routes by `action` parameter
- `doPost(e)` parses JSON body, routes by `action` parameter
- Read/write Google Sheets by tab name
- Read/write Google Calendar events (configured CALENDAR_ID, not hardcoded to primary)
- CORS headers for cross-origin requests from GitHub Pages
- Error handling with JSON responses
|- Deploy instructions in README
|
|## Offline Export / Import (Merge)
|
|**Export**: Click the 💾 **Export** button in the top bar to download a JSON file (`pablo-paraiso-backup-YYYY-MM-DD.json`) containing all Finances, Customers, Bookings, Supplies, and Calendar events. This file is a complete snapshot for local backup.
|
|**Import (Merge)**: Click the ⬆ **Import** button, select a previously exported JSON file, and the app POSTs it to `mergeSpreadsheet`. The backend merges local data with online data using the following rules:
|- **New local records** (ID not in online sheet) → inserted online with a new regenerated ID
|- **Updated local records** (ID exists online, local `lastModified` is newer) → online record updated
|- **Online-only records** (e.g. new web bookings while offline) → preserved untouched
|- **Conflicts** (same ID, both changed, timestamps equal or both missing) → flagged; online version kept
|- **Deletions** → never propagated (a deleted local record does not delete the online record)
|
|The merge processes entities in dependency order (Customers → Bookings → Finances) and rewrites foreign-key IDs (e.g. `bookingId` in Finances) when new IDs are generated during insertion, preserving referential integrity.
|
|**Requirement**: The `lastModified` field must exist on all entity sheets. The backend auto-migrates existing sheets by adding the column (backfilled from `createdAt` for Bookings, current time for others). New records and updates always set `lastModified` to the current timestamp.
