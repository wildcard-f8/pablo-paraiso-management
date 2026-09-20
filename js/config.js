/* Retreat Management App - Config
   Central configuration for API endpoint and Google Identity Services.
   Replace placeholders before deploying.
*/
export const CONFIG = {
  // Google Apps Script web app URL (DEPLOY_HERE prompt). Replace [SCRIPT_ID].
  API_BASE_URL: "https://script.google.com/macros/s/https://script.google.com/macros/s/AKfycbzfgSj6RXHCUDg8_6qStQM4IoMURxpMVGNqPv0rKBIVMLgDO_WpWZbg1xVgahTRLrFP/exec/dev",

  // Google Identity Services OAuth 2.0 Client ID. Create one at:
  // https://console.cloud.google.com/ -> APIs & Services -> Credentials
  GOOGLE_CLIENT_ID: "[GOOGLE_CLIENT_ID].apps.googleusercontent.com",

  // Optional application title shown in the browser tab / header.
  APP_NAME: "Retreat Management",

  // How many records to fetch for the "infinite" table view before requesting more.
  PAGE_SIZE: 100,

  // Low-stock threshold fallback if the supply record omits it.
  DEFAULT_MIN_STOCK: 10,

  // Demo seed data used only when every sheet is empty (first-run experience).
  DEMO: {
    seedIfEmpty: true,
  },
https://script.google.com/macros/s/AKfycbzfgSj6RXHCUDg8_6qStQM4IoMURxpMVGNqPv0rKBIVMLgDO_WpWZbg1xVgahTRLrFP/exec};

export default CONFIG;
