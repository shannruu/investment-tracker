# Deploying Investment Ledger to GitHub + Vercel

Your site is **100% static** (HTML/CSS/JS, relative paths, no build step, no `npm install`).
That means it works on any device once it has a URL — Vercel is a perfect fit and the free
tier is enough. The only optional exception is **Cloud Sync** (see below) — if you set it
up, the browser loads one small library from a CDN at runtime; everything else about the
deploy stays exactly the same.

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
README.md
.gitignore
```

All files sit in one flat folder (no subfolders), so you can select them all at once in
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
git commit -m "Investment Ledger dashboard"
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

## Notes

- **Custom domain:** Vercel → Project → Settings → Domains, to add your own.
- **It already works on mobile** (responsive layout + bottom nav).
- **Updating data:** edit `data.js` and re-upload / push — no rebuild needed.
- If a page ever looks stale after an update, hard-refresh with `Ctrl+Shift+R`.
