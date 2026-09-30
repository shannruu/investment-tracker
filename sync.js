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

/* True exactly when this device has a local edit the cloud hasn't seen yet —
 * compares against LAST_SAVED (the real last-edit time app.js tracks), not
 * LAST_SYNCED (only the last successful round-trip, which says nothing about
 * whether local data has changed since). Shared by every place that has to
 * decide whether pulling right now would silently discard local work. */
function hasUnsyncedLocalEdit() {
  return !!(LAST_SAVED && (!LAST_SYNCED || new Date(LAST_SAVED) > new Date(LAST_SYNCED)));
}

/* Every per-account cache that lives OUTSIDE the local snapshot()/applySnapshot() blob
 * (Price Alerts today; anything else account-scoped added later) must be cleared here, on
 * every sign-in AND sign-out. Without this, switching accounts on a shared device kept
 * showing the previous user's data: alerts.js's ALERTS_LOADED guard, once true, was never
 * reset by anything, so a second account's mount() saw "already loaded" and never
 * re-fetched — user B saw user A's alerts, and user B's own were invisible until a hard
 * reload happened to reset the module state by accident. alerts.js loads after this file
 * but shares its top-level scope (same pattern as this file sharing app.js's), so its
 * globals exist by the time this ever actually runs (a real event callback, not synchronous
 * script evaluation) — typeof-guarded anyway in case that file is ever removed. */
function resetPerAccountCaches() {
  if (typeof ALERTS_LOADED !== "undefined") { ALERTS_LOADED = false; ALERTS_CACHE = []; }
  if (typeof PUSH_SUBSCRIBED !== "undefined") PUSH_SUBSCRIBED = null;
}

/* Called once from app.js's init(), fire-and-forget (never awaited there) so
 * it can't delay first paint. */
/* =============================================================================
 * Opening page: nobody sees the app until they've signed in or created an account.
 * index.html ships a static #authGate cover (state "loading") so the app never flashes
 * before we know who's here. Once Cloud Sync answers, initSync() calls authGateSync():
 * signed in -> cover removed; signed out -> the sign-in / create-account card.
 * If Cloud Sync can't start at all (offline first visit, CDN blocked) the cover is
 * dropped after a few seconds so the app still opens in local-only mode.
 * ========================================================================== */
