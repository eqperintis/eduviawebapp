# Eduvia Marketing

**marketing.eduvia.my** does two things:

1. **Forms**: Formspree-style endpoints. eduvia.my keeps its own form and its own design, and posts to `/f/<id>`. Every answer is saved, emailed to you, and handed to your automations.
2. **Automations**: what happens after someone submits. Conditions on their answers, redirects, emails to them, alerts to your team, waits, Google Sheets rows and webhooks.

Started from the Quolume marketing app and rebranded for Eduvia. Next.js 16, React 19, Prisma 7, MySQL on Hostinger.

**Setting it up on Hostinger, email and Google Sheets: see [docs/SETUP.md](docs/SETUP.md).**

## Forms

Point any HTML form at an endpoint:

```html
<form action="https://marketing.eduvia.my/f/eduvia-enquiry" method="POST">
  <input name="name" required>
  <input name="email" type="email" required>
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <button>Send</button>
</form>
```

Or post JSON/FormData with `fetch()` and `Accept: application/json` to get `{ "ok": true, "next": "<redirect or null>" }` back. Errors come back as `{ "errors": [{ "message": "…" }] }`, like Formspree.

- **Nothing to set up.** A form is just an endpoint: whatever `name`s the page's inputs have are saved. The app also reads the page the form sits on (public pages only) to learn every dropdown, radio and checkbox option, for automation conditions.
- **Each form has:** Overview (submissions in the last 30 days and the latest ones), Integration (the endpoint and an AI-assistant prompt), Submissions (read, delete, download CSV), Workflow (its automations) and Settings.
- **Special fields:** `_next` (redirect after a plain HTML submit, must be on an allowed domain), `_subject` (notification subject), `_replyto`, `_gotcha` (honeypot: filled in, it pretends to succeed and stores nothing).
- **Only accept submissions from:** lock a form to your domains (subdomains included).
- **After submitting:** an automation's Redirect wins, then `_next`, then the form's redirect link, then the hosted thank-you page.
- Rate limited per visitor (15 per 10 minutes per form).

## Automations

A flow starts when one or more chosen forms are submitted. Steps:

| Step | What it does |
| --- | --- |
| Condition | Splits into Yes/No on an answer: is, is one of, contains, more than, between, before/after a date, weekday/weekend… |
| Redirect | Sends the person to a page the moment they submit. Under a Condition, different answers go to different pages. |
| Email them | Emails the person who submitted, in the Eduvia look, with an unsubscribe link. |
| Email my team | Alerts fixed addresses with all the answers. |
| Wait | Pauses for minutes, hours or days. Resumed by the cron job. |
| Google Sheets | Adds the submission as a row in a sheet picked from Google Drive. |
| Webhook | POSTs the submission as JSON to another app, e.g. Zapier or Make. |

Text can use `{{name}}`, `{{email}}`, `{{form_name}}`, `{{submitted_at}}`, `{{answers}}` and `{{<field name>}}`. Each automation's **Runs** tab shows what happened to every person, step by step.

## Brand

Colours and logo paths live in `src/lib/brand.ts` and `src/app/globals.css`: navy `#141A5E`, gold `#EBC35C`, sky `#5EB4FF`. Headings use Claston (the logo's typeface), body text Plus Jakarta Sans. Logo files are in `public/brand/`: `eduvia-logo.svg` (on light), `eduvia-logo-light.svg` (on navy), `eduvia-mark.svg` (icon), `eduvia-logo-email.png` (emails).

## Running it locally

```bash
cp .env.example .env   # fill in DATABASE_URL etc.
npm install
npm run dev            # or: npm run build && npm start
npm test
npm run lint
```

The app creates and updates its own tables on start-up (`src/lib/migrate.ts`, SQL in `src/lib/migrations.ts`), because Hostinger's build machine can't reach the database. On a brand-new database it also creates the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and the `eduvia-enquiry` form.

**Changing the schema:** edit `prisma/schema.prisma`, then append a migration to `src/lib/migrations.ts` with the SQL from `npx prisma migrate diff --from-schema <old> --to-schema prisma/schema.prisma --script`. Never edit a migration that has shipped.

**Never use Prisma `startsWith` / `contains` / `endsWith`** (SQL `LIKE`): Hostinger MySQL fails with "Illegal mix of collations". Filter in code instead.
