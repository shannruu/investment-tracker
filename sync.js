/* =============================================================================
 * Cloud Sync — optional, opt-in cross-device sync via Supabase.
 * -----------------------------------------------------------------------------
 * Loaded as a classic <script> AFTER app.js, so (unlike supabase-client.js,
 * which is an ES module with its own scope) this file shares app.js's
 * top-level scope and can call saveStore()/snapshot()/applySnapshot()/
 * render()/toast()/t()/$()/panel()/settingRow()/esc()/fmtDateTime() directly
 * — the same way any function already inside app.js does.
 *
 * Every entry point here checks syncAvailable() first, so an unconfigured or
 * unreachable Supabase project (window.SUPABASE never got set) degrades to
 * zero effect on the rest of the app — Settings just shows "not configured."
 *
 * v1 scope, by design (see the plan doc for the full reasoning):
 *   - email + password only, no OAuth
 *   - whole-blob sync (reuses snapshot()/applySnapshot() as-is), not diffed
 *   - last-write-wins by server timestamp, no field-level merge
 *
 * Password, not a magic link: a magic-link email opens in Safari on iOS, not
 * the installed standalone PWA it was sent from — the session lands in the
 * wrong browsing context and the app never sees it signed in. signInWithPassword()
 * is a same-context API call with no redirect, so it works from the installed
 * app every time. (Sign-up may still need one email confirmation, depending on
 * the Supabase project's settings — but that's once, not every sign-in.)
 * ========================================================================== */

let SYNC_USER = null;          // { id, email, ... } | null
let SYNC_STATUS = "idle";      // idle | needs-reconciliation
let SYNC_FORM_MODE = "signin"; // signin | signup — which form the signed-out panel shows
let LAST_SYNCED = (() => { try { return localStorage.getItem("il-last-synced") || ""; } catch (e) { return ""; } })();
let _pushTimer = null;
let _syncBusy = false;

const LOCAL_OWNER_KEY = "il-local-owner";
// Tracks WHICH account's data currently occupies localStorage on this device —
// deliberately survives sign-out (signing out doesn't clear local data, so the
// data still "belongs" to whoever last synced it). Without this, switching
// accounts on a shared device can silently upload or overwrite one user's
// financial data with another's, since reconcileOnSignIn() would otherwise
// treat any local data as belonging to whoever just signed in.
function getLocalOwner() { try { return localStorage.getItem(LOCAL_OWNER_KEY) || ""; } catch (e) { return ""; } }
function setLocalOwner(id) { try { localStorage.setItem(LOCAL_OWNER_KEY, id); } catch (e) {} }

function syncAvailable() { return !!window.SUPABASE; }

/* Called once from app.js's init(), fire-and-forget (never awaited there) so
 * it can't delay first paint. */
async function initSync() {
  if (!syncAvailable()) {
    // supabase-client.js is still waiting on its CDN import — not permanently
    // unavailable. Re-run this same function once it announces success rather
    // than giving up here: giving up here means the onAuthStateChange listener
    // below never gets registered for the rest of this page load, so even a
    // successful sign-in later would have nothing listening for it. See
    // supabase-client.js's own comment for the full failure mode this fixes.
    window.addEventListener("supabase-ready", initSync, { once: true });
    return;
  }

  try {
    const { data } = await SUPABASE.auth.getSession();
    if (data && data.session) { SYNC_USER = data.session.user; await reconcileOnSignIn(); }
  } catch (e) { /* stays signed out */ }
  // Whatever page is on screen right now may have already rendered once with
  // syncAvailable() false (a real "not configured" panel, not a guess — this is
  // the exact race the "supabase-ready" retry above exists for). One render()
  // here refreshes it with what's now known to be true, signed in or not.
  render();

  SUPABASE.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session && (!SYNC_USER || SYNC_USER.id !== session.user.id)) {
      SYNC_USER = session.user;
      await reconcileOnSignIn();
      render();
    } else if (event === "SIGNED_OUT") {
      SYNC_USER = null;
      render();
    }
  });

  // A push that failed mid-edit because the connection dropped gets one free
  // retry when connectivity returns, instead of waiting for the next edit.
  window.addEventListener("online", () => debouncedPush());

  const pullBtn = $("#cloudStalePull");
  if (pullBtn) pullBtn.addEventListener("click", async () => {
    // A push may already be scheduled for a local edit that hasn't reached the
    // cloud yet — pulling now would overwrite that edit in memory, and letting
    // the pending push fire afterward would silently re-push the stale (reverted)
    // data right back over the fresh pull, losing the edit on both sides.
    const hasUnsyncedEdit = LAST_SAVED && (!LAST_SYNCED || new Date(LAST_SAVED) > new Date(LAST_SYNCED));
    if (hasUnsyncedEdit && !confirm(t("You have a change on this device that hasn't finished syncing yet. Pulling now will discard it. Continue?"))) return;
    clearTimeout(_pushTimer);
    const row = await pullFromCloud();
    if (row) { applySnapshot(row.data); saveStore(); }
    hideCloudStaleWarning(); render();
  });
  const dismissBtn = $("#cloudStaleDismiss");
  if (dismissBtn) dismissBtn.addEventListener("click", hideCloudStaleWarning);
}