let AUTH_GATE_MODE = "signup";
// Design-preview escape hatch: open the site with ?preview=1 to look around without an account
// (remembered for this tab only). The gate is a client-side courtesy, not a security boundary.
let AUTH_GATE_PREVIEW = false;
try {
  if (/[?&]preview=1/.test(location.search)) sessionStorage.setItem("divz-preview", "1");
  AUTH_GATE_PREVIEW = sessionStorage.getItem("divz-preview") === "1";
} catch (e) {}
if (AUTH_GATE_PREVIEW) { const g0 = document.getElementById("authGate"); if (g0) g0.hidden = true; }
let AUTH_GATE_TIMER = null;
const AUTH_GATE_DEMO = (location.search.match(/[?&]gate=(done|confirm|forgot|reset|newpass|updated)/) || [])[1] || "";
let AUTH_GATE_HOLD = false;   // true while a sign-up success page is showing: nothing may hide/replace it except its own button
function authGateEl() { return document.getElementById("authGate"); }
function hideAuthGate() {
  if (AUTH_GATE_HOLD) return;
  clearTimeout(AUTH_GATE_TIMER);
  const g = authGateEl(); if (g) g.hidden = true;
}
function wireAgEyes(g) {
  g.querySelectorAll(".ag-eye").forEach((b) => b.addEventListener("click", () => {
    const inp = document.getElementById(b.dataset.eyeFor), show = inp.type === "password";
    inp.type = show ? "text" : "password";
    b.innerHTML = show ? AG_EYE_OFF : AG_EYE;
    b.setAttribute("aria-pressed", String(show));
    b.setAttribute("aria-label", show ? t("Hide password") : t("Show password"));
    inp.focus();
  }));
}
const AG_EYE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const AG_EYE_OFF = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19.5C5 19.5 1 12 1 12a19.8 19.8 0 0 1 5.06-5.94M9.9 4.24A10.9 10.9 0 0 1 12 4.5C19 4.5 23 12 23 12a19.8 19.8 0 0 1-3.17 4.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
function agPasswordField(id, label, placeholder, autocomplete) {
  return `<label>${label}<span class="ag-pw">
    <input id="${id}" name="${id}" type="password" placeholder="${placeholder}" autocomplete="${autocomplete}" required>
    <button type="button" class="ag-eye" data-eye-for="${id}" aria-label="${t("Show password")}" aria-pressed="false">${AG_EYE}</button>
  </span></label>`;
}
function showAuthGate() {
  const g = authGateEl(); if (!g) return;
  if (AUTH_GATE_HOLD) return;
  if (AUTH_GATE_PREVIEW) { hideAuthGate(); return; }
  clearTimeout(AUTH_GATE_TIMER);
  g.hidden = false; g.dataset.state = "form";
  const signup = AUTH_GATE_MODE === "signup";
  g.innerHTML = `<div class="ag-card panel" role="dialog" aria-modal="true" aria-labelledby="agTitle">
    <div class="brand ag-brand"><span class="brand-mark" aria-hidden="true">D</span><span class="brand-name">Divz</span></div>
    <h2 id="agTitle" class="ag-title">${signup ? t("Create your account") : t("Welcome back")}</h2>
    <p class="muted ag-sub">${signup ? t("Sign up to keep your investment records safe and in sync on every device.") : t("Sign in to your Divz account.")}</p>
    <form id="agForm" class="form" novalidate>
      <div class="form-grid ag-grid">
        <label>${t("Email")}<input id="agEmail" name="email" type="email" placeholder="you@example.com" autocomplete="email" inputmode="email" required></label>
        ${agPasswordField("agPass", t("Password"), signup ? t("At least 6 characters.") : "••••••••", signup ? "new-password" : "current-password")}
        ${signup ? agPasswordField("agPass2", t("Confirm password"), t("Repeat your password"), "new-password") : ""}
      </div>
      ${signup ? "" : `<div class="ag-forgot-row"><button type="button" id="agForgot" class="link">${t("Forgot password?")}</button></div>`}
      <p class="field-err ag-status" id="agStatus" role="alert"></p>
      <button type="submit" class="btn primary ag-btn">${signup ? t("Create account") : t("Sign in")}</button>
    </form>
    <p class="muted ag-switch">${signup ? t("Already have an account?") : t("New here?")}
      <button type="button" id="agToggle" class="link">${signup ? t("Sign in") : t("Create an account")}</button></p>
  </div>`;
  const form = document.getElementById("agForm"), status = document.getElementById("agStatus");
  wireAgEyes(g);
  const forgotBtn = document.getElementById("agForgot"); if (forgotBtn) forgotBtn.addEventListener("click", showAuthForgot);
  document.getElementById("agToggle").addEventListener("click", () => { AUTH_GATE_MODE = signup ? "signin" : "signup"; showAuthGate(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim(), password = form.agPass.value;
    if (!email || !password) { status.textContent = t("Enter your email and password."); return; }
    if (signup && password.length < 6) { status.textContent = t("Password must be at least 6 characters."); return; }
    if (signup && password !== form.agPass2.value) { status.textContent = t("Passwords don't match — please retype them."); return; }
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true; status.textContent = "";
    try {
      if (signup) {
        AUTH_GATE_HOLD = true;   // set BEFORE the call: SIGNED_IN can fire while signUp() is still awaiting
        const { data, error } = await SUPABASE.auth.signUp({ email, password });
        AUTH_GATE_HOLD = false;
        if (error) status.textContent = mapAuthError(error, "signup");
        else { showAuthGateSuccess(email, !!data.session); return; }
      } else {
        const { error } = await SUPABASE.auth.signInWithPassword({ email, password });
        if (error) status.textContent = mapAuthError(error, "signin");
      }
    } catch (err) { status.textContent = t("Something went wrong — try again."); }
    btn.disabled = false;
  });
  const first = document.getElementById("agEmail"); if (first) first.focus();
}
/* Shown after sign-up when the project requires email confirmation (no session yet) — a success
 * screen, not an error line: the account exists, one email click is all that's left. */
function showAuthGateSuccess(email, mode) {
  const g = authGateEl(); if (!g) return;
  AUTH_GATE_HOLD = true;
  g.hidden = false; g.dataset.state = "success";
  const enters = mode === true || mode === "updated";   // these end with "Continue to Divz"
  const title = mode === true ? t("You're all set!") : mode === "updated" ? t("Password updated") : mode === "reset" ? t("Check your email") : t("Account created");
  const body = mode === true
    ? `${t("Your Divz account is ready:")}<strong class="ag-email"></strong>${t("Your records will now be saved to your account and sync across your devices.")}`
    : mode === "updated" ? t("Your password has been changed and you're signed in.")
    : mode === "reset" ? `${t("If an account exists for")}<strong class="ag-email"></strong>${t("we've sent a link to reset the password. Open it in this same browser.")}`
    : `${t("We sent a confirmation link to")}<strong class="ag-email"></strong>${t("Open it to activate your account, then come back and sign in.")}`;
  g.innerHTML = `<div class="ag-card panel ag-done" role="dialog" aria-modal="true" aria-labelledby="agTitle">
    <div class="ag-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17.5 19 7.5"/></svg></div>
    <h2 id="agTitle" class="ag-title">${title}</h2>
    <p class="muted ag-sub">${body}</p>
    <button type="button" class="btn primary ag-btn" id="agBack">${enters ? t("Continue to Divz") : t("Back to sign in")}</button>
    ${enters ? "" : `<p class="muted ag-switch">${t("Can't find it? Check your spam folder.")}</p>`}
  </div>`;
  const em = g.querySelector(".ag-email"); if (em) em.textContent = email;
  document.getElementById("agBack").addEventListener("click", () => {
    AUTH_GATE_HOLD = false;
    if (enters) { hideAuthGate(); render(); }
    else { AUTH_GATE_MODE = "signin"; showAuthGate(); }
  });
}

/* "Forgot password?": ask for the email, Supabase mails a reset link that comes back to this site
 * (PKCE, so it must be opened in the same browser). The reply never says whether the address has
 * an account — same message either way. */
function showAuthForgot() {
  const g = authGateEl(); if (!g) return;
  AUTH_GATE_HOLD = true; g.hidden = false; g.dataset.state = "forgot";
  g.innerHTML = `<div class="ag-card panel" role="dialog" aria-modal="true" aria-labelledby="agTitle">
    <div class="brand ag-brand"><span class="brand-mark" aria-hidden="true">D</span><span class="brand-name">Divz</span></div>
    <h2 id="agTitle" class="ag-title">${t("Reset your password")}</h2>
    <p class="muted ag-sub">${t("Enter your email and we'll send you a link to choose a new password.")}</p>
    <form id="agForm" class="form" novalidate>
      <div class="form-grid ag-grid"><label>${t("Email")}<input id="agEmail" name="email" type="email" placeholder="you@example.com" autocomplete="email" inputmode="email" required></label></div>
      <p class="field-err ag-status" id="agStatus" role="alert"></p>
      <button type="submit" class="btn primary ag-btn">${t("Send reset link")}</button>
    </form>
    <p class="muted ag-switch"><button type="button" id="agToggle" class="link">${t("Back to sign in")}</button></p>
  </div>`;
  const form = document.getElementById("agForm"), status = document.getElementById("agStatus");
  document.getElementById("agToggle").addEventListener("click", () => { AUTH_GATE_HOLD = false; AUTH_GATE_MODE = "signin"; showAuthGate(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) { status.textContent = t("Enter your email."); return; }
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true; status.textContent = "";
    try {
      const { error } = await SUPABASE.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) status.textContent = mapAuthError(error, "reset");
      else { showAuthGateSuccess(email, "reset"); return; }
    } catch (err) { status.textContent = t("Something went wrong — try again."); }
    btn.disabled = false;
  });
  const first = document.getElementById("agEmail"); if (first) first.focus();
}

