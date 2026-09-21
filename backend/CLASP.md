# Using clasp to Deploy Backend Changes

This document explains how to use [clasp](https://github.com/google/clasp) to deploy
`code.gs` changes to your Google Apps Script project **without** losing Script Properties
(e.g. `AUTHORIZED_USERS`, `SHEET_ID`, `CALENDAR_ID`).

## Prerequisites

```bash
npm install -g @google/clasp
clasp login
```

## Setup

1. Get your Script ID from the Apps Script editor URL:
   `https://script.google.com/d/[SCRIPT_ID]/edit`

2. Edit `.clasp.json` and replace `YOUR_SCRIPT_ID_HERE`:
   ```json
   {
     "scriptId": "YOUR_SCRIPT_ID_HERE",
     "filePushOrder": ["code.gs"]
   }
   ```

3. Pull existing files (to sync local state):
   ```bash
   cd backend
   clasp pull
   ```

**Deploy a Change**

After editing `Code.js` locally:

```bash
cd backend
clasp push        # Deploys code to Apps Script (preserves Script Properties)
clasp version "Description of change"
clasp deploy --deploymentId YOUR_DEPLOYMENT_ID --description "Description"
```

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
curl "https://script.google.com/macros/s/[SCRIPT_ID]/exec?action=getAuthStatus&_token=GIS_ACCESS_TOKEN"

# Add a user (POST, as an authenticated GIS user)
curl -X POST "https://script.google.com/macros/s/[SCRIPT_ID]/exec?action=addAuthorizedUser&_token=GIS_ACCESS_TOKEN" \
  -H "Content-Type: text/plain" \
  -d '{"email": "teammate@example.com"}'

# Remove a user
curl -X POST "https://script.google.com/macros/s/[SCRIPT_ID]/exec?action=removeAuthorizedUser&_token=GIS_ACCESS_TOKEN" \
  -H "Content-Type: text/plain" \
  -d '{"email": "olduser@example.com"}'
```
