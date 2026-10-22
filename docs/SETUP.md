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

1. On GitHub, the repo only has the branch `claude/new-session-bm3tqj`. Make a `main` branch from it: open the repo, click the branch menu, type `main`, choose **Create branch: main from claude/new-session-bm3tqj**. Then **Settings** → **General** → **Default branch** → switch to `main`.
2. hPanel → **Websites** → **Add website** → **Node.js Web App** → **Import Git repository**.
3. **Connect with GitHub** (first time only): sign in as `eqperintis`, install the Hostinger app and give it access to `eduviawebapp`.
4. Pick `eqperintis/eduviawebapp`, branch `main`, domain **marketing.eduvia.my**.
5. Build settings:
   - Framework: **Next.js**
   - Node version: **22**
   - Root directory: `./` (the app is at the top of the repo)
   - Build command: `npm run hostinger-build`
   - Package manager: **npm**
6. Enter the environment variables from step 3 on the same screen, then **Deploy**. Pushes to `main` deploy again by themselves.
7. Websites → marketing.eduvia.my → **Security** → **SSL**: make sure it's active (free Let's Encrypt).

## 3. Environment variables

hPanel → the Node.js app → **Environment variables**. Hostinger replaces the **whole set** each time you save, so always enter all of them:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | from step 1 |
| `SESSION_SECRET` | a long random string (`openssl rand -base64 32`) |
| `ADMIN_EMAIL` | `eqperintis.a@gmail.com` |
| `ADMIN_PASSWORD` | the password you'll sign in with first (change it later on the Account page) |
| `APP_URL` | `https://marketing.eduvia.my` |
| `CRON_SECRET` | another long random string |
| `TZ` | `Asia/Kuala_Lumpur` |
| `EMAIL_PROVIDER` | `gmail` |
| `EMAIL_FROM` | `eqperintis.a@gmail.com` |
| `EMAIL_FROM_NAME` | `Eduvia` (the sender name people see) |
| `EMAIL_API_KEY` | the Google App Password from step 4 |
| `GOOGLE_CLIENT_ID` | step 6 |
| `GOOGLE_CLIENT_SECRET` | step 6 |
| `GOOGLE_PICKER_API_KEY` | step 6 |

A changed variable only takes effect after a **new build**: push a commit or press **Rebuild** after saving.

After the first deploy, open the app's **Runtime logs**. You should see `[migrate] applied …`, `created admin …` and `created the Eduvia enquiry form`, and no errors. One "Server is not running" line during a restart is harmless.

## 4. Email (from eqperintis.a@gmail.com)

The app sends through Gmail with an **App Password**, a separate 16-character password only for this app. Your real Gmail password is never used.

1. Sign in to <https://myaccount.google.com> as `eqperintis.a@gmail.com`.
2. **Security** → turn on **2-Step Verification** (App Passwords only exist once it's on).
3. Open <https://myaccount.google.com/apppasswords>, name it `Eduvia Marketing`, press **Create**. Copy the 16 letters (spaces don't matter).
4. In hPanel's environment variables (all of them, step 3): `EMAIL_PROVIDER=gmail`, `EMAIL_FROM=eqperintis.a@gmail.com`, `EMAIL_FROM_NAME=Eduvia`, `EMAIL_API_KEY=<the 16 letters>`. Rebuild.
5. Check: the Account page says "Emails go out through gmail as eqperintis.a@gmail.com". In any automation, open an **Email them** step and press **Send me a test**.

Good to know:
- Replies to the "new submission" alert go straight to the person who filled in the form (and the email has a **Reply** button too).
- A personal Gmail account can send about **500 emails a day**. Plenty for enquiries; not for mass mail-outs.
- If **Send me a test** fails with a timeout or "connection refused", the Hostinger server isn't allowed to reach Gmail's mail server. Then send from a mailbox on eduvia.my instead: create one in hPanel → **Emails**, and use `EMAIL_PROVIDER=hostinger`, `EMAIL_FROM=<that mailbox>`, `EMAIL_API_KEY=<its password>`.

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
   - App name: `Eduvia Marketing`. User support email: `eqperintis.a@gmail.com`.
   - Audience: **External**.
   - Contact email: `eqperintis.a@gmail.com`. Agree and **Create**.
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

- Sign in at https://marketing.eduvia.my as `eqperintis.a@gmail.com`.
- Submit the form on eduvia.my: it shows under **Submissions**, you get the alert email, and an active automation shows a run under **Runs**.
- **Send me a test** arrives from Eduvia <eqperintis.a@gmail.com>, in the Eduvia look.
- A Google Sheets step adds a row.
