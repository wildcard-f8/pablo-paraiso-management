/* Pablo Paraiso Management App - Config
   Central configuration for API endpoint and Google Identity Services.
   Replace placeholders before deploying.
*/
export const CONFIG = {
  // Google Apps Script web app URL. Uses /dev (test deployment) — change to
  // /exec after publishing. Set in script.google.com → Deploy → Web app →
  // "Who has access": Anyone, even anonymous.
  API_BASE_URL: "https://script.google.com/macros/s/AKfycbzfgSj6RXHCUDg8_6qStQM4IoMURxpMVGNqPv0rKBIVMLgDO_WpWZbg1xVbg1xVbg1xVbg1xVbg1xVbg1xVbg1xVbg1xVgahTRLrFP/exec",

  // Google Identity Services OAuth 2.0 Client ID. Create one at:
  // https://console.cloud.google.com/ -> APIs & Services -> Credentials
  GOOGLE_CLIENT_ID: "106840707748-shd83c7efjufadl2eq3sdgk5grcrplk7.apps.googleusercontent.com",

  // Optional application title shown in the browser tab / header.
  APP_NAME: "Pablo Paraiso Management",

  // How many records to fetch for the "infinite" table view before requesting more.
  PAGE_SIZE: 100,

  // Low-stock threshold fallback if the supply record omits it.
  DEFAULT_MIN_STOCK: 10,

  // Demo seed data used only when every sheet is empty (first-run experience).
  DEMO: {
    seedIfEmpty: true,
  },
};

export default CONFIG;
