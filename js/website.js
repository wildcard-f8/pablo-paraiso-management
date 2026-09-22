/* website.js - Website Content Management module.
   Manage the public Pablo Paraiso website content (logo, hero, about,
   amenities, gallery, packages, testimonials, contact) from the management app.

   Changes to the logo URL are saved to the backend Config sheet and
   immediately applied to both the website and the management app logo.
*/
import { CONFIG } from "./config.js?v=35";
import { api } from "./auth.js?v=35";
import { utils, $, $$ } from "./utils.js?v=35";

/* ── List-type sections: key → { fields, arrayField, layout } ── */
const LIST_SECTIONS = {
  hero_features:  { fields: ["title", "desc"], arrayField: null, layout: "default" },
  amenities:      { fields: ["title", "desc"], arrayField: null, layout: "default" },
  gallery:        { fields: ["src", "alt"],   arrayField: null, layout: "image" },
  testimonials:   { fields: ["quote", "guest"], arrayField: null, layout: "quote" },
};

/* ── Default seed content (mirrors website HTML) ───────────────── */
const DEFAULTS = {
  logo: "https://wildcard-f8.github.io/pablo-paraiso/assets/img/logo_transparent.png?v=2",
  hero_title: "Your Lakeside Paradise",
  hero_subtitle: "Pablo Paraiso is a luxury pool house retreat nestled along the serene shores of Laguna de Bay.",
  hero_cta: "Book Your Retreat",
  hero_cta_link: "#contact",
  about_title: "Your Summer Escape Awaits",
  about_subtitle: "PABLO PARAISO",
  about_description_1: "A luxury lakeside pool house designed for celebration, connection, and pure relaxation.",
  about_description_2: 'Named after the Spanish phrase for "Paul\'s Paradise," Pablo Paraiso is a serene lakeside retreat where unforgettable moments are made.',
  about_image: "https://wildcard-f8.github.io/pablo-paraiso/assets/img/lounge.jpg",
  hero_features: [
    { title: "Prime Location", desc: "Just 30 minutes from Manila, nestled along the scenic shores of Laguna de Bay." },
    { title: "Pool & Villa", desc: "Swimming pool (3ft–5ft depth) with a one-room villa featuring a private toilet and bathroom." },
    { title: "All Amenities", desc: "Two shower rooms, dining tables, grill, videoke, and lush garden grounds." },
    { title: "Flexible Pricing", desc: "6-hour and 10-hour packages starting at ₱4,000, plus custom event options." },
  ],
  amenities: [
    { title: "Pool", desc: "Swimming pool with depths ranging from 3ft to 5ft — perfect for both casual lounging and deep-end fun." },
    { title: "Villa", desc: "One-room villa with a private toilet and bathroom, ideal for changing, rest, or overnight accommodation." },
    { title: "Shower Rooms", desc: "Two clean, well-maintained shower facilities with hot and cold water." },
    { title: "Tables", desc: "Outdoor dining tables seating up to 30 guests, perfect for group meals." },
    { title: "Grill", desc: "Charcoal and gas grill stations for community barbecues and cooking." },
    { title: "Videoke", desc: "Entertainment system with a selection of songs for singing and fun." },
    { title: "Garden", desc: "Lush garden grounds perfect for relaxation, photos, and outdoor activities." },
    { title: "Mini-Golf", desc: "Putting green and mini-golf course for casual sports and team building." },
  ],
  gallery: [
    { src: "https://wildcard-f8.github.io/pablo-paraiso/assets/img/gallery-3.jpg", alt: "Mountain lake sunset view" },
    { src: "https://wildcard-f8.github.io/pablo-paraiso/assets/img/gallery-1.jpg", alt: "Luxury resort pool with palm trees" },
    { src: "https://wildcard-f8.github.io/pablo-paraiso/assets/img/sunset-lake.jpg", alt: "Aerial view of lake with mountains" },
    { src: "https://wildcard-f8.github.io/pablo-paraiso/assets/img/gallery-4.jpg", alt: "Lake at sunset with trees" },
    { src: "https://wildcard-f8.github.io/pablo-paraiso/assets/img/gallery-2.jpg", alt: "Pool with lounge chair and umbrella" },
    { src: "https://wildcard-f8.github.io/pablo-paraiso/assets/img/barbecue.jpg", alt: "Group of people around a grill" },
    { src: "https://wildcard-f8.github.io/pablo-paraiso/assets/img/pool-party.jpg", alt: "Lounge chairs by the pool" },
    { src: "https://wildcard-f8.github.io/pablo-paraiso/assets/img/team-building.jpg", alt: "Pool next to lush green hillside" },
  ],
  packages: [
    { name: "6-Hour Package", price: "₱4,000", duration: "6 hours", guests: "Up to 30 guests", features: ["Full pool & villa access", "Shower rooms & tables", "Grill & videoke", "Garden grounds", "Mini-golf course access"] },
    { name: "10-Hour Package", price: "₱6,000", duration: "10 hours", guests: "Up to 30 guests", features: ["Full pool & villa access", "Shower rooms & tables", "Grill & videoke", "Garden grounds", "Mini-golf course access", "4 extra hours for just ₱2,000 more"] },
    { name: "Custom Event", price: "Custom", duration: "Flexible", guests: "Up to 30 guests", features: ["Flexible duration", "Custom menu options", "Special arrangements", "Dedicated coordination", "Mini-golf course access"] },
  ],
  testimonials: [
    { quote: "Our company event was absolutely magical. The pool, the food, the atmosphere — everything was perfect!", guest: "Sarah M." },
    { quote: "We celebrated my 30th birthday here and it was incredible! The pool area, the grill stations, and the overall vibe made it unforgettable.", guest: "Alex R." },
  ],
  contact_email: "hello@pabloparaiso.ph",
  contact_phone: "+63 917 123 4567",
  contact_address: "Along the scenic shores of Laguna de Bay, Philippines",
};

