/*
 * Eduvia Marketing: UTM tags for your forms.
 *
 * Add once to any page with a form:
 *   <script src="https://marketing.eduvia.my/utm.js" defer></script>
 *
 * When someone arrives on a link like ?utm_source=facebook&utm_campaign=x,
 * the tags are kept for 30 days (so they still count if the person browses a
 * few pages first), then added as hidden fields to every form that sends to
 * this app (its action is .../f/<id>, or it has a data-utm attribute). A form
 * sent with fetch() and JSON can add window.eduviaUtm() to its data instead.
 */
(function () {
  "use strict";
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var STORE = "eduvia_utm";
  var KEEP_MS = 30 * 24 * 60 * 60 * 1000;

  var script = document.currentScript;
  var appOrigin = "";
  try {
    appOrigin = new URL(script && script.src ? script.src : "", location.href).origin;
  } catch {}

  function fromAddress() {
    var params = new URLSearchParams(location.search);
    var found = {};
    var any = false;
    for (var i = 0; i < KEYS.length; i++) {
      var value = (params.get(KEYS[i]) || "").trim();
      if (value) {
        found[KEYS[i]] = value.slice(0, 200);
        any = true;
      }
    }
    return any ? found : null;
  }

  // A new set of tags replaces the old one (the latest ad wins); no tags
  // keeps what was saved, for 30 days.
  var tags = fromAddress();
  try {
    if (tags) {
      localStorage.setItem(STORE, JSON.stringify({ tags: tags, at: Date.now() }));
    } else {
      var saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved && saved.tags && Date.now() - saved.at < KEEP_MS) tags = saved.tags;
    }
  } catch {}
  tags = tags || {};

  window.eduviaUtm = function () {
    var copy = {};
    for (var key in tags) copy[key] = tags[key];
    return copy;
  };

  function sendsHere(form) {
    if (form.hasAttribute("data-utm")) return true;
    var action = form.getAttribute("action");
    if (!action) return false;
    try {
      var url = new URL(action, location.href);
      return (!appOrigin || url.origin === appOrigin) && url.pathname.indexOf("/f/") === 0;
    } catch {
      return false;
    }
  }

  function fill(form) {
    if (!sendsHere(form)) return;
    for (var key in tags) {
      // A field the page already has (filled by the site itself) is left alone.
      if (form.querySelector('[name="' + key + '"]')) continue;
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = tags[key];
      form.appendChild(input);
    }
  }

  function fillAll() {
    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i++) fill(forms[i]);
  }

  if (Object.keys(tags).length === 0) return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fillAll);
  else fillAll();
  // Forms that appear later (popups, sites built with React and the like).
  if (window.MutationObserver) {
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      setTimeout(function () {
        queued = false;
        fillAll();
      }, 100);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
