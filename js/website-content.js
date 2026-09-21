/* website-content.js - Dynamic content loader for the Pablo Paraiso website.

  Add this script to the website by placing it BEFORE the closing </body> tag:

    <script src="https://wildcard-f8.github.io/pablo-paraiso-management/js/website-content.js?v=1"></script>

  It fetches website content (logo, hero, about, amenities, gallery, packages,
  testimonials, contact) from the management app's backend API (getWebsiteContent)
  and dynamically populates the page sections. The backend endpoint is public
  (no auth required) so the website works for all visitors.

  The script is designed to gracefully degrade: if the API call fails or the
  backend is slow to warm up, the website falls back to its existing hardcoded
  HTML content. No user-facing errors are shown.

  ── How to integrate ───────────────────────────────────────────────────────

  Each section on the website should have a data-content attribute that maps
  to the backend content key. For example:

    <h1 class="hero-title" data-content="hero_title">Your Lakeside Paradise</h1>
    <p class="hero-subtitle" data-content="hero_subtitle">...</p>
    <a href="#contact" class="hero-cta" data-content="hero_cta">Book Your Retreat</a>

  For array/list sections (amenities, gallery, packages, testimonials), use:

    <div class="amenities-grid" data-content-list="amenities"></div>

  The script will automatically clear and repopulate these containers with
  the fetched content, using the same HTML structure as the website's
  fallback markup.

  For the logo, use:
    <img class="logo__icon" data-content="logo" src="..." alt="Pablo Paraiso">

  ── Content keys ──────────────────────────────────────────────────────────

  Scalar: logo, hero_title, hero_subtitle, hero_cta, hero_cta_link,
          about_title, about_subtitle, about_description_1, about_description_2,
          about_image, contact_email, contact_phone, contact_address

  Array:  hero_features, amenities, gallery, packages, testimonials
*/
(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────────────────────────────
  // The backend GAS endpoint (same one the management app uses)
  var GAS_ENDPOINT = "https://script.google.com/macros/s/" +
    "AKfycbzfgSj6RXHCUDg8_6qStQM4IoMURxpMVGNqPv0rKBIVMLgDO_WpWZbg1xVgahTRLrFP" +
    "/exec?action=getWebsiteContent";

  // Fallback timeout — if the API doesn't respond in 5 seconds,
  // the page keeps its existing hardcoded content.
  var FETCH_TIMEOUT_MS = 5000;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function qs(el, sel) {
    return el.querySelector(sel);
  }

  function qsa(el, sel) {
    return el.querySelectorAll(sel);
  }

  /**
   * Fetches website content from the backend with a timeout.
   * Falls back to existing DOM content on failure.
   */
  function fetchWebsiteContent() {
    return new Promise(function (resolve) {
      var timeoutId = setTimeout(function () {
        resolve(null); // timeout — keep existing content
      }, FETCH_TIMEOUT_MS);

      fetch(GAS_ENDPOINT)
        .then(function (resp) {
          if (!resp.ok) throw new Error("HTTP " + resp.status);
          return resp.json();
        })
        .then(function (data) {
          clearTimeout(timeoutId);
          // data = { success: true, data: { logo: "...", hero_title: "...", ... } }
          resolve(data && data.success && data.data ? data.data : null);
        })
        .catch(function () {
          clearTimeout(timeoutId);
          resolve(null); // error — keep existing content
        });
    });
  }

  // ── Scalar content population ──────────────────────────────────────────────
  function populateScalar(content) {
    var elements = document.querySelectorAll("[data-content]");
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var key = el.getAttribute("data-content");
      var value = content[key];

      if (value === undefined || value === null || value === "") continue;

      // Handle image elements (logo, about_image)
      if (el.tagName.toLowerCase() === "img") {
        el.src = value;
        el.alt = el.alt || key;
      }
      // Handle anchor elements with data-content="hero_cta" (button text)
      else if (el.tagName.toLowerCase() === "a" && key === "hero_cta") {
        el.textContent = value;
      }
      // Handle text elements
      else {
        el.textContent = value;
      }
    }
  }

  // ── Array/list content population ─────────────────────────────────────────
  function populateList(content) {
    // Hero features
    var featuresEl = document.querySelector("[data-content-list='hero_features']");
    if (featuresEl && Array.isArray(content.hero_features)) {
      featuresEl.innerHTML = "";
      content.hero_features.forEach(function (f) {
        featuresEl.innerHTML +=
          '<div class="hero-feature">' +
            '<h4>' + escapeHtml(f.title) + '</h4>' +
            '<p>' + escapeHtml(f.desc) + '</p>' +
          '</div>';
      });
    }

    // Amenities
    var amenitiesEl = document.querySelector("[data-content-list='amenities']");
    if (amenitiesEl && Array.isArray(content.amenities)) {
      amenitiesEl.innerHTML = "";
      content.amenities.forEach(function (a) {
        amenitiesEl.innerHTML +=
          '<div class="amenity-card">' +
            '<h4>' + escapeHtml(a.title) + '</h4>' +
            '<p>' + escapeHtml(a.desc) + '</p>' +
          '</div>';
      });
    }

    // Gallery
    var galleryEl = document.querySelector("[data-content-list='gallery']");
    if (galleryEl && Array.isArray(content.gallery)) {
      galleryEl.innerHTML = "";
      content.gallery.forEach(function (g) {
        galleryEl.innerHTML +=
          '<a href="' + escapeHtml(g.src) + '" data-fancybox="gallery">' +
            '<img src="' + escapeHtml(g.src) + '" alt="' + escapeHtml(g.alt) + '">' +
          '</a>';
      });
    }

    // Testimonial
    var testimonialsEl = document.querySelector("[data-content-list='testimonials']");
    if (testimonialsEl && Array.isArray(content.testimonials)) {
      testimonialsEl.innerHTML = "";
      content.testimonials.forEach(function (t) {
        testimonialsEl.innerHTML +=
          '<div class="testimonial">' +
            '<blockquote>' + escapeHtml(t.quote) + '</blockquote>' +
            '<cite>— ' + escapeHtml(t.guest) + '</cite>' +
          '</div>';
      });
    }

    // Packages
    var packagesEl = document.querySelector("[data-content-list='packages']");
    if (packagesEl && Array.isArray(content.packages)) {
      packagesEl.innerHTML = "";
      content.packages.forEach(function (p, idx) {
        var featuresHtml = "";
        if (Array.isArray(p.features)) {
          featuresHtml = '<ul class="package-features">' +
            p.features.map(function (f) {
              return '<li>' + escapeHtml(f) + '</li>';
            }).join("") +
          '</ul>';
        }
        packagesEl.innerHTML +=
          '<div class="package-card">' +
            '<div class="package-header">' +
              '<h3>' + escapeHtml(p.name) + '</h3>' +
              '<div class="package-price">' + escapeHtml(p.price) + '</div>' +
            '</div>' +
            (p.duration ? '<p class="package-duration">' + escapeHtml(p.duration) + '</p>' : '') +
            (p.guests ? '<p class="package-guests">' + escapeHtml(p.guests) + '</p>' : '') +
            featuresHtml +
          '</div>';
      });
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    // Only run on the public website (not the management app)
    // Check if the page has any data-content or data-content-list attributes
    if (!document.querySelector("[data-content], [data-content-list]")) return;

    fetchWebsiteContent().then(function (content) {
      if (!content) return; // no data — keep existing hardcoded content

      populateScalar(content);
      populateList(content);

      // Dispatch event so other scripts can react
      document.dispatchEvent(new CustomEvent("websiteContentLoaded", {
        detail: { content: content }
      }));
    });
  }

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
