# Using clasp to Deploy Backend Changes

This document explains how to use [clasp](https://github.com/google/clasp) to deploy
`Code.js` changes to your Google Apps Script project **without** losing Script Properties
(e.g. `AUTHORIZED_USERS`, `SHEET_ID`, `CALENDAR_ID`).

## Prerequisites

```bash
npm install -g @google/clasp
clasp login
```

> Enable the Apps Script API at `script.google.com/home/usersettings` if clasp
> reports "User has not enabled the Apps Script API."

## Setup

1. The `.clasp.json` file (local, not in git) already contains the Script ID:
   ```json
   {
     "scriptId": "1YT3Bf6wYtYEfj1_4IoPuKL3jr9xEJY_Zzl5m7U0Uia-QzzUivIUd6mFP",
     "filePushOrder": ["Code.js", "appsscript.json"]
   }
   ```

2. Pull existing files (to sync local state with the cloud):
   ```bash
   cd backend
   clasp pull
   ```

## Current Deployments

| Deployment ID | Status | URL |
|---|---|---|
| `AKfycbzfgSj6RXHCUDg8_6qStQM4IoMURxpMVGNqPv0rKBIVMLgDO_WpWZbg1xVgahTRLrFP` | Version 22 (live) | `.../exec` in `js/config.js` |
| `AKfycbwpzJRhl08lAkNGML-bNofJEEbDaz80Crz0TlPkdeM` | @HEAD (test) | For testing only |

## Deploy a Change

After editing `Code.js` locally:

```bash
cd backend

# 1. Push code to the Apps Script cloud project (Script Properties preserved)
clasp push

# 2. Create a new version
VERSION=$(clasp version "Updated auth endpoints + merge feature")

# 3. Redeploy the existing production deployment with the new version
clasp deploy \
  --versionId "$VERSION" \
  --deploymentId "AKfycbzfgSj6RXHCUDg8_6qStQM4IoMURxpMVGNqPv0rKBIVMLgDO_WpWZbg1xVgahTRLrFP" \
  --title "Production"
```

The `/exec` URL stays the same — no changes to `js/config.js` are needed.

Or via the Apps Script UI: after `clasp push`, go to the Apps Script editor, click
**Deploy → New deployment** → **Select type: Web app** → **Deploy**.

## Key Benefits

- **Script Properties are preserved** — `AUTHORIZED_USERS`, `SHEET_ID`, `CALENDAR_ID`
  are never overwritten by code pushes.
- **No copy-paste** — `clasp push` syncs your local file to the cloud project.
- **API-based user management** — With the new `addAuthorizedUser` / `removeAuthorizedUser`
  endpoints, you can manage authorized users from a browser or curl without touching the code.

## Managing Authorized Users via API

Once deployed, you can add/remove users with curl (must be authenticated):

```bash
# Get current authorized users (as an authenticated GIS user)
curl "https://script.google.com/macros/s/AKfycbzfgSj6RXHCUDg8_6qStQM4IoMURxpMVGNqPv0rKBIVMLgDO_WpWZbg1xVgahTRLrFP/exec?action=getAuthStatus&_token=GIS_ACCESS_TOKEN"

# Add a user (POST, as an authenticated GIS user)
curl -X POST "https://script.google.com/macros/s/AKfycbzfgSj6RXHCUDg8_6qStQM4IoMURxpMVGNqPv0rKBIVMLgDO_WpWZbg1xVgahTRLrFP/exec?action=addAuthorizedUser&_token=GIS_ACCESS_TOKEN" \
  -H "Content-Type: text/plain" \
  -d '{"email": "teammate@example.com"}'

# Remove a user
curl -X POST "https://script.google.com/macros/s/AKfycbzfgSj6RXHCUDg8_6qStQM4IoMURxpMVGNqPv0rKBIVMLgDO_WpWZbg1xVgahTRLrFP/exec?action=removeAuthorizedUser&_token=GIS_ACCESS_TOKEN" \
  -H "Content-Type: text/plain" \
  -d '{"email": "olduser@example.com"}'
```