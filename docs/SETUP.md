# Setting up marketing.eduvia.my

Do these in order. Each step says where to click. Nothing here needs a password
or key in the code: they all go in Hostinger's environment variables.

## 1. Database

1. hPanel → **Websites** → eduvia.my → **Databases** → **MySQL Databases**.
2. Create a database and a user (for example `u123_eduvia` / `u123_eduvia`), with a strong password.
3. Your `DATABASE_URL` is `mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE`.
   Use **127.0.0.1**, not `localhost`. If the password has symbols, URL-encode them (`@` → `%40`, `#` → `%23`).

The app creates its own tables the first time it starts. Don't run any Prisma migrate command.

## 2. The Node.js app

1. hPanel → **Websites** → **Add website** → **Node.js app** → **Import Git repository**.
2. Pick the GitHub repo `eqperintis/eduviawebapp` and the branch you deploy from (merge `claude/new-session-bm3tqj` into `main` first, then pick `main`).
3. Settings:
   - Framework: **Next.js**
   - Node version: **22**
   - Root directory: `/` (the app is at the top of the repo)
   - Build command: `npm run hostinger-build`
   - Turn on **auto-deploy** on push.
4. Domain: **marketing.eduvia.my**. Hostinger adds the DNS record if eduvia.my's DNS is on Hostinger; otherwise add the record it shows you. Turn on SSL (free Let's Encrypt).

## 3. Environment variables

hPanel → the Node.js app → **Environment variables**. Hostinger replaces the **whole set** each time you save, so always enter all of them:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | from step 1 |
| `SESSION_SECRET` | a long random string (`openssl rand -base64 32`) |
| `ADMIN_EMAIL` | `eduvia.alif@gmail.com` |
| `ADMIN_PASSWORD` | the password you'll sign in with first (change it later on the Account page) |
| `APP_URL` | `https://marketing.eduvia.my` |
| `CRON_SECRET` | another long random string |
| `TZ` | `Asia/Kuala_Lumpur` |
| `EMAIL_PROVIDER` | `hostinger_api` |
| `HOSTINGER_MAIL_TOKEN` | step 4 |
| `HOSTINGER_MAILBOX_ID` | step 4 |
| `EMAIL_FROM` | the sending mailbox, e.g. `hello@eduvia.my` |
| `EMAIL_FROM_NAME` | the sender name people see, e.g. `Eduvia` |
| `GOOGLE_CLIENT_ID` | step 6 |
| `GOOGLE_CLIENT_SECRET` | step 6 |
| `GOOGLE_PICKER_API_KEY` | step 6 |

A changed variable only takes effect after a **new build**: push a commit or press **Rebuild** after saving.

After the first deploy, open the app's **Runtime logs**. You should see `[migrate] applied …`, `created admin …` and `created the Eduvia enquiry form`, and no errors. One "Server is not running" line during a restart is harmless.

## 4. Email (Hostinger Business Email)

1. Create the sending mailbox if it doesn't exist: hPanel → **Emails** → eduvia.my → **Create email account** (e.g. `hello@eduvia.my`).
2. Create a **Mail API token scoped to only that mailbox** and note the **mailbox ID**. The easiest way is to ask Claude with the **Hostinger connector** attached: "Create a Mail API token for hello@eduvia.my only and tell me its mailbox ID". You never need the mailbox password for this.
3. Put them in `HOSTINGER_MAIL_TOKEN` and `HOSTINGER_MAILBOX_ID`, then rebuild.
4. Check: Account page says "Emails go out through your Hostinger mailbox". In any automation, open an **Email them** step and press **Send me a test**.

The Mail API has no Reply-To, so the "new submission" alert has a **Reply** button that opens an email to the person instead.

Fallback if you can't get a token: `EMAIL_PROVIDER=hostinger`, `EMAIL_FROM=hello@eduvia.my`, `EMAIL_API_KEY=<mailbox password>` (SMTP).

## 5. Cron job (for Wait steps)

hPanel → **Advanced** → **Cron Jobs** → every 5 minutes (`*/5 * * * *`), command:

```
curl -s "https://marketing.eduvia.my/api/cron/automations?secret=YOUR_CRON_SECRET" > /dev/null
```

## 6. Google Sheets (Google Cloud console)

All at <https://console.cloud.google.com>, signed in with the Google account that owns the sheets.

1. **Project**: top bar → project picker → **New project** → name `Eduvia Marketing` → Create. Make sure it's selected.
2. **Enable the APIs**: **APIs & Services** → **Library**. Search and **Enable** each:
   - Google Sheets API
   - Google Drive API
   - Google Picker API
3. **OAuth consent screen** (Google Auth Platform): **APIs & Services** → **OAuth consent screen** → **Get started**.
   - App name: `Eduvia Marketing`. User support email: `eduvia.alif@gmail.com`.
   - Audience: **External**.
   - Contact email: `eduvia.alif@gmail.com`. Agree and **Create**.
4. **Branding** (left menu):
   - App logo: upload `public/brand/apple-touch-icon.png` from this repo (120×120 or larger, square).
   - App home page: `https://eduvia.my`
   - Privacy policy: `https://marketing.eduvia.my/privacy` (already live in this app, with Google's Limited Use wording)
   - Authorized domains: add `eduvia.my`.
   - Save.
5. **Data access** (left menu) → **Add or remove scopes** → tick:
   - `.../auth/spreadsheets`
   - `.../auth/drive.file`
   - `.../auth/userinfo.email`
   Save.
6. **OAuth client**: **Clients** → **Create client** → type **Web application**, name `Eduvia Marketing`.
   - Authorized JavaScript origins: `https://marketing.eduvia.my`
   - Authorized redirect URIs: `https://marketing.eduvia.my/api/google/callback`
   - Create. Copy the **Client ID** → `GOOGLE_CLIENT_ID`, **Client secret** → `GOOGLE_CLIENT_SECRET`.
7. **API key for the Picker**: **APIs & Services** → **Credentials** → **Create credentials** → **API key**. Then **Edit** it:
   - Application restrictions: **Websites**, add `https://marketing.eduvia.my/*`
   - API restrictions: **Restrict key** → only **Google Picker API**.
   - Save. Copy it → `GOOGLE_PICKER_API_KEY`.
8. **Publish**: **Audience** → **Publish app** → Confirm. Until you publish, only test users can connect and the connection expires after 7 days. With `spreadsheets` Google may ask for verification; follow its prompts (the privacy page and authorized domain from step 4 are what it checks). While it's pending you can still connect your own account by pressing **Advanced → Go to Eduvia Marketing** on the warning screen.
9. Save the three values in hPanel (all variables, step 3) and rebuild.
10. In the app: **Account** → **Connect Google**. Then add a **Google Sheets** step to an automation, pick a sheet, map the columns, submit a test.

## 7. Point eduvia.my's form at it

On the page with the enquiry form, set:

```html
<form action="https://marketing.eduvia.my/f/eduvia-enquiry" method="POST">
  … your inputs, each with a name="…" …
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
</form>
```

Or open the form's **Integration** tab, press **Copy prompt** and give it to an AI assistant along with the page's code.

The form only accepts submissions from `eduvia.my` (and its subdomains). Change that under the form's **Settings**.

## 8. Final checks

- Sign in at https://marketing.eduvia.my as `eduvia.alif@gmail.com`.
- Submit the form on eduvia.my: it shows under **Submissions**, you get the alert email, and an active automation shows a run under **Runs**.
- **Send me a test** arrives from your sender name and mailbox, in the Eduvia look.
- A Google Sheets step adds a row.
