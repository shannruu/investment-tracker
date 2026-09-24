# Deploying Divz to GitHub + Vercel

Your site is **static** (HTML/CSS/JS, relative paths) — that's still true for everything
you actually see and use. That means it works on any device once it has a URL — Vercel is
a perfect fit and the free tier is enough. Two optional exceptions, both off by default and
both safe to skip entirely:
- **Cloud Sync** (see below) — if you set it up, the browser loads one small library from
  a CDN at runtime; everything else about the deploy stays exactly the same.
- **Price Alerts** (see below) — this is the one piece that isn't purely static. It adds a
  `package.json` (so Vercel installs two small server-side libraries for one function,
  `api/check-alerts.js`) and needs its own Supabase tables, VAPID keys, and an external
  cron ping. If you never set it up, `package.json` just sits there unused and the rest of
  the site is unaffected.

> ⚠️ **Do not upload the `.claude/` folder.** It holds local editor settings, not website
> files. The included `.gitignore` excludes it automatically when you use git. If you use
> the drag-and-drop method below, simply don't select that folder.

---

## What gets published (these are all you need)

```
index.html
app.js
data.js
styles.css
supabase-client.js
sync.js
alerts.js
sw.js
manifest.json
package.json
api/            (folder — quote.js, dividend.js, search.js, ex-dividend-calendar.js,
                 ex-dividend-calendar-my.js, stock-symbol-my.js, check-alerts.js)
icons/          (folder — icon-192.png, icon-512.png)
README.md
.gitignore
```

`alerts.js` and `package.json` are needed even if you never set up Price Alerts — they
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
enabled (this app only uses passwordless magic links — no password to configure).

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

Re-deploy (push the updated `supabase-client.js`), then Settings → Account & Cloud Sync
will show a sign-in form instead of "not configured."

---

## Optional: Price Alerts setup (real push notifications)

Set a target price for any ticker and get a real push notification — even with the app
fully closed — when it's crossed. **Requires Cloud Sync to be set up first** (above): a
server has to check your alerts on a schedule with no browser open, so it needs to know
*whose* alerts to check, which only works with an account.

This is the one part of Divz that isn't purely static: Vercel needs to install two small
server-side libraries (`package.json`, already in the repo) for one function,
`api/check-alerts.js`, that runs the check. Nothing else about how the site is served
changes — Build Command and Output Directory stay empty exactly as in Method A above.

### 1. Add two more tables to the same Supabase project
In the same project's **SQL Editor** (the one `ledger_data` already lives in), run:

```sql
create table price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  direction text not null check (direction in ('above', 'below')),
  target_price numeric not null check (target_price > 0),
  recurring boolean not null default false,
  enabled boolean not null default true,
  armed boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table price_alerts enable row level security;
create policy "select own" on price_alerts for select using (auth.uid() = user_id);
create policy "insert own" on price_alerts for insert with check (auth.uid() = user_id);
create policy "update own" on price_alerts for update using (auth.uid() = user_id);
create policy "delete own" on price_alerts for delete using (auth.uid() = user_id);
create trigger price_alerts_set_updated_at
before update on price_alerts
for each row execute function set_updated_at();  -- reuses the function ledger_data's SQL already created

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy "select own" on push_subscriptions for select using (auth.uid() = user_id);
create policy "insert own" on push_subscriptions for insert with check (auth.uid() = user_id);
create policy "delete own" on push_subscriptions for delete using (auth.uid() = user_id);
```

### 2. Copy your project's service-role key
In **Settings → API**, copy the **`service_role`** secret key (it already exists on every
Supabase project — nothing to create). **This key bypasses Row Level Security — it must
never appear in any file that ships to the browser** (not `supabase-client.js`, not
`alerts.js`, nowhere client-side). It only ever belongs in a Vercel environment variable,
read server-side by `api/check-alerts.js`.

### 3. Set the Vercel environment variables
Vercel → your project → **Settings → Environment Variables**, add all five (Production):

| Name | Value |
|---|---|
| `SUPABASE_URL` | Same Project URL as `supabase-client.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | From step 2 above |
| `VAPID_PUBLIC_KEY` | Provided alongside this setup — also already in `alerts.js` |
| `VAPID_PRIVATE_KEY` | Provided alongside this setup — **never put this one in any file** |
| `CRON_SECRET` | Any random string — also provided alongside this setup |

Re-deploy after adding these (Vercel → Deployments → **⋯ → Redeploy**, or just push any
commit) so the function actually picks them up.

### 4. Point an external cron pinger at the checker
Vercel's own free-tier cron only runs once a day, which is too coarse for a price alert —
instead, a free external pinger calls the checker on a real schedule:

1. Sign up free at [cron-job.org](https://cron-job.org) (no card needed).
2. Create a new cron job:
   - URL: `https://<your-domain>/api/check-alerts?key=<CRON_SECRET>` (the same
     `CRON_SECRET` value from step 3)
   - Schedule: every 5 minutes
3. Only enable it once step 3's redeploy is confirmed live — otherwise it'll just hit a
   500 until the environment variables are in place.

### 5. Use it on your iPhone
Web Push for installed PWAs has worked on iOS since 16.4, so this needs no native app —
but it only works from the **installed** app, not a regular Safari tab:

1. Open Divz from its **Home Screen icon** (Add to Home Screen first if you haven't).
2. Sign in via Profile → Account & Cloud Sync.
3. Go to the new **Price Alerts** page, tap **Enable notifications**, accept the iOS
   permission prompt.
4. Add an alert — a ticker, a direction, and a target price.

If push ever seems to stop working (e.g. after deleting and re-adding the Home Screen
icon), the fix is just re-tapping "Enable notifications" on that page — no redeploy needed.

---

## Notes

- **Custom domain:** Vercel → Project → Settings → Domains, to add your own.
- **It already works on mobile** (responsive layout + bottom nav).
- **Updating data:** edit `data.js` and re-upload / push — no rebuild needed.
- If a page ever looks stale after an update, hard-refresh with `Ctrl+Shift+R`.