/* Landing from the reset email: Supabase has signed the person in with a recovery session and fires
 * PASSWORD_RECOVERY — they must choose a new password before anything else. */
function showAuthNewPassword() {
  const g = authGateEl(); if (!g) return;
  AUTH_GATE_HOLD = true; g.hidden = false; g.dataset.state = "newpass";
  g.innerHTML = `<div class="ag-card panel" role="dialog" aria-modal="true" aria-labelledby="agTitle">
    <div class="brand ag-brand"><span class="brand-mark" aria-hidden="true">D</span><span class="brand-name">Divz</span></div>
    <h2 id="agTitle" class="ag-title">${t("Choose a new password")}</h2>
    <p class="muted ag-sub">${t("Pick a password you'll remember — at least 6 characters.")}</p>
    <form id="agForm" class="form" novalidate>
      <div class="form-grid ag-grid">
        ${agPasswordField("agPass", t("New password"), t("At least 6 characters."), "new-password")}
        ${agPasswordField("agPass2", t("Confirm password"), t("Repeat your password"), "new-password")}
      </div>
      <p class="field-err ag-status" id="agStatus" role="alert"></p>
      <button type="submit" class="btn primary ag-btn">${t("Update password")}</button>
    </form>
  </div>`;
  wireAgEyes(g);
  const form = document.getElementById("agForm"), status = document.getElementById("agStatus");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = form.agPass.value;
    if (pw.length < 6) { status.textContent = t("Password must be at least 6 characters."); return; }
    if (pw !== form.agPass2.value) { status.textContent = t("Passwords don't match — please retype them."); return; }
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true; status.textContent = "";
    try {
      const { data, error } = await SUPABASE.auth.updateUser({ password: pw });
      if (error) status.textContent = mapAuthError(error, "reset");
      else { showAuthGateSuccess((data && data.user && data.user.email) || "", "updated"); return; }
    } catch (err) { status.textContent = t("Something went wrong — try again."); }
    btn.disabled = false;
  });
  const first = document.getElementById("agPass"); if (first) first.focus();
}
/* Called once we know whether a session exists. */
function authGateSync() { if (SYNC_USER) hideAuthGate(); else showAuthGate(); }