/* Hook called from the end of saveStore() in app.js — the single choke point
 * every local edit already flows through, so this is the only place a push
 * needs to be triggered from (no need to touch the ~36 saveStore() call sites
 * individually). */
function onDataSaved() {
  debouncedPush();
}

function debouncedPush() {
  if (!syncAvailable() || !SYNC_USER) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(pushToCloud, 4000);
}

async function pushToCloud() {
  if (!syncAvailable() || !SYNC_USER) return false;
  if (_syncBusy) {
    // A push is already in flight — don't drop this one, retry shortly instead,
    // otherwise an edit that lands mid-push can be silently skipped forever.
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(pushToCloud, 1000);
    return false;
  }
  _syncBusy = true;
  let ok = false;
  try {
    const { data, error } = await SUPABASE.from("ledger_data")
      .upsert({ user_id: SYNC_USER.id, data: snapshot() }, { onConflict: "user_id" })
      .select("updated_at").single();
    if (!error && data && data.updated_at) {
      LAST_SYNCED = data.updated_at;
      try { localStorage.setItem("il-last-synced", LAST_SYNCED); } catch (e) {}
      ok = true;
    }
  } catch (e) { /* offline/etc — next edit or the "online" listener retries */ }
  _syncBusy = false;
  return ok;
}