/* ── Module state ──────────────────────────────────────────────── */
let content = {};

/* ── Public API ────────────────────────────────────────────────── */
export function createWebsite() {
  const root = document.createElement("section");
  root.className = "page";
  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Website Content</h1>
        <p class="page-subtitle">Manage the Pablo Paraiso website. Changes to the logo URL are reflected on both the website and this app.</p>
      </div>
      <button class="btn btn--primary" id="saveWebsiteBtn">💾 Save All Changes</button>
    </div>
    <div class="website-grid" id="websiteGrid">
      <div class="page-loader"><span class="spinner"></span><span class="page-loader__text">Loading website content…</span></div>
    </div>
  `;

  const view = root;  // router expects a DOM element (nodeType === 1)
  root._unmount = null;

  // Defer to next microtask so root is in the DOM before we query for #websiteGrid
  setTimeout(() => {
    loadWebsiteContent().then(() => {
      renderContent();
      bindEvents(root);
    }).catch(err => {
      const grid = $("#websiteGrid");
      if (grid) grid.innerHTML = `<p class="error">Failed to load: ${err.message}</p>`;
    });
  }, 0);

  // Global refresh hook
  window.refreshWebsite = () => {
    loadWebsiteContent().then(() => renderContent());
  };

  return view;
}

/* ── Load website content from backend ─────────────────────────── */
async function loadWebsiteContent() {
  showLoader(true);
  try {
    const data = await api.get("getWebsiteContent");
    // Merge with defaults so missing keys are filled
    content = { ...DEFAULTS };
    for (const key in data) {
      if (data[key] !== undefined && data[key] !== null) {
        content[key] = data[key];
      }
    }
    // Ensure array fields are arrays
    for (const key in LIST_SECTIONS) {
      if (!Array.isArray(content[key])) {
        content[key] = [];
      }
    }
    return content;
  } catch (err) {
    // First run or no data — use defaults
    content = { ...DEFAULTS };
    return content;
  } finally {
    showLoader(false);
  }
}

/* ── Render ────────────────────────────────────────────────────── */
function showLoader(show) {
  const grid = $("#websiteGrid");
  const existing = grid.querySelector(".page-loader");
  if (show && !existing) {
    const loader = document.createElement("div");
    loader.className = "page-loader";
    loader.innerHTML = '<span class="spinner"></span><span class="page-loader__text">Loading website content…</span>';
    grid.appendChild(loader);
  } else if (!show && existing) {
    existing.remove();
  }
}

function renderContent() {
  const grid = $("#websiteGrid");
  grid.innerHTML = "";

  // ── Simple scalar fields ──
  grid.appendChild(renderScalarCard("Logo URL", "logo", "url", true));
  grid.appendChild(renderScalarCard("Hero Title", "hero_title", "text"));
  grid.appendChild(renderScalarCard("Hero Subtitle", "hero_subtitle", "textarea"));
  grid.appendChild(renderScalarCard("Hero CTA Button Text", "hero_cta", "text"));
  grid.appendChild(renderScalarCard("Hero CTA Link (URL or #anchor)", "hero_cta_link", "text"));

  grid.appendChild(renderScalarCard("About Title", "about_title", "text"));
  grid.appendChild(renderScalarCard("About Subtitle (Brand Word)", "about_subtitle", "text"));
  grid.appendChild(renderScalarCard("About Description (para 1)", "about_description_1", "textarea"));
  grid.appendChild(renderScalarCard("About Description (para 2)", "about_description_2", "textarea"));
  grid.appendChild(renderScalarCard("About Image URL", "about_image", "url", true));

  grid.appendChild(renderScalarCard("Contact Email", "contact_email", "email"));
  grid.appendChild(renderScalarCard("Contact Phone", "contact_phone", "tel"));
  grid.appendChild(renderScalarCard("Contact Address", "contact_address", "textarea"));

  // ── Array (list) sections ──
  // Hero Features, Amenities, Gallery, Testimonials (list sections)
  grid.appendChild(renderListCard("hero_features", "Hero Features"));
  // Amenities
  grid.appendChild(renderListCard("amenities", "Amenities"));
  // Gallery
  grid.appendChild(renderListCard("gallery", "Gallery Images"));
  // Testimonials
  grid.appendChild(renderListCard("testimonials", "Testimonials"));
  // Packages (special: has features sub-list)
  grid.appendChild(renderPackagesCard());
}

function renderScalarCard(label, key, inputType, hasPreview = false) {
  const card = document.createElement("div");
  card.className = "card website-card";
  const val = content[key] || "";

  let inputEl;
  if (inputType === "textarea") {
    inputEl = `<textarea class="field-input" data-key="${key}" placeholder="${label}" rows="3">${escapeHtml(val)}</textarea>`;
  } else if (inputType === "url" && hasPreview) {
    const preview = val ? (inputType === "url" && hasPreview && key === "logo"
      ? `<img src="${escapeHtml(val)}" alt="Logo Preview" class="website-logo-preview">`
      : `<img src="${escapeHtml(val)}" alt="Preview" class="website-image-preview">`)
      : "";
    inputEl = `<input type="url" class="field-input" data-key="${key}" placeholder="${label}" value="${escapeHtml(val)}">${preview}<button type="button" class="btn btn--sm btn--icon upload-btn" data-upload-key="${key}" title="Upload image">📷</button>`;
  } else {
    inputEl = `<input type="${inputType}" class="field-input" data-key="${key}" placeholder="${label}" value="${escapeHtml(val)}">`;
  }

  card.innerHTML = `
    <div class="website-card__header">
      <h3 class="website-card__title">${label}</h3>
    </div>
    <div class="website-card__body">
      ${inputEl}
    </div>
  `;

  // Live logo update
  if (key === "logo") {
    const input = card.querySelector("input");
    if (input) {
      input.addEventListener("input", (e) => {
        const v = e.target.value.trim();
        if (v) updateAppLogo(v);
      });
    }
  }

  return card;
}

function renderListCard(key, label) {
  const config = LIST_SECTIONS[key];
  const items = Array.isArray(content[key]) ? content[key] : [];

  const card = document.createElement("div");
  card.className = "card website-card";

  let itemsHTML = "";
  if (items.length === 0) {
    itemsHTML = `<p class="muted" style="padding: var(--space-3);">No items yet.</p>`;
  } else {
    itemsHTML = items.map((item, idx) => renderListItem(key, item, idx, config)).join("");
  }

  card.innerHTML = `
    <div class="website-card__header">
      <h3 class="website-card__title">${label}</h3>
      <button type="button" class="btn btn--sm btn--primary" data-action="add-item" data-list-key="${key}">➕ Add</button>
    </div>
    <div class="website-card__body" style="padding: 0;">
      <div class="website-list" id="list_${key}">
        ${itemsHTML}
      </div>
    </div>
  `;

  return card;
}

function renderListItem(key, item, idx, config) {
  const fieldInputs = config.fields.map(f => {
    const val = item[f] !== undefined ? item[f] : "";
    const inputType = f === "src" ? "url" : (config.layout === "quote" && f === "quote" ? "textarea" : "text");
    if (inputType === "textarea") {
      return `<textarea class="field-input" data-list="${key}" data-idx="${idx}" data-field="${f}" placeholder="${f.charAt(0).toUpperCase() + f.slice(1)}" rows="2">${escapeHtml(val)}</textarea>`;
    }
    return `<input type="${inputType}" class="field-input" data-list="${key}" data-idx="${idx}" data-field="${f}" value="${escapeHtml(val)}" placeholder="${f.charAt(0).toUpperCase() + f.slice(1)}">`;
  }).join("");

  const removeBtn = `<button type="button" class="btn btn--icon" data-action="remove-item" data-list-key="${key}" data-idx="${idx}" title="Remove">✕</button>`;

  let extraHTML = "";
  if (config.arrayField) {
    const val = item[config.arrayField] || "";
    extraHTML = `<input type="text" class="field-input" data-list="${key}" data-idx="${idx}" data-field="${config.arrayField}" value="${escapeHtml(val)}" placeholder="${config.arrayField.charAt(0).toUpperCase() + config.arrayField.slice(1)}">`;
  }

  // Gallery image preview + upload button
  if (key === "gallery") {
    const src = item.src || "";
    const uploadBtn = `<button type="button" class="btn btn--sm btn--icon upload-btn" data-upload-list="${key}" data-upload-idx="${idx}" title="Upload image">📷</button>`;
    if (src) {
      extraHTML = `<img src="${escapeHtml(src)}" alt="Preview" class="website-image-preview" style="margin-top: var(--space-2);">` + uploadBtn + extraHTML;
    } else {
      extraHTML = uploadBtn + extraHTML;
    }
  }

  return `
    <div class="website-list-item">
      <div class="website-list-item__fields">
        ${fieldInputs}
        ${extraHTML}
      </div>
      ${removeBtn}
    </div>
  `;
}

function renderPackagesCard() {
  const items = Array.isArray(content.packages) ? content.packages : [];
  const card = document.createElement("div");
  card.className = "card website-card";

  let itemsHTML = "";
  if (items.length === 0) {
    itemsHTML = `<p class="muted" style="padding: var(--space-3);">No packages yet.</p>`;
  } else {
    itemsHTML = items.map((item, idx) => renderPackageItem(item, idx)).join("");
  }

  card.innerHTML = `
    <div class="website-card__header">
      <h3 class="website-card__title">Event Packages</h3>
      <button type="button" class="btn btn--sm btn--primary" data-action="add-package">➕ Add Package</button>
    </div>
    <div class="website-card__body" style="padding: 0;">
      <div class="website-list" id="list_packages">
        ${itemsHTML}
      </div>
    </div>
  `;

  return card;
}

function renderPackageItem(item, idx) {
  const fields = ["name", "price", "duration", "guests"];
  const fieldInputs = fields.map(f => {
    const val = item[f] !== undefined ? item[f] : "";
    return `<input type="text" class="field-input" data-pkg-idx="${idx}" data-field="${f}" value="${escapeHtml(val)}" placeholder="${f.charAt(0).toUpperCase() + f.slice(1)}">`;
  }).join("");

  const features = Array.isArray(item.features) ? item.features : [];
  const featureRows = features.map((feat, fidx) => `
    <div class="feature-row">
      <input type="text" class="field-input" data-pkg-idx="${idx}" data-feat-idx="${fidx}" value="${escapeHtml(feat)}" placeholder="Feature...">
      <button type="button" class="btn btn--icon" data-action="remove-feature" data-pkg-idx="${idx}" data-feat-idx="${fidx}" title="Remove feature">✕</button>
    </div>
  `).join("");

  return `
    <div class="website-list-item">
      <div class="website-list-item__fields">
        ${fieldInputs}
        <div class="website-features">
          <label class="muted" style="font-size: 0.75rem;">Features</label>
          ${featureRows}
          <button type="button" class="btn btn--sm btn--secondary" data-action="add-feature" data-pkg-idx="${idx}" style="margin-top: var(--space-2);">➕ Add Feature</button>
        </div>
      </div>
      <button type="button" class="btn btn--icon" data-action="remove-package" data-pkg-idx="${idx}" title="Remove package">✕</button>
    </div>
  `;
}

/* ── Event binding ─────────────────────────────────────────────── */
function bindEvents(root) {
  // Save all
  const saveBtn = $("#saveWebsiteBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveAll);
  }

  // Delegate events
  root.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.classList.contains("field-input")) return;

    const key = el.dataset.key;
    const listKey = el.dataset.list;
    const field = el.dataset.field;
    const idx = parseInt(el.dataset.idx);
    const pkgIdx = parseInt(el.dataset.pkgIdx);
    const featIdx = parseInt(el.dataset.featIdx);

    if (key) {
      // Scalar field
      content[key] = el.value;
      if (key === "logo" && el.value.trim()) {
        updateAppLogo(el.value.trim());
      }
    } else if (listKey && field) {
      // List item field
      if (!Array.isArray(content[listKey])) content[listKey] = [];
      if (idx >= 0 && idx < content[listKey].length) {
        content[listKey][idx][field] = el.value;
      }
    } else if (pkgIdx >= 0 && field) {
      // Package field
      if (!Array.isArray(content.packages)) content.packages = [];
      if (pkgIdx >= 0 && pkgIdx < content.packages.length) {
        content.packages[pkgIdx][field] = el.value;
      }
    } else if (pkgIdx >= 0 && featIdx >= 0 && el.dataset.featIdx !== undefined) {
      // Package feature field
      if (!Array.isArray(content.packages)) content.packages = [];
      if (pkgIdx >= 0 && pkgIdx < content.packages.length) {
        if (!Array.isArray(content.packages[pkgIdx].features)) {
          content.packages[pkgIdx].features = [];
        }
        if (featIdx >= 0 && featIdx < content.packages[pkgIdx].features.length) {
          content.packages[pkgIdx].features[featIdx] = el.value;
        }
      }
    }
  });

  // Upload button click handler (delegated)
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".upload-btn");
    if (!btn) return;
    e.preventDefault();
    const key = btn.dataset.uploadKey;
    const listKey = btn.dataset.uploadList;
    const idx = parseInt(btn.dataset.uploadIdx);
    let targetInput = null;
    if (key) {
      targetInput = root.querySelector(`input[data-key="${key}"]`);
    } else if (listKey && idx >= 0) {
      targetInput = root.querySelector(`input[data-list="${listKey}"][data-idx="${idx}"][data-field="src"]`);
    }
    if (!targetInput) return;
    handleImageUpload(targetInput, btn);
  });

  // Delegate events for action buttons
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "add-item") {
      const listKey = btn.dataset.listKey;
      const config = LIST_SECTIONS[listKey];
      if (!config) return;
      const newItem = {};
      config.fields.forEach(f => { newItem[f] = ""; });
      if (!Array.isArray(content[listKey])) content[listKey] = [];
      content[listKey].push(newItem);
      renderListSection(listKey);
    }

    if (action === "remove-item") {
      const listKey = btn.dataset.listKey;
      const idx = parseInt(btn.dataset.idx);
      if (Array.isArray(content[listKey]) && idx >= 0 && idx < content[listKey].length) {
        content[listKey].splice(idx, 1);
        renderListSection(listKey);
      }
    }

    if (action === "add-package") {
      if (!Array.isArray(content.packages)) content.packages = [];
      content.packages.push({ name: "", price: "", duration: "", guests: "", features: [] });
      const el = $("#list_packages");
      if (el) {
        el.innerHTML = content.packages.map((item, idx) => renderPackageItem(item, idx)).join("");
      }
    }

    if (action === "remove-package") {
      const idx = parseInt(btn.dataset.pkgIdx);
      if (Array.isArray(content.packages) && idx >= 0 && idx < content.packages.length) {
        content.packages.splice(idx, 1);
        const el = $("#list_packages");
        if (el) {
          el.innerHTML = content.packages.length
            ? content.packages.map((item, i) => renderPackageItem(item, i)).join("")
            : `<p class="muted" style="padding: var(--space-3);">No packages yet.</p>`;
        }
      }
    }

    if (action === "add-feature") {
      const idx = parseInt(btn.dataset.pkgIdx);
      if (Array.isArray(content.packages) && idx >= 0 && idx < content.packages.length) {
        if (!Array.isArray(content.packages[idx].features)) content.packages[idx].features = [];
        content.packages[idx].features.push("");
        const pkgCard = $("#list_packages");
        if (pkgCard) {
          pkgCard.innerHTML = content.packages.map((item, i) => renderPackageItem(item, i)).join("");
        }
      }
    }

    if (action === "remove-feature") {
      const idx = parseInt(btn.dataset.pkgIdx);
      const fidx = parseInt(btn.dataset.featIdx);
      if (Array.isArray(content.packages) && idx >= 0 && idx < content.packages.length) {
        if (!Array.isArray(content.packages[idx].features)) content.packages[idx].features = [];
        if (fidx >= 0 && fidx < content.packages[idx].features.length) {
          content.packages[idx].features.splice(fidx, 1);
          const pkgCard = $("#list_packages");
          if (pkgCard) {
            pkgCard.innerHTML = content.packages.map((item, i) => renderPackageItem(item, i)).join("");
          }
        }
      }
    }
  });
}

/* ── Re-render a list section after add/remove ─────────────────── */
function renderListSection(key) {
  const config = LIST_SECTIONS[key];
  const items = Array.isArray(content[key]) ? content[key] : [];
  const el = $(`#list_${key}`);
  if (!el) return;
  el.innerHTML = items.length
    ? items.map((item, idx) => renderListItem(key, item, idx, config)).join("")
    : `<p class="muted" style="padding: var(--space-3);">No items yet.</p>`;
}

