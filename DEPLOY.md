# Deploying Divz to GitHub + Vercel

Your site is **static** (HTML/CSS/JS, relative paths) — that's still true for everything
you actually see and use. That means it works on any device once it has a URL — Vercel is
a perfect fit and the free tier is enough. Two optional exceptions, both off by default and
both safe to skip entirely:
- **Cloud Sync** (see below) — if you set it up, the browser loads one small library from
  a CDN at runtime; everything else about the deploy stays exactly the same.
- **Delete account** (Account page) is the one piece that isn't purely static: `api/delete-account.js` needs the
  `package.json` (Vercel installs `@supabase/supabase-js` for it) and two Vercel environment variables,
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Without them the Delete account button reports that it is not set up
  and the rest of the site is unaffected.

> ⚠️ **Do not upload the `.claude/` folder.** It holds local editor settings, not website
> files. The included `.gitignore` excludes it automatically when you use git. If you use
> the drag-and-drop method below, simply don't select that folder.

---

## What gets published (these are all you need)

```
index.html
app.js
dashboard.js
data.js
styles.css
supabase-client.js
sync.js
account.js
alerts.js
tabletips.js
sw.js
manifest.json
package.json
api/            (folder — quote.js, history.js, dividend.js, search.js, ex-dividend-calendar.js,
                 ex-dividend-calendar-my.js, stock-symbol-my.js, delete-account.js)
icons/          (folder — icon-192.png, icon-512.png)
README.md
.gitignore
```

`dashboard.js` is the Dashboard page itself (and `api/history.js` feeds its "Net worth over time" chart with daily
prices — without it the chart falls back to the values saved on each visit). `alerts.js` and `package.json` are needed even if you never set up Price Alerts — they
no-op safely (the page shows "not configured" the same way the Account panel does before
Cloud Sync is set up). `api/` already powers live quotes, search, and dividend history in
production today even without either optional feature turned on.

All the top-level files sit in one flat folder, so you can select them all at once in
GitHub's upload dialog. `supabase-client.js` and `sync.js` are needed even if you don't set
up Cloud Sync — they no-op safely and show "not configured" until you do (see below).

---

## Method A — No tools to install (easiest)

Upload through the GitHub website, then import into Vercel.

### 1. Create the GitHub repo
1. Go to https://github.com/new
2. Repository name: `investment-ledger` → **Create repository**

### 2. Upload your files
1. On the new repo page, click **“uploading an existing file”**.
2. Click **choose your files**, then in the file dialog open this folder and select all
   9 files at once (`index.html`, `app.js`, `data.js`, `styles.css`, `supabase-client.js`,
   `sync.js`, `README.md`, `.gitignore`, `DEPLOY.md`) — tip: click the first, then `Ctrl+A`
   to select all.
   - **Do not upload the `.claude` folder** (it's local settings, not website files).
3. Click **Commit changes**.

### 3. Connect Vercel
1. Go to https://vercel.com → **Sign up / Log in with GitHub**.
2. **Add New… → Project** → import your `investment-ledger` repo.
3. Framework Preset: **Other**. Leave Build Command and Output Directory **empty**.
4. Click **Deploy**.

After ~20 seconds you get a public URL like
`https://investment-ledger.vercel.app` — open it on any phone or computer.

Every future change you upload to GitHub redeploys automatically.

---

## Method B — Using git (if you install it)

Install Git from https://git-scm.com/download/win, then in this folder:

```powershell
git init
git add .
git commit -m "Divz dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/investment-ledger.git
git push -u origin main
```

Then do **step 3 (Connect Vercel)** above.

---

## Method C — Vercel CLI (needs Node.js)

If you install Node.js (https://nodejs.org), you can deploy straight from this folder
without GitHub:

```powershell
npm i -g vercel
vercel        # first run links/creates the project
vercel --prod # publish to the public URL
```

---

## Optional: Cloud Sync setup

By default, everyone's data stays local to their own browser — nothing leaves the device.
If you'd like your own data to follow you across devices, you can turn on optional sync
backed by [Supabase](https://supabase.com) (a free-tier Postgres + auth service). This is
entirely opt-in — skip this section and the app works exactly as before, with an
"unconfigured" Account panel in Settings.

### 1. Create a Supabase project
Sign up at https://supabase.com, create a new project, and open its **SQL Editor**. Run:

```sql
create table ledger_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table ledger_data enable row level security;
create policy "select own" on ledger_data for select using (auth.uid() = user_id);
create policy "insert own" on ledger_data for insert with check (auth.uid() = user_id);
create policy "update own" on ledger_data for update using (auth.uid() = user_id);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger ledger_data_set_updated_at
before update on ledger_data
for each row execute function set_updated_at();
```

### 2. Enable email sign-in
In the Supabase dashboard, under **Authentication → Providers**, make sure **Email** is
enabled. The app uses ordinary email + password sign-up/sign-in (not a magic link) — a
magic-link email opens in Safari on iOS rather than the installed app it was sent from, so
the session never reaches the standalone PWA. Password sign-in is a same-context API call
with no redirect, so it works from the installed app every time.

If **Confirm email** is on for the project (Authentication → Providers → Email), a new
account needs one confirmation-email click before its first sign-in — after that, sign-in
is password-only, no email involved.

### 3. Add your project's keys
In **Settings → API**, copy the **Project URL** and the **anon / public key**. Open
`supabase-client.js` and replace the two placeholders:

```js
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

**Never use the `service_role` key here** — it bypasses Row Level Security. Only the anon
key belongs in client-side code; the SQL policies above are what actually keep each
account's data private, not the key itself.

Re-deploy (push the updated `supabase-client.js`), then the opening page will ask people to sign
in or create an account, and the Account page will show Cloud sync instead of "not set up."

---

---

## Optional: "Delete my account" (Account -> Danger zone)

The button calls `api/delete-account.js`, which needs two environment variables in Vercel
(Settings -> Environment Variables, Production), then a redeploy:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Same Project URL as `supabase-client.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase -> Settings -> API -> `service_role` secret. **Never put it in any file in the repo.** |

Until they are set the button answers "Account deletion isn't switched on for this site yet".