async function pullFromCloud() {
  if (!syncAvailable() || !SYNC_USER) return null;
  try {
    const { data, error } = await SUPABASE.from("ledger_data")
      .select("data, updated_at").eq("user_id", SYNC_USER.id).maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (e) { return null; }
}

/* Compares against LAST_SAVED (the real local last-edit time, already
 * tracked by app.js) — NOT against LAST_SYNCED, which only tracks the last
 * successful network round-trip and says nothing about whether local data
 * has since changed. */
async function pullIfNewer() {
  if (!syncAvailable() || !SYNC_USER || _syncBusy) return;
  const row = await pullFromCloud();
  if (!row || !row.updated_at) return;
  if (LAST_SAVED && new Date(row.updated_at) <= new Date(LAST_SAVED)) return;
  showCloudStaleWarning();
}

/* Runs once per sign-in (fresh or rehydrated-on-load). Only prompts the user
 * when there's a genuine ambiguity — most sign-ins resolve silently. */
async function reconcileOnSignIn() {
  const userId = SYNC_USER.id;   // capture now — SYNC_USER can change while we await below
  const marker = `il-cloud-linked-${userId}`;
  let already = false;
  try { already = localStorage.getItem(marker) === "1"; } catch (e) {}
  if (already) { pullIfNewer(); return; }

  // Local data left over from a DIFFERENT account on this device (sign-out never
  // clears it) must never be treated as this account's — wipe it first, exactly
  // like a fresh device, rather than risk uploading it into or over this account.
  const owner = getLocalOwner();
  if (owner && owner !== userId) {
    clearAllData();
    toast(t("Local data from a previous account was cleared before syncing this account."));
  }

  const localHas = BROKERS.length > 0 || ALL_TRANSACTIONS.length > 0;
  const row = await pullFromCloud();
  const cloudHas = !!(row && row.data && (((row.data.BROKERS || []).length > 0) || ((row.data.ALL_TRANSACTIONS || []).length > 0)));
  const markLinked = () => { try { localStorage.setItem(marker, "1"); } catch (e) {} };

  if (!localHas && !cloudHas) { markLinked(); setLocalOwner(userId); return; }
  if (!localHas && cloudHas) {
    applySnapshot(row.data); saveStore(); markLinked(); setLocalOwner(userId);
    toast(t("Synced from your account.")); return;
  }
  if (localHas && !cloudHas) {
    // Don't mark as linked (and don't claim success) until the upload actually
    // succeeds — otherwise a failed first push looks permanently synced with
    // no retry path, since every future sign-in would skip straight past it.
    const ok = await pushToCloud();
    if (ok) {
      markLinked(); setLocalOwner(userId);
      toast(t("Your data was uploaded to your account."));
    } else {
      toast(t("Couldn't upload to your account — check your connection and try again."));
    }
    return;
  }
  openReconcileModal(row, userId);   // both sides have data — genuinely ambiguous
}

function openReconcileModal(cloudRow, userId) {
  SYNC_STATUS = "needs-reconciliation";
  const localCount = ALL_TRANSACTIONS.length;
  const cloudCount = (cloudRow.data.ALL_TRANSACTIONS || []).length;
  $("#modalTitle").textContent = t("Choose which data to keep");
  $("#modalBody").innerHTML = `
    <p class="muted" style="margin:0 0 14px;font-size:13.5px;line-height:1.6">${t("Both this device and your account already have data. Pick one to continue — the other side will be replaced.")}</p>
    <div class="mini-cards" style="margin-bottom:16px">
      <div class="mini-card"><div class="mc-label">${t("This device")}</div><div class="mc-value">${localCount}</div><div class="mc-sub muted">${t("Transactions")} · ${LAST_SAVED ? fmtDateTime(LAST_SAVED) : "—"}</div></div>
      <div class="mini-card"><div class="mc-label">${t("Your account")}</div><div class="mc-value">${cloudCount}</div><div class="mc-sub muted">${t("Transactions")} · ${cloudRow.updated_at ? fmtDateTime(cloudRow.updated_at) : "—"}</div></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" id="reconcileKeepLocal">${t("Keep this device, upload it")}</button>
      <button class="btn" id="reconcileKeepCloud">${t("Use my account's data")}</button>
    </div>`;
  $("#modal").hidden = false;

  // userId is the id captured when reconciliation started, NOT re-read from the
  // live SYNC_USER global — signing out while this modal is open would otherwise
  // null it out (or, worse, a different account could sign in) mid-flow.
  const marker = `il-cloud-linked-${userId}`;
  $("#reconcileKeepLocal").addEventListener("click", async () => {
    SYNC_STATUS = "idle"; closeModal();
    const ok = await pushToCloud();
    if (ok) {
      try { localStorage.setItem(marker, "1"); } catch (e) {}
      setLocalOwner(userId);
      toast(t("Your data was uploaded to your account."));
    } else {
      toast(t("Couldn't upload to your account — check your connection and try again."));
    }
    render();
  });
  $("#reconcileKeepCloud").addEventListener("click", () => {
    try { localStorage.setItem(marker, "1"); } catch (e) {}
    setLocalOwner(userId);
    applySnapshot(cloudRow.data); saveStore();
    SYNC_STATUS = "idle"; closeModal();
    toast(t("Synced from your account.")); render();
  });
}

function showCloudStaleWarning() {
  const el = document.getElementById("cloudStaleBanner");
  const msgEl = document.getElementById("cloudStaleMsg");
  if (msgEl) msgEl.textContent = t("Your data was updated from another device. Pull the latest before making more changes here, or you'll overwrite it.");
  if (el) el.hidden = false;
}
function hideCloudStaleWarning() {
  const el = document.getElementById("cloudStaleBanner");
  if (el) el.hidden = true;
}

function mapAuthError(error, mode) {
  const msg = ((error && error.message) || "").toLowerCase();
  if (msg.includes("already registered") || msg.includes("already exists")) return t("That email's already registered — sign in instead.");
  if (msg.includes("password")) return t("Password must be at least 6 characters.");
  if (mode === "signup") return t("Couldn't create that account — try again.");
  return t("Incorrect email or password.");
}

async function signOutCloud() {
  if (syncAvailable()) { try { await SUPABASE.auth.signOut(); } catch (e) {} }
  SYNC_USER = null;
}

/* =============================================================================
 * Settings page: Account & Cloud Sync panel
 * ========================================================================== */
function accountSyncPanelHTML() {
  let body;
  if (!syncAvailable()) {
    body = `<p class="muted" style="margin:0">${t("Cloud sync isn't set up for this deployment yet.")}</p>`;
  } else if (SYNC_USER) {
    body = `<div class="setting-rows">
        ${settingRow(t("Signed in as"), esc(SYNC_USER.email))}
        ${settingRow(t("Last synced to cloud"), LAST_SYNCED ? fmtDateTime(LAST_SYNCED) : t("Not yet synced"))}
      </div>
      <div class="form-actions" style="margin-top:12px">
        <button class="btn" id="syncNowBtn">${t("Sync now")}</button>
        <button class="btn ghost" id="signOutBtn">${t("Sign out")}</button>
      </div>
      ${SYNC_STATUS === "needs-reconciliation"
        ? `<p class="muted" style="margin:12px 0 0"><a class="link" href="#" id="reopenReconcile">${t("Finish choosing which data to keep")}</a></p>` : ""}`;
  } else {
    const isSignup = SYNC_FORM_MODE === "signup";
    body = `<form id="signInForm" class="form" autocomplete="off">
      <div class="form-grid">
        <label>${t("Email")}<input name="email" type="email" placeholder="you@example.com" required></label>
        <label>${t("Password")}<input name="password" type="password" placeholder="••••••••" minlength="6" required autocomplete="${isSignup ? "new-password" : "current-password"}"></label>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">${isSignup ? t("Create account") : t("Sign in")}</button></div>
    </form>
    <p class="muted" style="margin:10px 0 0;font-size:12.5px">${isSignup ? t("Already have an account?") : t("New here?")} <button type="button" class="link" id="toggleSyncMode">${isSignup ? t("Sign in instead") : t("Create an account")}</button></p>
    <p class="muted" id="signInStatus" style="margin:6px 0 0;font-size:12.5px"></p>`;
  }
  return panel(t("Account & Cloud Sync"), body);
}

function mountAccountSyncPanel() {
  const form = $("#signInForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = fd.get("email");
      const password = fd.get("password");
      const statusEl = $("#signInStatus");
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (SYNC_FORM_MODE === "signup") {
          const { data, error } = await SUPABASE.auth.signUp({ email, password });
          if (error) {
            if (statusEl) statusEl.textContent = mapAuthError(error, "signup");
          } else if (!data.session) {
            // "Confirm email" is on for this project — signUp() created the
            // account but issued no session. onAuthStateChange only fires on
            // an actual sign-in, so nothing else here transitions the panel.
            if (statusEl) statusEl.textContent = t("Account created — check your email to confirm it, then sign in.");
            SYNC_FORM_MODE = "signin";
          }
          // else: session came back immediately (confirmation off) — the
          // onAuthStateChange listener in initSync() takes it from here.
        } else {
          const { error } = await SUPABASE.auth.signInWithPassword({ email, password });
          if (error && statusEl) statusEl.textContent = mapAuthError(error, "signin");
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = t("Something went wrong — try again.");
      }
      btn.disabled = false;
    });
  }
  const toggleModeBtn = $("#toggleSyncMode");
  if (toggleModeBtn) toggleModeBtn.addEventListener("click", () => {
    SYNC_FORM_MODE = SYNC_FORM_MODE === "signup" ? "signin" : "signup";
    render();
  });
  const syncNowBtn = $("#syncNowBtn");
  if (syncNowBtn) syncNowBtn.addEventListener("click", async () => {
    syncNowBtn.disabled = true;
    const ok = await pushToCloud();
    toast(ok ? t("Synced.") : t("Couldn't sync — check your connection and try again."));
    render();
  });
  const signOutBtn = $("#signOutBtn");
  if (signOutBtn) signOutBtn.addEventListener("click", async () => {
    await signOutCloud();
    toast(t("Signed out."));
    render();
  });
  const reopenLink = $("#reopenReconcile");
  if (reopenLink) reopenLink.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!SYNC_USER) return;
    const userId = SYNC_USER.id;
    const row = await pullFromCloud();
    if (row) openReconcileModal(row, userId);
  });
}