/* ── Save all content ──────────────────────────────────────────── */
async function saveAll() {
  const btn = $("#saveWebsiteBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Saving…"; }

  try {
    await api.post("updateWebsiteContent", content);

    // Apply logo to management app immediately
    if (content.logo) {
      updateAppLogo(content.logo);
    }

    app.showToast("Website content saved! Changes will appear on the website.", "success", 5000);
  } catch (err) {
    app.showToast("Save failed: " + (err.message || "Unknown error"), "error", 5000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save All Changes"; }
  }
}

/* ── Update management app logo ────────────────────────────────── */
let logoDebounce = null;
function updateAppLogo(url) {
  if (logoDebounce) clearTimeout(logoDebounce);
  logoDebounce = setTimeout(() => {
    const logoIcons = $$(".logo__icon");
    logoIcons.forEach((img) => {
      // Only update logos that point to the old hardcoded URL or are in auth gate/sidebar
      if (img.src.includes("logo_transparent") || img.src.includes("house")) {
        img.src = url + (url.includes("?") ? "&v=" : "?v=") + Date.now();
      }
    });
  }, 300);
}

/* ── Utility ───────────────────────────────────────────────────── */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ── Image upload ───────────────────────────────────────────────── */
/**
 * Opens a file picker, reads the selected image as base64, uploads it
 * via the backend uploadImage endpoint, and sets the result into the
 * target input field + preview image.
 * @param {HTMLInputElement} targetInput - The URL input to populate
 * @param {HTMLElement} uploadBtn - The button that triggered the upload (for status feedback)
 */
function handleImageUpload(targetInput, uploadBtn) {
  // Create a hidden file input
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Size guard — keep under GAS 50MB POST limit
    var MAX_BYTES = 30 * 1024 * 1024; // 30 MB (base64 inflates ~33%, GAS limit ~50MB)
    if (file.size > MAX_BYTES) {
      app.showToast("Image too large (max 30 MB). Please resize.", "error", 4000);
      return;
    }

    // Show loading state on the upload button
    const originalText = uploadBtn.textContent;
    uploadBtn.disabled = true;
    uploadBtn.textContent = "⏳";

    // Read file as base64 (without data URL prefix)
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        // Strip the data URL prefix to get raw base64
        const dataUrl = ev.target.result;
        const base64Data = dataUrl.split(",")[1];

        const response = await api.post("uploadImage", {
          filename: file.name,
          data: base64Data,
          mimeType: file.type,
        });

        // Set the URL in the input field
        targetInput.value = response.url;
        targetInput.dispatchEvent(new Event("input", { bubbles: true }));

        // Update preview if this is a logo/about_image
        const card = targetInput.closest(".website-card");
        if (card) {
          const existingPreview = card.querySelector(".website-logo-preview, .website-image-preview");
          if (existingPreview) {
            existingPreview.src = response.url + (response.url.includes("?") ? "&v=" : "?v=") + Date.now();
          }
        }

        app.showToast("Image uploaded!", "success", 2000);
      } catch (err) {
        app.showToast("Upload failed: " + (err.message || "Unknown error"), "error", 4000);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
        fileInput.remove();
      }
    };
    reader.onerror = () => {
      uploadBtn.disabled = false;
      uploadBtn.textContent = originalText;
      app.showToast("Failed to read file.", "error", 3000);
      fileInput.remove();
    };
    reader.readAsDataURL(file);
  };

  // Trigger file selection
  document.body.appendChild(fileInput);
  fileInput.click();
}

export default { createWebsite };
