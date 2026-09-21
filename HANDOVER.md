# Handover Guide — Pablo Paraiso Management

Transferring the full app to a new owner. All server-side operations run under
the GAS script owner's Google identity (the web app is deployed as
"Execute as: Me"), so ownership of the script project, Google Sheet, Calendar,
and Drive folder must all be transferred.

## Quick Summary

| Resource         | Where it lives     | What to transfer                  |
|------------------|--------------------|-----------------------------------|
| GAS script       | script.google.com  | Share → Make owner                |
| Google Sheet     | docs.google.com    | Share → Make owner                |
| Calendar         | calendar.google.com| Share with "Make changes and manage sharing" |
| Drive images     | drive.google.com   | Share folder → Make owner         |
| Frontend         | GitHub Pages       | Transfer repo or rebuild from fork|
| GIS Client ID    | Google Cloud Console| Transfer or recreate             |

---

## Approach A: Transfer ownership (keeps same GAS URL)

### Step 1 — Transfer the GAS script project

1. Open the Apps Script project: `script.google.com`
2. Click **"Share"** (top-right)
3. Add the new owner's email
4. Change their role to **"Owner"**
5. Click **Send**

> After this, the script runs under the new owner's Google account. All
> Drive/Spreadsheet/Calendar calls use their identity.

### Step 2 — Transfer the Google Sheet

1. Open the spreadsheet (ID is in the `SHEET_ID` script property)
2. Click **Share** → add new owner's email → **Make owner**
3. Click **Share** to confirm

### Step 3 — Transfer calendar access

Consumer Gmail calendars cannot be fully "transferred" — only shared.
To give the new owner full calendar access:

1. Calendar settings → "Share with others people"
2. Add the new owner's email
3. Set permission to **"Make changes and manage sharing"**

If the new owner needs true calendar ownership, they should create a new
calendar in their own account and update the `CALENDAR_ID` script property
(see `setCalendarId()` in Code.js).

### Step 4 — Transfer Drive folder

1. Go to Google Drive
2. Find the folder **"Pablo Paraiso - Website Images"**
3. Right-click → **Share** → add new owner → **Make owner**

### Step 5 — Update authorized users

1. In the Apps Script editor, open the **Executions** or **Logs** panel
2. Find `requireAuth()` → `isUserAuthorized()` → `getAuthorizedUsers()`
3. Edit the email list via `setAuthorizedUsers()` function (edit the
   email list in the function body, then click ▶ Run)

---

## Approach B: New owner deploys from scratch

### Prerequisites

- A Google account (any Gmail address)

### Step 1 — Create the Google Sheet

The new owner doesn't need to create a sheet manually. The `seedDatabase()`
function in the backend will create it automatically (it checks for the
`SHEET_ID` script property; if missing, creates a new spreadsheet).

### Step 2 — Deploy the backend

1. Go to `script.google.com` → **New project**
2. Replace the default `Code.gs` content with `backend/Code.js`
3. Ensure `appsscript.json` is also copied to the project
4. Install clasp (optional, for future updates):
   ```bash
   npm install -g @google/clasp
   clasp login
   clasp create --title "Pablo Paraiso Management Backend" --type sheets
   clasp push
   ```
5. Set up script properties:
   - `SHEET_ID` — (leave unset; `seedDatabase()` will set it)
   - `CALENDAR_ID` — `"primary"` (or a dedicated calendar ID)
   - `AUTHORIZED_USERS` — `"new-owner@example.com"` (comma-separated emails)
6. Run `seedDatabase()` (▶ Run) — creates the spreadsheet with all sheets and data
7. Run `seedWebsiteContent()` (▶ Run) — populates website content keys in Config
8. Run `setAuthorizedUsers()` (▶ Run) — verify the authorized users list

### Step 3 — Deploy as web app

1. In the Apps Script editor: **Deploy** → **New deployment**
2. Select **"Web app"**
3. Description: `"Production: Pablo Paraiso Management"`
4. Execute as: **"Me"**
5. Who has access: **"Anyone, even anonymous"**
6. Click **Deploy** → copy the **Web app URL**

### Step 4 — Update frontend config

In `js/config.js`:
```javascript
API_BASE_URL: "https://script.google.com/macros/s/[NEW_SCRIPT_ID]/exec",
```

If using the same GitHub repo, commit and push this change. If using a fork,
update the config in the fork and deploy to GitHub Pages.

### Step 5 — Deploy the frontend

Option 1: Push to the same GitHub repo (if transferred)
```bash
git add -A
git commit -m "Update backend URL after handover"
git push
```

Option 2: Fork + deploy to GitHub Pages
1. Fork the repository
2. Update `js/config.js` with the new `API_BASE_URL`
3. In GitHub → Settings → Pages → set source to `main` branch

### Step 6 — Recreate GIS OAuth client

The Google Identity Services client ID in `js/config.js` (`GOOGLE_CLIENT_ID`)
is tied to the original owner's Google Cloud project. The new owner should:

1. Go to `console.cloud.google.com/`
2. Create a new project (or use an existing one)
3. Enable "Google Identity Services" API
4. Create OAuth 2.0 Client ID (Application type: "Web application")
5. Add authorized URLs:
   - `https://wildcard-f8.github.io` (or your GitHub Pages domain)
6. Copy the **Client ID** and update `js/config.js`

> The client ID can also be shared between owners if the Cloud project is
> transferred. But creating a new one is cleaner.

### Step 7 — Verify

1. Load the management app in an incognito window
2. Click **Sign In** → should show the GIS sign-in dialog
3. Sign in with the new owner's email (must be in `AUTHORIZED_USERS`)
4. Navigate to **Website** → should show content cards
5. Upload an image via the 📷 button → should upload to the new owner's Drive
6. Click **Dashboard** → should show charts without errors

---

## Script Properties Reference

| Property           | Description                                                  |
|--------------------|--------------------------------------------------------------|
| `SHEET_ID`         | The Google Sheet ID (set automatically by `seedDatabase()`) |
| `CALENDAR_ID`      | `"primary"` or a calendar ID like `user@group.calendar.google.com` |
| `AUTHORIZED_USERS` | Comma-separated list of allowed emails                       |

To view or edit script properties:
- In Apps Script editor → **Project Settings** (gear icon) → **Script properties**
- Or via `PropertiesService.getScriptProperties()` in the code
- Or via `clasp` → `clasp open` → Project Settings
