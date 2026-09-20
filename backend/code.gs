/**
 * ============================================================================
 * Pablo Paraiso Management - Google Apps Script Backend (code.gs)
 * ============================================================================
 * REST API for property rental management webapp.
 * Reads/writes Google Sheets and Google Calendar. Zero cost (Apps Script).
 *
 * Deploy as Web App:
 *   - Execute as: "Me" (script owner)
 *   - Who has access: "Anyone, even anonymous"  ◄ auth is enforced in code
 *   - Backend URL: https://script.google.com/macros/s/[SCRIPT_ID]/exec
 *
 * All responses: { "success": true, "data": ... } or { "success": false, "error": "..." }
 * ============================================================================
 */

/* ==========================================================================
 * CONFIGURATION
 * ========================================================================== */

var HEADERS = {
  Finances:    ['id', 'date', 'type', 'category', 'description', 'amount', 'bookingId'],
  Customers:   ['id', 'name', 'email', 'phone', 'address', 'notes'],
  Bookings:    ['id', 'customerId', 'property', 'checkIn', 'checkOut', 'nights', 'total', 'status', 'createdAt'],
  Supplies:    ['id', 'name', 'category', 'quantity', 'unit', 'unitCost', 'lastOrdered', 'supplier', 'minStock'],
  Properties:  ['id', 'name', 'address', 'capacity', 'dailyRate'],
  Config:      ['key', 'value']
};

// Fields that should be converted to numbers when reading/writing
var NUMERIC_FIELDS = {
  Finances:   ['amount'],
  Customers:  [],
  Bookings:   ['nights', 'total'],
  Supplies:   ['quantity', 'unitCost', 'minStock'],
  Properties: ['capacity', 'dailyRate'],
  Config:     []
};

// ID prefix mapping for auto-generation (e.g. F0001, C0001, B0001, S0001, P0001)
var ID_PREFIXES = {
  Finances:   'F',
  Customers:  'C',
  Bookings:   'B',
  Supplies:   'S',
  Properties: 'P'
};

// Sheet name mapping (singular form of tab for error messages)
var SINGULAR = {
  Finances:   'Finance',
  Customers:  'Customer',
  Bookings:   'Booking',
  Supplies:   'Supply',
  Properties: 'Property'
};


/* ==========================================================================
 * UTILITY FUNCTIONS
 * ========================================================================== */

/**
 * Opens the Google Sheet identified by the SHEET_ID script property.
 * @return {Spreadsheet}
 */
function getSpreadsheet() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var sheetId = scriptProperties.getProperty('SHEET_ID');
  if (!sheetId) {
    throw new Error('SHEET_ID script property is not set. Run seedDatabase() or set it manually.');
  }
  return SpreadsheetApp.openById(sheetId);
}

/**
 * Gets a sheet (tab) by name, creating it with headers if it does not exist.
 * @param {string} tabName - The tab name (e.g. "Finances").
 * @return {Sheet}
 */
function getSheet(tabName) {
  var spreadsheet = getSpreadsheet();
  var sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(tabName);
    sheet.appendRow(HEADERS[tabName]);
  }
  return sheet;
}

/**
 * Converts a numeric value, returning empty string for null/undefined/empty.
 * @param {*} value
 * @return {number|string}
 */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  var num = parseFloat(value);
  return isNaN(num) ? value : num;
}

/**
 * Converts an integer value, returning empty string for null/undefined/empty.
 * @param {*} value
 * @return {number|string}
 */
function toInteger(value) {
  if (value === null || value === undefined || value === '') return '';
  var num = parseInt(value, 10);
  return isNaN(num) ? value : num;
}

/**
 * Formats a Date or date string as "YYYY-MM-DDTHH:MM:SS" (script timezone).
 * @param {Date|string} date
 * @return {string}
 */
