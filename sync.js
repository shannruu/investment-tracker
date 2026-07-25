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
 *   - passwordless email magic link only, no password/OAuth
 *   - whole-blob sync (reuses snapshot()/applySnapshot() as-is), not diffed
 *   - last-write-wins by server timestamp, no field-level merge
 * ========================================================================== */

let SYNC_USER = null;          // { id, email, ... } | null
let SYNC_STATUS = "idle";      // idle | needs-reconciliation
let LAST_SYNCED = (() => { try { return localStorage.getItem("il-last-synced") || ""; } catch (e) { return ""; } })();
let _pushTimer = null;
let _syncBusy = false;

function syncAvailable() { return !!window.SUPABASE; }

/* Called once from app.js's init(), fire-and-forget (never awaited there) so
 * it can't delay first paint. */
async function initSync() {
  if (!syncAvailable()) return;

  try {
    const { data } = await SUPABASE.auth.getSession();
    if (data && data.session) { SYNC_USER = data.session.user; await reconcileOnSignIn(); }
  } catch (e) { /* stays signed out */ }

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
  if (!syncAvailable() || !SYNC_USER || _syncBusy) return;
  _syncBusy = true;
  try {
    const { data, error } = await SUPABASE.from("ledger_data")
      .upsert({ user_id: SYNC_USER.id, data: snapshot() }, { onConflict: "user_id" })
      .select("updated_at").single();
    if (!error && data && data.updated_at) {
      LAST_SYNCED = data.updated_at;
      try { localStorage.setItem("il-last-synced", LAST_SYNCED); } catch (e) {}
    }
  } catch (e) { /* offline/etc — next edit or the "online" listener retries */ }
  _syncBusy = false;
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
  const marker = `il-cloud-linked-${SYNC_USER.id}`;
  let already = false;
  try { already = localStorage.getItem(marker) === "1"; } catch (e) {}
  if (already) { pullIfNewer(); return; }

  const localHas = BROKERS.length > 0 || ALL_TRANSACTIONS.length > 0;
  const row = await pullFromCloud();
  const cloudHas = !!(row && row.data && (((row.data.BROKERS || []).length > 0) || ((row.data.ALL_TRANSACTIONS || []).length > 0)));
  const markLinked = () => { try { localStorage.setItem(marker, "1"); } catch (e) {} };

  if (!localHas && !cloudHas) { markLinked(); return; }
  if (!localHas && cloudHas) {
    applySnapshot(row.data); saveStore(); markLinked();
    toast(t("Synced from your account.")); return;
  }
  if (localHas && !cloudHas) {
    markLinked(); pushToCloud();
    toast(t("Your data was uploaded to your account.")); return;
  }
  openReconcileModal(row);   // both sides have data — genuinely ambiguous
}

function openReconcileModal(cloudRow) {
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

  const marker = `il-cloud-linked-${SYNC_USER.id}`;
  $("#reconcileKeepLocal").addEventListener("click", () => {
    try { localStorage.setItem(marker, "1"); } catch (e) {}
    SYNC_STATUS = "idle"; closeModal(); pushToCloud();
    toast(t("Your data was uploaded to your account.")); render();
  });
  $("#reconcileKeepCloud").addEventListener("click", () => {
    try { localStorage.setItem(marker, "1"); } catch (e) {}
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

async function signInWithMagicLink(email) {
  return SUPABASE.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
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
    body = `<form id="signInForm" class="form" autocomplete="off">
      <div class="form-grid">
        <label>${t("Email")}<input name="email" type="email" placeholder="you@example.com" required></label>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">${t("Send magic link")}</button></div>
    </form>
    <p class="muted" id="signInStatus" style="margin:10px 0 0;font-size:12.5px"></p>`;
  }
  return panel(t("Account & Cloud Sync"), body);
}

function mountAccountSyncPanel() {
  const form = $("#signInForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = new FormData(e.target).get("email");
      const statusEl = $("#signInStatus");
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const { error } = await signInWithMagicLink(email);
        if (statusEl) statusEl.textContent = error
          ? t("Couldn't send the link — try again.")
          : `${t("Check")} ${email} ${t("for a sign-in link.")}`;
      } catch (err) {
        if (statusEl) statusEl.textContent = t("Couldn't send the link — try again.");
      }
      btn.disabled = false;
    });
  }
  const syncNowBtn = $("#syncNowBtn");
  if (syncNowBtn) syncNowBtn.addEventListener("click", async () => {
    syncNowBtn.disabled = true;
    await pushToCloud();
    toast(t("Synced."));
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
    const row = await pullFromCloud();
    if (row) openReconcileModal(row);
  });
}
