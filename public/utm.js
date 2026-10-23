/*
 * Eduvia Marketing: where each enquiry came from.
 *
 * Add once to any page with a form:
 *   <script src="https://marketing.eduvia.my/utm.js" defer></script>
 *
 * It adds hidden fields to every form that sends to this app (its action is
 * .../f/<id>, or it has a data-utm attribute):
 * - came_from: worked out by itself from the site the visitor clicked through
 *   from ("Google search", "Instagram", "Direct"...). Nothing to set up.
 * - utm_source, utm_medium, utm_campaign, utm_content, utm_term: the labels
 *   on the link they arrived on, e.g. ?utm_source=facebook&utm_campaign=x.
 * Both are kept for 30 days, so they still count if the person looks around
 * a few pages first. A form sent with fetch() and JSON can add
 * window.eduviaUtm() to its data instead.
 */
(function () {
  "use strict";
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var TAGS_STORE = "eduvia_utm";
  var FROM_STORE = "eduvia_from";
  var KEEP_MS = 30 * 24 * 60 * 60 * 1000;

  // The site a visitor clicked through from, as a person would say it.
  // Checked in order; the first match wins. Anything else shows its address.
  var SITES = [
    [/^(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com|com\.google\.android\.gm)$/, "Email"],
    [/^gemini\.google\.com$/, "Gemini"],
    [/(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/, "Google search"],
    [/(^|\.)bing\.com$/, "Bing search"],
    [/(^|\.)yahoo\.[a-z.]+$/, "Yahoo search"],
    [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
    [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, "Facebook"],
    [/(^|\.)instagram\.com$/, "Instagram"],
    [/(^|\.)threads\.(net|com)$/, "Threads"],
    [/(^|\.)(tiktok\.com)$/, "TikTok"],
    [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
    [/(^|\.)(whatsapp\.com|wa\.me)$/, "WhatsApp"],
    [/(^|\.)(t\.me|telegram\.org)$/, "Telegram"],
    [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X (Twitter)"],
    [/(^|\.)(linkedin\.com|lnkd\.in)$/, "LinkedIn"],
    [/(^|\.)pinterest\.[a-z.]+$/, "Pinterest"],
    [/(^|\.)reddit\.com$/, "Reddit"],
    [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, "ChatGPT"],
    [/(^|\.)perplexity\.ai$/, "Perplexity"],
  ];

  var script = document.currentScript;
  var appOrigin = "";
  try {
    appOrigin = new URL(script && script.src ? script.src : "", location.href).origin;
  } catch {}

  var params = new URLSearchParams(location.search);

  function bareHost(host) {
    return String(host || "").toLowerCase().replace(/^(www|m|l|lm|mobile)\./, "");
  }

  function siteName(host) {
    for (var i = 0; i < SITES.length; i++) if (SITES[i][0].test(host)) return SITES[i][1];
    return host;
  }

  // Null when this page view says nothing new: no ad click and no other site
  // (the visitor is moving around this site, or the browser hid it).
  function cameFromNow() {
    var ref = "";
    try {
      var referrer = new URL(document.referrer);
      ref = referrer.protocol === "android-app:" ? referrer.hostname : bareHost(referrer.hostname);
    } catch {}
    if (ref && ref === bareHost(location.hostname)) ref = "";
    var site = ref ? siteName(ref) : "";
    if (params.get("gclid") || params.get("gbraid") || params.get("wbraid")) return "Google Ads";
    if (params.get("fbclid")) return site === "Instagram" ? "Instagram" : site === "Facebook" ? "Facebook" : "Facebook or Instagram";
    if (params.get("ttclid")) return "TikTok Ads";
    if (params.get("msclkid")) return "Microsoft Ads";
    return site || null;
  }

  function tagsNow() {
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

  // Something new replaces what was saved (the latest click wins); nothing
  // new keeps what was saved, for 30 days.
  function remember(key, now) {
    try {
      if (now) {
        localStorage.setItem(key, JSON.stringify({ value: now, at: Date.now() }));
        return now;
      }
      var saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved && saved.value && Date.now() - saved.at < KEEP_MS) return saved.value;
    } catch {}
    return now;
  }

  var tags = remember(TAGS_STORE, tagsNow()) || {};
  var cameFrom = remember(FROM_STORE, cameFromNow());
  // No other site, no ad, nothing saved, and not arriving from this site's own pages: typed in, a bookmark or an app.
  if (!cameFrom && !document.referrer) cameFrom = "Direct (typed, bookmark or app)";

  var fields = {};
  if (cameFrom) fields.came_from = String(cameFrom).slice(0, 200);
  for (var key in tags) fields[key] = tags[key];

  window.eduviaUtm = function () {
    var copy = {};
    for (var name in fields) copy[name] = fields[name];
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
    for (var name in fields) {
      // A field the page already has (filled by the site itself) is left alone.
      if (form.querySelector('[name="' + name + '"]')) continue;
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = fields[name];
      form.appendChild(input);
    }
  }

  function fillAll() {
    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i++) fill(forms[i]);
  }

  if (Object.keys(fields).length === 0) return;
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
