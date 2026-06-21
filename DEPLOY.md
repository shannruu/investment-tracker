# Deploying Investment Ledger to GitHub + Vercel

Your site is **100% static** (HTML/CSS/JS, relative paths, no build step, no external
libraries). That means it works on any device once it has a URL — Vercel is a perfect fit
and the free tier is enough.

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
README.md
.gitignore
```

All files sit in one flat folder (no subfolders), so you can select them all at once in
GitHub's upload dialog.

---

## Method A — No tools to install (easiest)

Upload through the GitHub website, then import into Vercel.

### 1. Create the GitHub repo
1. Go to https://github.com/new
2. Repository name: `investment-ledger` → **Create repository**

### 2. Upload your files
1. On the new repo page, click **“uploading an existing file”**.
2. Click **choose your files**, then in the file dialog open this folder and select all
   7 files at once (`index.html`, `app.js`, `data.js`, `styles.css`, `README.md`,
   `.gitignore`, `DEPLOY.md`) — tip: click the first, then `Ctrl+A` to select all.
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

## Notes

- **Custom domain:** Vercel → Project → Settings → Domains, to add your own.
- **It already works on mobile** (responsive layout + bottom nav).
- **Updating data:** edit `data.js` and re-upload / push — no rebuild needed.
- If a page ever looks stale after an update, hard-refresh with `Ctrl+Shift+R`.
