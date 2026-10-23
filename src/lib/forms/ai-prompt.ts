import type { FieldDef } from "@/lib/forms/fields";
import { isTrackingKey } from "@/lib/forms/utm";

/**
 * A prompt the owner pastes into an AI assistant (Claude, ChatGPT, Cursor…)
 * so it can wire this form into an Eduvia page. Like Formspree's, but
 * specific to this app: the real endpoint, the fields the form already
 * sends, eduvia.my's look, and how the endpoint answers.
 */

function fieldLine(field: FieldDef): string {
  const kind =
    field.kind === "choice"
      ? `${field.multi ? "pick several" : "pick one"}${field.options?.length ? `: ${field.options.map((option) => `"${option}"`).join(", ")}` : ""}`
      : field.kind;
  return `- \`${field.key}\`: ${field.label} (${kind})`;
}

export function buildAiPrompt(args: { endpoint: string; formName: string; fields: FieldDef[]; allowedDomains: string[] }): string {
  const { endpoint } = args;
  const utmScript = `${new URL(endpoint).origin}/utm.js`;
  // UTM tags and came_from come from the script below, not from inputs on the form.
  const formFields = args.fields.filter((field) => !isTrackingKey(field.key));
  const fieldsSection = formFields.length
    ? `The form already sends these fields. Use the same \`name\` attributes so the answers keep lining up with my automations:\n\n${formFields.map(fieldLine).join("\n")}\n\nYou can add fields; new names are picked up automatically.`
    : "The form doesn't have any fields yet. Choose sensible `name` attributes (e.g. `name`, `email`, `message`); they're picked up automatically on the first submission.";
  const domains = args.allowedDomains.length
    ? `The endpoint only accepts submissions sent from pages on: ${args.allowedDomains.join(", ")} (subdomains included). Submissions from anywhere else, including localhost, are rejected with a 403, so test on the real site.`
    : "The endpoint accepts submissions from any site.";

  return `I have a form endpoint on my own form backend (it works like Formspree), for my form "${args.formName}":
${endpoint}

What follows are integration guides for different environments: Basic HTML, Vanilla JS (fetch), and React. Pick the guide that best matches my website and hosting environment. The guides are minimal examples: write form code tailored to my site.

---

# How the endpoint works

- Send a \`POST\` with the fields as \`application/x-www-form-urlencoded\`, \`multipart/form-data\` or JSON. Every field name is saved as-is; repeated names (checkboxes) or names ending in \`[]\` become lists. File uploads are not stored.
- Plain HTML submit: the visitor is redirected (303) to a redirect set by my automations, else \`_next\`, else my thank-you page.
- JavaScript submit: send \`Accept: application/json\` and you get JSON back:
  - success: \`{ "ok": true, "next": "https://..." | null }\`. If \`next\` is set, an automation chose where to send this person (it can depend on their answers): redirect the browser to it. Otherwise show a thank-you message in place.
  - failure: \`{ "ok": false, "error": "message to show" }\` with status 400, 403, 404, 413 or 429.
- CORS is enabled, so fetch() from the browser works.
- ${domains}

Special fields (all optional):
- \`_next\`: where to send people after a plain HTML submit. Must be a full URL on the same site.
- \`_subject\`: subject line of the notification email I receive.
- \`_replyto\`: the person's email, if the form names that field something other than \`email\`.
- \`_gotcha\`: spam honeypot. Always include it as a hidden text input that people can't see or tab to; bots fill it in and get silently dropped.

# Fields

${fieldsSection}

# Look

It goes on eduvia.my, so it must look like the rest of that site. If the page already has the site's CSS, reuse its classes and fonts. Otherwise use the Eduvia look, taken from its logo:
- Headings in "Claston" (the logo's typeface, if the site already loads it), everything else in "Plus Jakarta Sans" (Google Fonts). Labels 14px semibold above inputs.
- The form is a white card (#FFFFFF) on a #F5F7FC page, 22px radius, 1px solid rgba(20,26,94,.10) border, soft shadow \`0 8px 24px rgba(20,26,94,.06)\`, and a 6px gold (#EBC35C) strip along its top edge.
- Text is navy #141A5E; secondary text #545A80.
- Inputs: white, 1.5px solid rgba(20,26,94,.22) border, 12px radius, 12px 14px padding; on focus the border turns sky blue #5EB4FF with a 3px rgba(94,180,255,.14) ring.
- Submit button: a navy (#141A5E) pill with white text, 999px radius, 1em 1.5em padding, "→" after the label; hover #222A7A.
- Gold #EBC35C is for highlights only (the strip, selected options); sky blue #5EB4FF for focus and small accents; dark blue #1F63C6 for links. Errors: #B42318 on #FDECEA.

---

# Where people came from

Add this once to every page that has the form (in the \`<head>\`, or anywhere before \`</body>\`):

\`\`\`html
<script src="${utmScript}" defer></script>
\`\`\`

It works out where the visitor came from (\`came_from\`, e.g. "Google search", "Instagram", "Direct") and reads any UTM tags on the link they arrived on (\`utm_source\`, \`utm_medium\`, \`utm_campaign\`, \`utm_content\`, \`utm_term\`), keeps them for 30 days, and adds them as hidden fields to every form whose \`action\` is this endpoint, or that has a \`data-utm\` attribute. So:
- A form with \`action="${endpoint}"\` needs nothing else.
- A form submitted with fetch() and \`new FormData(form)\` and no \`action\`: give the \`<form>\` a \`data-utm\` attribute.
- If you send JSON instead of FormData, merge \`window.eduviaUtm?.()\` into the object you send.
Don't add your own \`came_from\` or \`utm_*\` inputs.

---

# Basic HTML

Point the form's \`action\` at the endpoint and set the method to \`POST\`:

\`\`\`html
<form action="${endpoint}" method="POST">
  <label for="email">Email</label>
  <input type="email" id="email" name="email" required>
  <label for="message">Message</label>
  <textarea id="message" name="message" required></textarea>
  <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" style="display:none">
  <button type="submit">Send</button>
</form>
\`\`\`

---

# Vanilla JS (fetch)

Stay on the page, show errors inline, and follow an automation's redirect:

\`\`\`html
<form id="my-form" data-utm novalidate>
  <label for="email">Email</label>
  <input type="email" id="email" name="email" required>
  <label for="message">Message</label>
  <textarea id="message" name="message" required></textarea>
  <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" style="display:none">
  <p id="my-form-status" role="status"></p>
  <button type="submit">Send</button>
</form>

<script>
  const form = document.getElementById("my-form");
  const status = document.getElementById("my-form-status");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    status.textContent = "Sending…";
    try {
      const res = await fetch("${endpoint}", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "Something went wrong.");
      if (out.next) return window.location.assign(out.next);
      form.reset();
      status.textContent = "Thanks! We've got it.";
    } catch (error) {
      status.textContent = error.message || "Couldn't send. Check your connection and try again.";
    } finally {
      button.disabled = false;
    }
  });
</script>
\`\`\`

---

# React

No library needed:

\`\`\`jsx
import { useState } from "react";

const ENDPOINT = "${endpoint}";

export function ContactForm() {
  const [state, setState] = useState({ submitting: false, succeeded: false, error: "" });

  async function handleSubmit(event) {
    event.preventDefault();
    setState({ submitting: true, succeeded: false, error: "" });
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(event.currentTarget),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "Something went wrong.");
      if (out.next) return window.location.assign(out.next);
      setState({ submitting: false, succeeded: true, error: "" });
    } catch (error) {
      setState({ submitting: false, succeeded: false, error: error.message });
    }
  }

  if (state.succeeded) return <p>Thanks! We've got it.</p>;
  return (
    <form onSubmit={handleSubmit} data-utm>
      <label htmlFor="email">Email</label>
      <input type="email" id="email" name="email" required />
      <label htmlFor="message">Message</label>
      <textarea id="message" name="message" required />
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" style={{ display: "none" }} />
      {state.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={state.submitting}>Send</button>
    </form>
  );
}
\`\`\`

---

Based on my tech stack, apply the matching guide above, use the fields listed under "Fields", and suggest any code changes needed.`;
}
