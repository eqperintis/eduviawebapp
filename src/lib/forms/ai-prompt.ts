import type { FieldDef } from "@/lib/forms/fields";

/**
 * A prompt the owner pastes into an AI assistant (Claude, ChatGPT, Cursor…)
 * so it can wire this form into a Quolume page. Like Formspree's, but
 * specific to this app: the real endpoint, the fields the form already
 * sends, quolume.com's look, and how the endpoint answers.
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
  const fieldsSection = args.fields.length
    ? `The form already sends these fields. Use the same \`name\` attributes so the answers keep lining up with my automations:\n\n${args.fields.map(fieldLine).join("\n")}\n\nYou can add fields; new names are picked up automatically.`
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

It goes on quolume.com, so match quolume.com's apply form exactly. If the page already has the site's CSS, reuse its classes (\`.field\`, \`.btn\`, the pencil-outlined \`form\`). Otherwise the look is a sketchbook page:
- Font "Plus Jakarta Sans" (self-hosted at /assets/fonts/plus-jakarta-sans.woff2), labels 13px semibold above inputs.
- The form is a white card on the #F7F8F5 paper background, outlined in a pencil line: \`border-image: url("/assets/sketch-card.webp") 80 / 40px / 12px round\` on a \`::after\` with a 28px transparent border.
- Inputs: background #F7F8F5, 1.4px solid rgba(34,34,34,.32) border, 10px radius, 12px 14px padding; focus ring 2px #4338CA.
- Submit button: #222222 background, #F7F8F5 text, 14px radius, with a 1.4px pencil outline drawn by the page's \`filter: url(#rough)\` SVG filter, and a mono "→" after the label.
- Indigo (#4F46E5) is only the "pen": labels, highlights, error box. No gradients, glows or drop shadows.

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
<form id="my-form" novalidate>
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
    <form onSubmit={handleSubmit}>
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
