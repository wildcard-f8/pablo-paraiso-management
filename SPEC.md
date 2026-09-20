# Retreat Management App - Specification

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
- `?action=getProperties` → array of Property records
- `?action=getCalendarEvents&start=ISO&end=ISO` → array of CalendarEvent records

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

## Data Models

### Finance
`{id:"F0001", date:"2024-01-15", type:"income", category:"Booking", description:"Payment B0001", amount:15000, bookingId:"B0001"}`

### Customer
`{id:"C0001", name:"John Smith", email:"john@example.com", phone:"+1234567890", address:"123 Main St", notes:"VIP"}`

### Booking
`{id:"B0001", customerId:"C0001", property:"Lakeside Villa", checkIn:"2024-01-20", checkOut:"2024-01-25", nights:5, total:15000, status:"confirmed", createdAt:"2024-01-01"}`

### Supply
`{id:"S0001", name:"Towels", category:"Linens", quantity:20, unit:"pieces", unitCost:500, lastOrdered:"2024-01-01", supplier:"ABC Supplier", minStock:10}`

### Property
`{id:"P0001", name:"Lakeside Villa", address:"123 Lake View", capacity:6, dailyRate:3000}`

### CalendarEvent
`{id:"evt1", title:"Booking: John Smith", start:"2024-01-20T15:00:00", end:"2024-01-25T11:00:00", allDay:false, color:"#3b82f6", bookingId:"B0001"}`

## Google Sheets Structure

Single spreadsheet with sheets (tabs):
- `Finances`: id, date, type, category, description, amount, bookingId
- `Customers`: id, name, email, phone, address, notes
- `Bookings`: id, customerId, property, checkIn, checkOut, nights, total, status, createdAt
- `Supplies`: id, name, category, quantity, unit, unitCost, lastOrdered, supplier, minStock
- `Properties`: id, name, address, capacity, dailyRate
- `Config`: key, value (for settings)

## Frontend Requirements

- Single-page app, vanilla JS, no frameworks
- Google Identity Services for auth (optional, or simple password)
- Chart.js for graphs (CDN)
- FullCalendar for calendar (CDN)
- Responsive, clean modern design
- Pages/sections:
  1. Dashboard: summary cards + charts (revenue vs expenses, booking income, top properties)
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
- Read/write Google Calendar events (primary calendar)
- CORS headers for GitHub Pages
- Error handling with JSON responses
- Deploy instructions in README
