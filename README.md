# Quolume Marketing

**marketing.quolume.com** does two things:

1. **Forms**: Formspree-style endpoints. quolume.com keeps its own form and its own design, and posts to `/f/<id>`. Every answer is saved, emailed to you, and handed to your automations.
2. **Automations**: what happens after someone submits. Conditions on their answers, redirects, emails to them, alerts to your team, waits and webhooks. Same engine as the SEKOOL All-in-One app.

Only for Quolume. Built with the same stack as SEKOOL (Next.js 16, Prisma 7, MySQL on Hostinger).

## Forms

Point any HTML form at an endpoint:

```html
<form action="https://marketing.quolume.com/f/quolume-apply" method="POST">
  <input name="name" required>
  <input name="email" type="email" required>
  <input type="text" name="_gotcha" style="display:none">
  <button>Send</button>
</form>
```

Or post JSON/FormData with `fetch()` and `Accept: application/json` to get `{ "ok": true, "next": "<redirect or null>" }` back.

- **Nothing to set up.** Like Formspree, a form is just an endpoint: whatever `name`s the page's inputs have are saved. The app quietly remembers the names and a few short answers it has seen, to suggest them in automation conditions.
- **Each form has:** Overview (submissions in the last 30 days, per day), Integration (the endpoint and an AI-assistant prompt), Submissions, Workflow (its automations) and Settings.
- **Special fields:** `_next` (redirect after a plain HTML submit, must be on an allowed domain), `_subject` (notification subject), `_replyto`, `_gotcha` (honeypot).
- **Only accept submissions from:** lock a form to your domains (subdomains included). Blocks other sites from using your endpoint.
- **On brand:** the app, the copy-paste HTML snippet, the hosted thank-you page and every email use quolume.com's own look: the pencil logo, Plus Jakarta Sans, paper background and pencil-outlined cards. The files are copied from the site into `public/brand/`.
- **Use with AI assistants:** each form's Integration tab has a copyable prompt with the endpoint, the form's fields and the quolume.com look, so an AI can build the form into a page.
- **After submitting:** an automation's Redirect wins, then `_next`, then the form's redirect link, then the hosted thank-you page.
- Submissions: browse, delete, download CSV. Rate limited per visitor (15 per 10 minutes per form).

## Automations

A flow starts when one or more chosen forms are submitted. Steps:

| Step | What it does |
| --- | --- |
| Condition | Splits into Yes/No on an answer: pick a field the form has sent, or type its name. is, is one of, contains, more than, between, before/after a date, weekday/weekend… |
| Redirect | Sends the person to a page the moment they submit. Under a Condition, different answers go to different pages. |
| Email them | Emails the person who submitted, in the Quolume look, with an unsubscribe link. |
| Email my team | Alerts fixed addresses with all the answers. Reply goes to the person. |
| Wait | Pauses for minutes, hours or days. Resumed by the cron job. |
| Google Sheets | Adds the submission as a new row in a sheet picked from Google Drive: Submitted at, Name, Email, then every field. Missing column headers are added by themselves. |
| Webhook | POSTs the submission as JSON to another app, e.g. Zapier or Make. |

Text can use `{{name}}`, `{{email}}`, `{{form_name}}`, `{{submitted_at}}`, `{{answers}}` and `{{<field key>}}`. Each automation's **Runs** tab shows what happened to every person, step by step.

## Running it

```bash
cp .env.example .env   # fill in DATABASE_URL etc.
npm install
npm run dev            # or: npm run build && npm start
npm test
```

The app creates and updates its own tables on start-up (`src/lib/migrate.ts`, SQL in `src/lib/migrations.ts`), because Hostinger's build container can't reach the database. On a brand-new database it also creates the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and the `quolume-apply` form used by quolume.com.

**Changing the schema:** edit `prisma/schema.prisma`, then append a migration to `src/lib/migrations.ts` with the SQL from `npx prisma migrate diff --from-schema <old> --to-schema prisma/schema.prisma --script`. Never edit a migration that has shipped.

## Hosting (Hostinger)

- Node.js web app for `marketing.quolume.com`, deployed from this repository with root directory `marketing-app`, framework Next.js, build script `hostinger-build`, Node 22.
- Environment variables: see `.env.example`. `DATABASE_URL` uses `127.0.0.1:3306` (the database is on the same server).
- Cron job every 5 minutes: `curl -s "https://marketing.quolume.com/api/cron/automations?secret=<CRON_SECRET>" > /dev/null`
- Google Sheets: set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (an OAuth client, type Web application) and `GOOGLE_PICKER_API_KEY` (an API key with the Google Picker API enabled). The OAuth client needs the redirect URI `https://marketing.quolume.com/api/google/callback`; the Sheets and Picker APIs must be enabled. Then press Connect Google on the Account page. Scopes: `spreadsheets` and `drive.file` (only files picked in the Picker).
- Email: set `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_API_KEY` (Resend, Gmail app password, or a Hostinger mailbox). Until then submissions are saved, and emails are skipped and logged on the run.