function formatDate(date) {
  if (!date) return '';
  var d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  var pad = function(n) { return ('0' + n).slice(-2); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
         'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

/**
 * Generates an auto-incrementing ID with a prefix and 4-digit zero padding.
 * @param {string} tabName - Sheet tab name.
 * @param {string} prefix  - Letter prefix (e.g. "F").
 * @return {string} e.g. "F0001"
 */
function generateId(tabName, prefix) {
  var sheet = getSheet(tabName);
  var data = sheet.getDataRange().getValues();
  var max = 0;
  if (data.length > 0) {
    var headers = data[0];
    var idIndex = headers.indexOf('id');
    if (idIndex === -1) {
      return prefix + '0001';
    }
    for (var i = 1; i < data.length; i++) {
      var cell = data[i][idIndex];
      if (cell && cell.toString().indexOf(prefix) === 0) {
        var num = parseInt(cell.toString().substring(prefix.length), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    }
  }
  max++;
  return prefix + ('0000' + max).slice(-4);
}

/**
 * Sends a JSON response with CORS headers.
 * @param {Object} obj   - Response body object.
 * @param {number} [status=200]
 * @return {ContentOutput}
 */
function sendJson(obj, status) {
  status = status || 200;
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  // Set MIME type — try JSON first, fall back to TEXT
  try {
    output.setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    try { output.setMimeType(ContentService.MimeType.TEXT); } catch (e2) { /* ignore */ }
  }
  // Set CORS headers — wrap each in try-catch because some Apps Script
  // runtimes do not expose setHeader on TextOutput.
  // https://developers.google.com/apps-script/reference/content/text-output
  // reports setHeader as available, but if the runtime returns a different
  // type from createTextOutput(), this will silently skip.
  var corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '3600'
  };
  for (var key in corsHeaders) {
    try { output.setHeader(key, corsHeaders[key]); } catch (e) { /* skip */ }
  }
  return output;
}

/**
 * Sends a success JSON response: { "success": true, "data": ... }
 * @param {*} data
 * @return {ContentOutput}
 */
function sendSuccess(data) {
  return sendJson({ success: true, data: data }, 200);
}

/**
 * Sends an error JSON response: { "success": false, "error": "..." }
 * @param {string} message
 * @param {number} [status=400]
 * @return {ContentOutput}
 */
function sendError(message, status) {
  status = status || 400;
  return sendJson({ success: false, error: message }, status);
}


/* ==========================================================================
 * DATA CONVERSION HELPERS
 * ========================================================================== */

/**
 * Converts all rows in a sheet to an array of record objects.
 * Reads header row as field names; converts numeric fields to numbers.
 * @param {Sheet} sheet
 * @return {Array<Object>}
 */
function sheetToRecords(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var tabName = sheet.getName();
  var numericFields = NUMERIC_FIELDS[tabName] || [];
  var records = [];
  for (var i = 1; i < data.length; i++) {
    var record = {};
    for (var j = 0; j < headers.length; j++) {
      var value = data[i][j];
      if (numericFields.indexOf(headers[j]) !== -1) {
        record[headers[j]] = toNumber(value);
      } else {
        record[headers[j]] = value;
      }
    }
    records.push(record);
  }
  return records;
}

/**
 * Builds a row array (ordered by headers) from a record object.
 * @param {Object} record
 * @param {Array<string>} headers
 * @return {Array<*>}
 */
function recordToRow(record, headers) {
  return headers.map(function(h) {
    return (record[h] !== undefined && record[h] !== null) ? record[h] : '';
  });
}

/**
 * Reads a single record from a specific sheet row.
 * @param {Sheet} sheet
 * @param {number} row      - 1-based sheet row number (including header row).
 * @param {Array<string>} headers
 * @return {Object}
 */
function getRecordByRow(sheet, row, headers) {
  var range = sheet.getRange(row, 1, 1, headers.length);
  var values = range.getValues()[0];
  var record = {};
  for (var i = 0; i < headers.length; i++) {
    record[headers[i]] = values[i];
  }
  return record;
}

/**
 * Finds the 1-based sheet row index of a record by its ID.
 * Returns -1 if not found.
 * @param {Sheet} sheet
 * @param {string} id
 * @return {number}
 */
function findRecordRow(sheet, id) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return -1;
  var idIndex = data[0].indexOf('id');
  if (idIndex === -1) return -1;
  for (var i = 1; i < data.length; i++) {
    var cell = data[i][idIndex];
    if (cell && cell.toString() === id.toString()) {
      return i + 1; // data[0] is row 1 (header), data[1] is row 2, etc.
    }
  }
  return -1;
}


/* ==========================================================================
 * GENERIC RECORD CRUD
 * ========================================================================== */

/**
 * Adds a new record to a sheet with an auto-generated ID.
 * @param {string} tabName
 * @param {Object} data   - Record fields (without id).
 * @return {Object} The created record (with id).
 */
function addRecord(tabName, data) {
  var sheet = getSheet(tabName);
  var headers = HEADERS[tabName];
  var prefix = ID_PREFIXES[tabName];
  var id = generateId(tabName, prefix);
  data.id = id;

  // Convert numeric fields
  var numericFields = NUMERIC_FIELDS[tabName] || [];
  numericFields.forEach(function(f) {
    if (data[f] !== undefined && data[f] !== null) {
      data[f] = toNumber(data[f]);
    }
  });

  // Special: set createdAt for new Bookings
  if (tabName === 'Bookings') {
    if (!data.createdAt) {
      data.createdAt = formatDate(new Date());
    }
  }

  var row = recordToRow(data, headers);
  sheet.appendRow(row);
  return data;
}

/**
 * Updates an existing record by ID. Fields not provided in `data` are preserved.
 * @param {string} tabName
 * @param {Object} data   - Must contain `id` plus updatable fields.
 * @return {Object} The updated record.
 */
function updateRecord(tabName, data) {
  var sheet = getSheet(tabName);
  var sheetRow = findRecordRow(sheet, data.id);
  if (sheetRow === -1) {
    throw new Error(SINGULAR[tabName] + ' not found: ' + data.id);
  }
  var headers = HEADERS[tabName];

  // Read existing record and merge (new values take priority)
  var existing = getRecordByRow(sheet, sheetRow, headers);
  var merged = {};
  for (var key in existing) {
    if (existing.hasOwnProperty(key)) merged[key] = existing[key];
  }
  for (var dKey in data) {
    if (data.hasOwnProperty(dKey)) merged[dKey] = data[dKey];
  }

  // Convert numeric fields
  var numericFields = NUMERIC_FIELDS[tabName] || [];
  numericFields.forEach(function(f) {
    if (merged[f] !== undefined && merged[f] !== null && merged[f] !== '') {
      merged[f] = toNumber(merged[f]);
    }
  });

  // Preserve createdAt for Bookings
  if (tabName === 'Bookings') {
    if (!merged.createdAt) {
      merged.createdAt = existing.createdAt || formatDate(new Date());
    }
  }

  // Ensure id is preserved
  merged.id = data.id || existing.id;

  var row = recordToRow(merged, headers);
  sheet.getRange(sheetRow, 1, 1, headers.length).setValues([row]);
  return merged;
}

/**
 * Deletes a record by ID from a sheet.
 * @param {string} tabName
 * @param {string} id
 * @return {Object} { success: true, id: ... }
 */
function deleteRecord(tabName, id) {
  var sheet = getSheet(tabName);
  var sheetRow = findRecordRow(sheet, id);
  if (sheetRow === -1) {
    throw new Error(SINGULAR[tabName] + ' not found: ' + id);
  }
  sheet.deleteRow(sheetRow);
  return { id: id };
}


/* ==========================================================================\\n * AUTHORIZATION — Google Identity Services token verification\\n *\\n * The frontend sends the GIS access token as a _token **query parameter**\\n * (not in the Authorization header) so that the browser treats each request\\n * as a CORS "simple request" and skips the OPTIONS preflight.\\n * Google Apps Script's web-app proxy does not return CORS headers on OPTIONS\\n * responses, so preflight-based requests fail with "Failed to fetch".\\n * Simple requests bypass the proxy's OPTIONS handling entirely.\\n *\\n * For POST requests, Content-Type is sent as text/plain (a "simple" Content-Type)\\n * so the body is also treated as a simple request.\\n *\\n * The backend still accepts the Authorization: Bearer header as a fallback.\\n *\\n * Token is verified via Google's oauth2.googleapis.com/tokeninfo endpoint\\n * and the user's email is checked against an allow-list stored in Script\\n * Properties (key: AUTHORIZED_USERS — comma-separated emails).\\n *\\n * Manage the allow-list via the Apps Script editor:\\n *   setAuthorizedUsers()   — edits the email list in code and clicks ▶\\n *   or edit PropertiesService.getScriptProperties().setProperty('AUTHORIZED_USERS', ...)\\n * ==========================================================================*/

/**
 * Returns the list of authorized user emails (lowercased, trimmed).
 * @return {Array<string>}
 */
function getAuthorizedUsers() {
  var raw = PropertiesService.getScriptProperties().getProperty('AUTHORIZED_USERS') || '';
  return raw
    .split(',')
    .map(function(e) { return e.trim().toLowerCase(); })
    .filter(function(e) { return e; });
}

/**
 * Checks if an email is in the authorized users list.
 * @param {string} email
 * @return {boolean}
 */
function isUserAuthorized(email) {
  if (!email) return false;
  return getAuthorizedUsers().includes(email.toLowerCase());
}

/**
 * Sets the authorized users list (comma-separated emails).
 * Run from the Apps Script editor — edit the email list below first,
 * then click ▶. The list is stored in Script Properties.
 */
function setAuthorizedUsers() {
  var emails = "your-email@gmail.com, teammate@company.com";  /* ← EDIT THIS LINE */
  PropertiesService.getScriptProperties().setProperty('AUTHORIZED_USERS', emails);
  Logger.log('Authorized users set to: ' + emails);
}

/**
 * Verifies the GIS access token in the Authorization header and checks
 * if the user is authorized. Returns an auth result object.
 * @param {Object} e — the doGet/doPost event parameter
 * @return {{valid: boolean, email: ?string, status: number, error: ?string}}
 */
function requireAuth(e) {
  // Extract token from Authorization header OR _token query parameter.
  // The frontend sends the GIS token as a _token query param (not the
  // Authorization header) so the browser treats the request as a CORS
  // "simple request" and skips the OPTIONS preflight — which Google's
  // web-app proxy does not handle with proper CORS headers.
  var token = null;
  if (e && e.headers) {
    var authHeader = e.headers.Authorization || e.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  // Fallback / primary path: token via query parameter for simple requests.
  if (!token && e && e.parameter) {
    token = e.parameter._token || e.parameter.token;
  }

  if (!token) {
    return { valid: false, email: null, status: 401, error: 'Authentication required. Please sign in.' };
  }

  try {
    var response = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?access_token=' + token
    );
    var info = JSON.parse(response.getContentText());

    if (info.error || !info.email) {
      return { valid: false, email: null, status: 401, error: 'Invalid token. Please sign in again.' };
    }

    if (!isUserAuthorized(info.email)) {
      return {
        valid: false,
        email: info.email,
        status: 403,
        error: info.email + ' is not authorized to access this application. Contact the owner to be added to the allow-list.'
      };
    }

    return { valid: true, email: info.email, status: 200, error: null };
  } catch (err) {
    return { valid: false, email: null, status: 500, error: 'Token verification failed: ' + err.message };
  }
}

/* ==========================================================================\n * GET ROUTING — doGet(e)  (action in e.parameter)\n * ========================================================================== */

function doGet(e) {
  /* Require valid GIS token + allow-list check */
  var _ga = requireAuth(e);
  if (!_ga.valid) {
    return sendError(_ga.error, _ga.status);
  }
  try {
    var action = e.parameter.action;
    if (!action) {
      return sendError('Missing "action" parameter');
    }

    var result;
    switch (action) {
      case 'getFinances':       result = getFinances(); break;
      case 'getCustomers':      result = getCustomers(); break;
      case 'getBookings':       result = getBookings(); break;
      case 'getSupplies':       result = getSupplies(); break;
      case 'getProperties':     result = getProperties(); break;
      case 'getCalendarEvents': result = getCalendarEvents(e.parameter.start, e.parameter.end); break;
      default:
        return sendError('Unknown action: ' + action);
    }
    return sendSuccess(result);
  } catch (err) {
    return sendError(err.message || String(err), 500);
  }
}


/* ==========================================================================
 * POST ROUTING — doPost(e)  (action in e.parameter, JSON body in e.postData)
 * ========================================================================== */

function doPost(e) {
  /* Require valid GIS token + allow-list check */
  var _ga = requireAuth(e);
  if (!_ga.valid) {
    return sendError(_ga.error, _ga.status);
  }
  try {
    var action = e.parameter.action;
    if (!action) {
      return sendError('Missing "action" parameter');
    }

    // Parse JSON body
    var data;
    if (e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        return sendError('Invalid JSON body: ' + jsonErr.message);
      }
    } else {
      return sendError('Request body is required');
    }

    var result;
    switch (action) {
      // Finances
      case 'addFinance':    result = addFinance(data); break;
      case 'updateFinance': result = updateFinance(data); break;
      case 'deleteFinance': result = deleteFinance(data); break;
      // Customers
      case 'addCustomer':    result = addCustomer(data); break;
      case 'updateCustomer': result = updateCustomer(data); break;
      case 'deleteCustomer': result = deleteCustomer(data); break;
      // Bookings
      case 'addBooking':    result = addBooking(data); break;
      case 'updateBooking': result = updateBooking(data); break;
      case 'deleteBooking': result = deleteBooking(data); break;
      // Supplies
      case 'addSupply':    result = addSupply(data); break;
      case 'updateSupply': result = updateSupply(data); break;
      case 'deleteSupply': result = deleteSupply(data); break;
      // Calendar
      case 'addCalendarEvent':    result = addCalendarEvent(data); break;
      case 'updateCalendarEvent': result = updateCalendarEvent(data); break;
      case 'deleteCalendarEvent': result = deleteCalendarEvent(data); break;
      default:
        return sendError('Unknown action: ' + action);
    }
    return sendSuccess(result);
  } catch (err) {
    return sendError(err.message || String(err), 500);
  }
}

/**
 * Handles CORS preflight (OPTIONS) requests.
 */
function doOptions(e) {
  return sendSuccess(null);
}

/**
 * Diagnostic: logs what methods are available on the TextOutput object.
 * Run this from the Apps Script editor (▶ Run) if setHeader fails.
 */
function debugTextOutput() {
  var output = ContentService.createTextOutput('test');
  Logger.log('typeof output: ' + typeof output);
  Logger.log('output.constructor.name: ' + (output.constructor ? output.constructor.name : 'none'));
  Logger.log('typeof output.setHeader: ' + typeof output.setHeader);
  Logger.log('typeof output.setMimeType: ' + typeof output.setMimeType);
  Logger.log('typeof output.setContent: ' + typeof output.setContent);
  Logger.log('ContentService available: ' + (typeof ContentService !== 'undefined'));
  Logger.log('MimeType.JSON: ' + ContentService.MimeType.JSON);
  return output;
}


/* ==========================================================================
 * GET ENDPOINTS — return arrays of records
 * ========================================================================== */

function getFinances()    { return sheetToRecords(getSheet('Finances')); }
function getCustomers()   { return sheetToRecords(getSheet('Customers')); }
function getBookings()    { return sheetToRecords(getSheet('Bookings')); }
function getSupplies()    { return sheetToRecords(getSheet('Supplies')); }
function getProperties()  { return sheetToRecords(getSheet('Properties')); }


/* ==========================================================================
 * CALENDAR ENDPOINTS
 * ========================================================================== */

/**
 * Returns calendar events within the [start, end] window from the
 * script owner's primary Google Calendar.
 * @param {string} startISO - Optional ISO date string.
 * @param {string} endISO   - Optional ISO date string.
 * @return {Array<Object>} Array of CalendarEvent records.
 */
function getCalendarEvents(startISO, endISO) {
  var calendar = CalendarApp.getDefaultCalendar();
  var start = startISO ? new Date(startISO) : new Date();
  var end   = endISO   ? new Date(endISO)   : new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
  var events = calendar.getEvents(start, end);
  var result = [];
  for (var i = 0; i < events.length; i++) {
    result.push(parseCalendarEvent(events[i]));
  }
  return result;
}

/**
 * Creates a new calendar event on the primary calendar.
 * @param {Object} data - { bookingId, title, start, end, allDay, color }
 * @return {Object} The created CalendarEvent record.
 */
function addCalendarEvent(data) {
  var calendar = CalendarApp.getDefaultCalendar();

  var start = new Date(data.start);
  var end   = new Date(data.end);

  var options = {};
  // Store bookingId + color in the description so we can round-trip them
  var descParts = [];
  if (data.bookingId) descParts.push(data.bookingId);
  if (data.color)     descParts.push(data.color);
  if (descParts.length > 0) {
    options.description = descParts.join('|');
  }

  var event;
  if (data.allDay) {
    event = calendar.createAllDayEvent(data.title, start, options);
  } else {
    event = calendar.createEvent(data.title, start, end, options);
  }

  // Attempt to set the color (may not work for arbitrary hex, but harmless)
  if (data.color) {
    try { event.setColor(data.color); } catch (err) { /* ignore color errors */ }
  }

  return parseCalendarEvent(event);
}

/**
 * Updates an existing calendar event by its Google Calendar event ID.
 * @param {Object} data - { id, title, start, end, allDay, color }
 * @return {Object} The updated CalendarEvent record.
 */
function updateCalendarEvent(data) {
  var calendar = CalendarApp.getDefaultCalendar();
  var event = getEventByIdSafe(calendar, data.id);
  if (!event) {
    throw new Error('Calendar event not found: ' + data.id);
  }

  // Preserve existing description metadata
  var desc = event.getDescription() || '';
  var parts = desc ? desc.split('|') : [];
  var existingBookingId = parts[0] || '';
  var existingColor     = parts[1] || '';

  var bookingId = data.bookingId || existingBookingId;
  var color     = data.color     || existingColor;

  // Update title
  if (data.title !== undefined) {
    event.setTitle(data.title);
  }

  // Update start/end (only for timed events via basic API;
  // all-day events require setAllDayDate which is more complex)
  if (data.start !== undefined && !data.allDay) {
    event.setStartTime(new Date(data.start));
  }
  if (data.end !== undefined && !data.allDay) {
    event.setEndTime(new Date(data.end));
  }

  // Update description (bookingId + color)
  var descParts = [];
  if (bookingId) descParts.push(bookingId);
  if (color)     descParts.push(color);
  event.setDescription(descParts.length > 0 ? descParts.join('|') : '');

  // Attempt color
  if (color) {
    try { event.setColor(color); } catch (err) { /* ignore */ }
  }

  return parseCalendarEvent(event);
}

/**
 * Deletes a calendar event by its Google Calendar event ID.
 * @param {Object} data - { id }
 * @return {Object} { success: true, id: ... }
 */
function deleteCalendarEvent(data) {
  var calendar = CalendarApp.getDefaultCalendar();
  var event = getEventByIdSafe(calendar, data.id);
  if (!event) {
    throw new Error('Calendar event not found: ' + data.id);
  }
  event.deleteEvent();
  return { id: data.id };
}

/**
 * Safely retrieves a CalendarEvent by its iCal UID / event ID.
 * Tries Calendar.getEventById first, then falls back to searching.
 * @param {Calendar} calendar
 * @param {string} id
 * @return {CalendarEvent|null}
 */
function getEventByIdSafe(calendar, id) {
  if (!id) return null;
  try {
    var event = calendar.getEventById(id);
    if (event) return event;
  } catch (err) { /* fall through to search */ }

  // Fallback: search a wide date range
  try {
    var now = new Date();
    var searchStart = new Date(now.getFullYear() - 1, 0, 1);
    var searchEnd   = new Date(now.getFullYear() + 2, 11, 31);
    var events = calendar.getEvents(searchStart, searchEnd);
    for (var i = 0; i < events.length; i++) {
      if (events[i].getId() === id) {
        return events[i];
      }
    }
  } catch (err) { /* give up */ }

  return null;
}

/**
 * Converts a CalendarEvent to a plain object matching the CalendarEvent model.
 * Extracts bookingId and color from the event description or event properties.
 * @param {CalendarEvent} event
 * @return {Object}
 */
function parseCalendarEvent(event) {
  var desc = event.getDescription() || '';
  var bookingId = '';
  var color = '';

  if (desc) {
    var parts = desc.split('|');
    if (parts[0]) bookingId = parts[0];
    if (parts[1]) color = parts[1];
  }

  // Fallback: try event's own color
  if (!color) {
    try { color = event.getColor() || ''; } catch (err) { color = ''; }
  }

  var allDay = false;
  try { allDay = event.isAllDayEvent(); } catch (err) { allDay = false; }

  var startDate, endDate;
  try {
    startDate = allDay ? event.getStartDate() : event.getStartTime();
    endDate   = allDay ? event.getEndDate()   : event.getEndTime();
  } catch (err) {
    startDate = new Date();
    endDate = new Date();
  }

  return {
    id: event.getId(),
    title: event.getTitle(),
    start: formatDate(startDate),
    end: formatDate(endDate),
    allDay: allDay,
    color: color,
    bookingId: bookingId
  };
}


/* ==========================================================================
 * CRUD HANDLERS — Finances
 * ========================================================================== */

function addFinance(data)    { return addRecord('Finances', data); }
function updateFinance(data) { return updateRecord('Finances', data); }

function deleteFinance(data) {
  return deleteRecord('Finances', data.id);
}


/* ==========================================================================
 * CRUD HANDLERS — Customers
 * ========================================================================== */

function addCustomer(data)    { return addRecord('Customers', data); }
function updateCustomer(data) { return updateRecord('Customers', data); }

function deleteCustomer(data) {
  return deleteRecord('Customers', data.id);
}


/* ==========================================================================
 * CRUD HANDLERS — Bookings
 * ========================================================================== */

function addBooking(data)    { return addRecord('Bookings', data); }
function updateBooking(data) { return updateRecord('Bookings', data); }

function deleteBooking(data) {
  return deleteRecord('Bookings', data.id);
}


/* ==========================================================================
 * CRUD HANDLERS — Supplies
 * ========================================================================== */

function addSupply(data)    { return addRecord('Supplies', data); }
function updateSupply(data) { return updateRecord('Supplies', data); }

function deleteSupply(data) {
  return deleteRecord('Supplies', data.id);
}


/* ==========================================================================
 * SEEDING — Initialize sheets with headers and sample data
 * ========================================================================== */

/**
 * Creates/opens the Google Sheet, writes headers, and populates sample data.
 * Run this once from the Apps Script editor (or manually) before deploying.
 * Sets the SHEET_ID script property automatically.
 */
function seedDatabase() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var sheetId = scriptProperties.getProperty('SHEET_ID');
  var spreadsheet;
  var isNew = false;

  if (!sheetId) {
    spreadsheet = SpreadsheetApp.create('Pablo Paraiso Management — Database');
    scriptProperties.setProperty('SHEET_ID', spreadsheet.getId());
    sheetId = spreadsheet.getId();
    isNew = true;
  } else {
    spreadsheet = SpreadsheetApp.openById(sheetId);
  }

  // --- Finances ---
  var financesSheet = spreadsheet.getSheetByName('Finances') ||
    spreadsheet.insertSheet('Finances');
  financesSheet.clear();
  financesSheet.appendRow(HEADERS.Finances);
  financesSheet.appendRow(['F0001', '2024-01-15', 'income', 'Booking', 'Payment for B0001', 15000, 'B0001']);
  financesSheet.appendRow(['F0002', '2024-01-20', 'expense', 'Supplies', 'Towels and linens', 2000, '']);

  // --- Customers ---
  var customersSheet = spreadsheet.getSheetByName('Customers') ||
    spreadsheet.insertSheet('Customers');
  customersSheet.clear();
  customersSheet.appendRow(HEADERS.Customers);
  customersSheet.appendRow(['C0001', 'John Smith', 'john@example.com', '+1234567890', '123 Main St', 'VIP']);
  customersSheet.appendRow(['C0002', 'Jane Doe', 'jane@example.com', '+1987654321', '456 Oak Ave', '']);

  // --- Bookings ---
  var bookingsSheet = spreadsheet.getSheetByName('Bookings') ||
    spreadsheet.insertSheet('Bookings');
  bookingsSheet.clear();
  bookingsSheet.appendRow(HEADERS.Bookings);
  bookingsSheet.appendRow(['B0001', 'C0001', 'Lakeside Villa', '2024-01-20', '2024-01-25', 5, 15000, 'confirmed', '2024-01-01']);

  // --- Supplies ---
  var suppliesSheet = spreadsheet.getSheetByName('Supplies') ||
    spreadsheet.insertSheet('Supplies');
  suppliesSheet.clear();
  suppliesSheet.appendRow(HEADERS.Supplies);
  suppliesSheet.appendRow(['S0001', 'Towels', 'Linens', 20, 'pieces', 500, '2024-01-01', 'ABC Supplier', 10]);
  suppliesSheet.appendRow(['S0002', 'Toilet Paper', 'Essentials', 50, 'rolls', 200, '2024-01-10', 'ABC Supplier', 20]);

  // --- Properties ---
  var propertiesSheet = spreadsheet.getSheetByName('Properties') ||
    spreadsheet.insertSheet('Properties');
  propertiesSheet.clear();
  propertiesSheet.appendRow(HEADERS.Properties);
  propertiesSheet.appendRow(['P0001', 'Lakeside Villa', '123 Lake View', 6, 3000]);
  propertiesSheet.appendRow(['P0002', 'Mountain Cabin', '456 Mountain Rd', 4, 2500]);

  // --- Config ---
  var configSheet = spreadsheet.getSheetByName('Config') ||
    spreadsheet.insertSheet('Config');
  configSheet.clear();
  configSheet.appendRow(HEADERS.Config);
  configSheet.appendRow(['currency', 'USD']);
  configSheet.appendRow(['taxRate', '0.1']);

  // Format header rows
  [financesSheet, customersSheet, bookingsSheet, suppliesSheet, propertiesSheet, configSheet].forEach(function(s) {
    s.getRange(1, 1, 1, s.getLastColumn()).setFontWeight('bold').setBackground('#e8e8e8');
  });

  return {
    success: true,
    spreadsheetId: sheetId,
    spreadsheetUrl: spreadsheet.getUrl(),
    isNew: isNew,
    message: isNew
      ? 'Created new spreadsheet and seeded all sheets.'
      : 'Sheet already existed. Seeded all sheets with headers and sample data.'
  };
}