async function initSync() {
  if (AUTH_GATE_DEMO) {
    if (AUTH_GATE_DEMO === "forgot") showAuthForgot(); else if (AUTH_GATE_DEMO === "newpass") showAuthNewPassword();
    else showAuthGateSuccess("you@example.com", AUTH_GATE_DEMO === "done" ? true : AUTH_GATE_DEMO === "reset" ? "reset" : AUTH_GATE_DEMO === "updated" ? "updated" : false);
    return;
  }
  // Not answered within 6s (offline / blocked): let the app open in local-only mode instead of
  // leaving a cover up forever. A late "supabase-ready" re-runs this and shows the gate then.
  if (!AUTH_GATE_TIMER && authGateEl() && !authGateEl().hidden && authGateEl().dataset.state === "loading") {
    AUTH_GATE_TIMER = setTimeout(hideAuthGate, 6000);
  }
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
    if (data && data.session) { SYNC_USER = data.session.user; hideAuthGate(); await reconcileOnSignIn(); }
  } catch (e) { /* stays signed out */ }
  authGateSync();
  // Whatever page is on screen right now may have already rendered once with
  // syncAvailable() false (a real "not configured" panel, not a guess — this is
  // the exact race the "supabase-ready" retry above exists for). One render()
  // here refreshes it with what's now known to be true, signed in or not.
  render();

  SUPABASE.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session && (!SYNC_USER || SYNC_USER.id !== session.user.id)) {
      SYNC_USER = session.user;
      hideAuthGate();
      resetPerAccountCaches();
      await reconcileOnSignIn();
      render();
    } else if (event === "PASSWORD_RECOVERY") {
      showAuthNewPassword();
    } else if (event === "SIGNED_OUT") {
      // Revoke this device's price-alert push subscription WHILE we still know which
      // account it belonged to — disablePriceAlertPush() only deletes the server-side
      // push_subscriptions row when SYNC_USER is set, so nulling that first (as this used
      // to) skipped the delete entirely. On a shared/public device, that left a stale
      // subscription api/check-alerts.js would still find and push THIS account's alerts
      // to, to a device the account is no longer signed into.
      // Raced against a timeout, not awaited directly — navigator.serviceWorker.ready
      // (which disablePriceAlertPush touches first) resolves once a registration is
      // ACTIVE but never rejects if one never becomes active, so a broken/absent service
      // worker in some browsing context would otherwise hang this whole handler forever,
      // leaving the user stuck mid-"sign out" with the app never updating to reflect it.
      if (typeof disablePriceAlertPush === "function") {
        await Promise.race([disablePriceAlertPush({ silent: true }), new Promise((resolve) => setTimeout(resolve, 3000))]);
      }
      SYNC_USER = null;
      resetPerAccountCaches();
      render();
      AUTH_GATE_MODE = "signin";
      showAuthGate();
    }
  });

  // A push that failed mid-edit because the connection dropped gets one free
  // retry when connectivity returns, instead of waiting for the next edit.
  window.addEventListener("online", () => debouncedPush());

  // The other half of the fix: pullIfNewer() at init only ever runs once, at
  // the exact moment the app first loads. A PWA is usually backgrounded, not
  // relaunched — switch away, someone edits on another device, switch back —
  // and without this, that return to the app got no signal at all to check
  // again. This is what actually makes cross-device edits show up while the
  // app is sitting open, not just on a cold start.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullIfNewer();
  });

  const pullBtn = $("#cloudStalePull");
  if (pullBtn) pullBtn.addEventListener("click", async () => {
    // A push may already be scheduled for a local edit that hasn't reached the
    // cloud yet — pulling now would overwrite that edit in memory, and letting
    // the pending push fire afterward would silently re-push the stale (reverted)
    // data right back over the fresh pull, losing the edit on both sides.
    if (hasUnsyncedLocalEdit() && !confirm(t("You have a change on this device that hasn't finished syncing yet. Pulling now will discard it. Continue?"))) return;
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

/* Checks for a newer cloud snapshot and — this is the actual fix, not just a
 * check — applies it immediately whenever doing so is safe. It's only unsafe
 * when THIS device also has an edit the cloud hasn't seen yet; a bare "pull
 * check" that always stopped to ask, even with nothing local to protect, is
 * why syncing across devices felt like it silently didn't work: the common
 * case (open the app on device B, nothing typed there yet) required noticing
 * a banner and tapping it before device B ever showed device A's data. */
async function pullIfNewer() {
  if (!syncAvailable() || !SYNC_USER || _syncBusy) return;
  const row = await pullFromCloud();
  if (!row || !row.updated_at) return;
  if (LAST_SAVED && new Date(row.updated_at) <= new Date(LAST_SAVED)) return;
  if (!hasUnsyncedLocalEdit()) {
    applySnapshot(row.data); saveStore();
    toast(t("Synced the latest changes from another device."));
    render();
    return;
  }
  // A genuine conflict: this device has its own unsynced edit, so picking
  // either side silently would lose data — this is the one case that still
  // has to ask.
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
    <p class="muted" style="margin:0 0 14px;font-size:15.5px;line-height:1.6">${t("Both this device and your account already have data. Pick one to continue — the other side will be replaced.")}</p>
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
  if ((error && (error.status === 429 || error.code === "over_email_send_rate_limit")) || msg.includes("rate limit"))
    return mode === "reset" ? t("Too many emails were sent recently. Please wait about an hour and try again.")
      : t("Too many emails were sent recently. Please wait about an hour and try again — or sign in if you already created this account.");
  if (msg.includes("already registered") || msg.includes("already exists")) return t("That email's already registered — sign in instead.");
  if (msg.includes("different from the old")) return t("Choose a password different from your old one.");
  if (msg.includes("password")) return t("Password must be at least 6 characters.");
  if (mode === "reset") return t("Couldn't do that — try again.");
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
    <p class="muted" style="margin:10px 0 0;font-size:14.5px">${isSignup ? t("Already have an account?") : t("New here?")} <button type="button" class="link" id="toggleSyncMode">${isSignup ? t("Sign in instead") : t("Create an account")}</button></p>
    <p class="muted" id="signInStatus" style="margin:6px 0 0;font-size:14.5px"></p>`;
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
    // "Sync now" always meant "push my changes" — it never checked the cloud
    // for anything newer first, so tapping it on a device that was behind
    // just re-uploaded its own stale data over whatever another device had
    // already pushed. pullIfNewer() pulls immediately when that's safe (see
    // above) or raises the conflict banner when it isn't; only push
    // afterward if there was nothing to pull, or a real conflict is now
    // showing and shouldn't be silently overwritten.
    syncNowBtn.disabled = true;
    await pullIfNewer();
    const banner = document.getElementById("cloudStaleBanner");
    if (banner && !banner.hidden) {
      toast(t("Your account has newer changes — resolve them below before syncing further."));
    } else {
      const ok = await pushToCloud();
      toast(ok ? t("Synced.") : t("Couldn't sync — check your connection and try again."));
    }
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
