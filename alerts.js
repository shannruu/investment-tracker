/* =============================================================================
 * Price Alerts — user-set price targets delivered as real Web Push
 * notifications, even when the app/phone isn't open.
 * -----------------------------------------------------------------------------
 * Loaded as a classic <script> AFTER sync.js, so (the same way sync.js shares
 * app.js's top-level scope) this file can call render()/toast()/panel()/$()/
 * $$()/t()/esc()/escAttr()/fmt()/fmtDateTime()/styledSelect()/showConfirmModal()/
 * attachAutocomplete()/normalizeSymbol()/fetchQuote()/syncAvailable() directly,
 * plus window.SUPABASE for the same direct RLS-protected reads/writes sync.js
 * already uses for ledger_data.
 *
 * Alerts and push subscriptions live ONLY in Supabase, never in the local
 * snapshot()/applySnapshot() blob — they're meaningless without an account,
 * since the whole point is server-side delivery while this device is offline.
 * That's why this whole page is gated on syncAvailable() && SYNC_USER, unlike
 * the rest of the app's local-first pages.
 * ========================================================================== */

// Safe to ship client-side — VAPID public keys are asymmetric by design (see
// api/check-alerts.js for where the matching private key lives, server-only).
const VAPID_PUBLIC_KEY = "BA2GJXo7Hz2vOj1axNfEqzFzaMmMVq53vrE2VFtFzMJhU6FXkvjoBRJmPcX4fgI9QmDI8W8BEbkqvM4d-1siZZY";

/* pushManager.subscribe() needs the VAPID public key as a raw Uint8Array, not
 * the base64url string it's stored/shipped as. */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

let ALERTS_CACHE = [];
let ALERTS_LOADED = false;
let PUSH_SUBSCRIBED = null;   // null = not checked yet, else true/false

/* Returns { ok, rows } — ok distinguishes "fetched cleanly, no alerts yet" from "the
 * request itself failed", the same shape fetchDivHistory() uses and for the same reason:
 * without it, one failed fetch looked identical to "no alerts" and ALERTS_LOADED stayed
 * true for the rest of the session, so it never got a chance to retry even after the
 * network recovered. */
async function fetchMyAlerts() {
  if (!syncAvailable() || !SYNC_USER) return { ok: true, rows: [] };
  try {
    const { data, error } = await SUPABASE.from("price_alerts")
      .select("*").eq("user_id", SYNC_USER.id).order("created_at", { ascending: false });
    return error ? { ok: false, rows: [] } : { ok: true, rows: data || [] };
  } catch (e) { return { ok: false, rows: [] }; }
}

async function checkPushSubscribed() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) { PUSH_SUBSCRIBED = false; return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    PUSH_SUBSCRIBED = !!sub;
  } catch (e) { PUSH_SUBSCRIBED = false; }
}

/* Must run inside a click handler, not fired automatically — iOS only shows
 * the permission prompt in direct response to a user gesture. */
async function enablePriceAlertPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) { toast(t("Push notifications aren't supported in this browser.")); return; }
  if (!SYNC_USER) { toast(t("Sign in first — alerts need an account.")); return; }
  // Once a browser has recorded "denied" for this site, requestPermission() resolves to
  // "denied" again instantly with no prompt shown at all — most browsers never re-ask.
  // pageAlerts() already hides this button in that state, but enablePriceAlertPush() can
  // still be reached directly (e.g. a stale render), so it needs its own actionable
  // message rather than repeating the same dead-end generic toast forever.
  if (typeof Notification !== "undefined" && Notification.permission === "denied") {
    toast(t("Notifications are blocked for this site — enable them in your browser's site settings, then reload this page."));
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { toast(t("Notification permission wasn't granted.")); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    const { error } = await SUPABASE.from("push_subscriptions")
      .upsert({ user_id: SYNC_USER.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" });
    if (error) { toast(t("Couldn't save this device — try again.")); return; }
    PUSH_SUBSCRIBED = true;
    toast(t("Push notifications enabled on this device."));
  } catch (e) {
    toast(t("Couldn't enable notifications — try again."));
  }
}

/* opts.silent: called from sync.js's SIGNED_OUT handler (a background auth event, not a
 * user click on "Turn off") — sign-out never left this device's subscription behind
 * before, but that call site must not pop the same success toast a deliberate "Turn off"
 * click shows, especially since most sign-outs have nothing to actually unsubscribe. */
async function disablePriceAlertPush(opts = {}) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      if (SYNC_USER) await SUPABASE.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
  } catch (e) { /* best-effort — the server also self-cleans expired subscriptions on a 410 */ }
  PUSH_SUBSCRIBED = false;
  if (!opts.silent) toast(t("Push notifications turned off on this device."));
}

function alertStatusBadge(a) {
  if (!a.enabled) return `<span class="badge subtle">${t("Triggered")}</span>`;
  if (a.recurring) return `<span class="badge info">${t("Recurring")}</span>`;
  return `<span class="badge confirmed">${t("Active")}</span>`;
}

let alertFilter = "all";   // all | active | triggered
let alertDraft = { ticker: "", direction: "above", targetPrice: "", recurring: false, focus: "" };   // what is typed in the New alert form, kept across background redraws
function alertRowHTML(a, i) {
  const dirLabel = a.direction === "above" ? "≥" : "≤";
  const h = (typeof T !== "undefined" && T.holdings || []).find((x) => x.ticker === a.ticker);
  const name = typeof dzName === "function" ? dzName(a.ticker, h ? h.company : null) : a.ticker;
  const now = h && h.hasPrice ? `${ccyLabel(h.currentPriceCcy)} ${fmt(h.currentPrice)}` : "";
  const initials = typeof dzInitials === "function" ? dzInitials(name) : name.slice(0, 2).toUpperCase();
  return `<div class="al-row"><span class="dz-chip pf-chip${i % 2 ? " b" : ""}" aria-hidden="true">${initials}</span>
    <div class="al-main"><div class="al-t1">${esc(name)}</div><div class="al-t2">${name !== a.ticker ? esc(a.ticker) : ""}${a.last_triggered_at ? `${name !== a.ticker ? " · " : ""}${t("Last triggered")} ${fmtDateTime(a.last_triggered_at)}` : ""}</div></div>
    <div class="al-px">${dirLabel} ${fmt(a.target_price, { maximumFractionDigits: 4 })}${now ? `<small>${t("now")} ${now}</small>` : ""}</div>
    ${alertStatusBadge(a)}
    <button type="button" class="icon-btn" data-del-alert="${escAttr(a.id)}" title="${t("Remove")}" aria-label="${t("Remove")}"><svg class="icon"><use href="#i-trash"/></svg></button>
  </div>`;
}

function addAlertFormHTML() {
  return `<form id="addAlertForm" class="form al-form" autocomplete="off">
    <div class="form-grid" style="grid-template-columns:1fr">
      <label>${t("Ticker")}<input name="ticker" placeholder="AAPL" value="${escAttr(alertDraft.ticker)}" required></label>
      <label>${t("Direction")}${styledSelect("direction", [
        { value: "above", label: t("Price rises above") },
        { value: "below", label: t("Price drops below") },
      ], alertDraft.direction, { id: "alDir" })}</label>
      <label>${t("Target Price")}<input name="targetPrice" type="number" step="any" min="0" placeholder="0.00" value="${escAttr(alertDraft.targetPrice)}" required></label>
    </div>
    <label class="check" style="margin-top:10px"><input type="checkbox" name="recurring"${alertDraft.recurring ? " checked" : ""}>${t("Notify every time it crosses, not just once")}</label>
    <p class="muted" id="alertPriceHint" style="margin:8px 0 0;font-size:12.5px"></p>
    <div class="form-actions" style="margin-top:12px"><button class="btn primary" type="submit">${t("Add Alert")}</button></div>
  </form>`;
}

function pageAlerts() {
  const subtitle = t("Get notified when a stock crosses a price you set — even when the app is closed.");

  if (!syncAvailable()) {
    return { title: "Price Alerts", subtitle, html: panel(t("Price Alerts"),
      `<p class="muted" style="margin:0">${t("Cloud sync isn't set up for this deployment yet — price alerts need an account so a server can check them even while your device is offline.")}</p>`),
      mount() {} };
  }
  if (!SYNC_USER) {
    return { title: "Price Alerts", subtitle, html: panel(t("Price Alerts"),
      `<p class="muted" style="margin:0 0 12px">${t("Sign in to set price alerts — a server checks them for you, even while this device is offline.")}</p><a class="btn primary" href="#/profile">${t("Sign in")} →</a>`),
      mount() {} };
  }

  // Checking Notification.permission directly (not just the result of a past
  // requestPermission() call) is what lets a "denied" state get its own message instead
  // of repeating the same "Enable notifications" button that can only ever fail again —
  // see enablePriceAlertPush()'s matching guard.
  const notifPermission = typeof Notification !== "undefined" ? Notification.permission : "denied";
  const pushBanner = PUSH_SUBSCRIBED === true
    ? `<p class="alert-push-row"><span class="badge confirmed">${t("On")}</span> ${t("Push notifications are enabled on this device.")} <button type="button" class="link" id="disablePushBtn">${t("Turn off")}</button></p>`
    : notifPermission === "denied"
    ? `<p class="alert-push-row"><span class="badge subtle">${t("Blocked")}</span> ${t("Notifications are blocked for this site — enable them in your browser's site settings, then reload this page.")}</p>`
    : `<p class="alert-push-row">${t("Push notifications aren't on for this device yet.")} <button type="button" class="btn primary small" id="enablePushBtn">${t("Enable notifications")}</button></p>`;

  const nActive = ALERTS_CACHE.filter((a) => a.enabled).length, nDone = ALERTS_CACHE.length - nActive, nRec = ALERTS_CACHE.filter((a) => a.enabled && a.recurring).length;
  const shown = ALERTS_CACHE.filter((a) => alertFilter === "all" || (alertFilter === "active" ? a.enabled : !a.enabled));
  const rows = shown.map(alertRowHTML).join("");
  const list = rows ? `<div class="al-list">${rows}</div>` : `<p class="muted" style="margin:0">${t("No alerts yet — add one on the right.")}</p>`;
  const fseg = `<div class="dz-seg" role="group">${[["all", t("All")], ["active", t("Active")], ["triggered", t("Triggered")]].map(([k, l]) => `<button type="button" class="${alertFilter === k ? "on" : ""}" data-alfilter="${k}">${l}</button>`).join("")}</div>`;
  const cards = `<div class="pfx-sum">${pfxStatCard(t("Active alerts"), String(nActive), "", "", "", t("Alerts that are still waiting for their price."))}${pfxStatCard(t("Recurring"), String(nRec), "", "", "", t("Alerts that notify you every time the price crosses, not just once."))}${pfxStatCard(t("Triggered"), String(nDone), "", "", "", t("Alerts that already fired and are now switched off."))}</div>`;

  const html = `<div class="pfx pfx-al">${dzTopHTML({ eyebrow: t("Price alerts"), h1: t("Your price alerts"), sub: t("Get a push when a price crosses your target"), noLive: true })}${cards}
    <div class="pfx-two pfx-two-cal">${panel(`${t("Your Alerts")}<small class="pfx-sm">${ALERTS_CACHE.length}</small>`, list, fseg)}
    ${panel(t("New alert"), `${addAlertFormHTML()}<div class="al-push">${pushBanner}</div>`)}</div></div>`;

  return {
    title: "Price Alerts", subtitle, html,
    mount() {
      const alBell = $("#dzBell"); if (alBell) alBell.addEventListener("click", () => toggleMoreSheet());
      $$("[data-alfilter]").forEach((b) => b.addEventListener("click", () => { alertFilter = b.dataset.alfilter; render(); }));
      const form = $("#addAlertForm");
      if (form) attachAutocomplete(form, null, { fillPrice: false });
      if (form) {
        const save = () => { alertDraft.ticker = form.ticker.value; alertDraft.targetPrice = form.targetPrice.value; alertDraft.recurring = form.recurring.checked; const d = $("#alDir"); if (d) alertDraft.direction = d.value; };
        form.addEventListener("input", save); form.addEventListener("change", save);
        form.addEventListener("focusin", (e) => { alertDraft.focus = e.target.name || ""; });
        // a background redraw rebuilt the form: put the cursor back where the user was typing
        const back = alertDraft.focus && form[alertDraft.focus];
        if (back && back.focus && document.activeElement !== back) { back.focus(); try { const n = back.value.length; back.setSelectionRange(n, n); } catch (err) {} }
      }

      const tickerInput = form ? form.querySelector('[name="ticker"]') : null;
      const priceHint = $("#alertPriceHint");
      if (tickerInput && priceHint) {
        tickerInput.addEventListener("blur", async () => {
          const symbol = normalizeSymbol(tickerInput.value);
          if (!symbol || !LIVE_ENABLED) return;
          const q = await fetchQuote(symbol);
          priceHint.textContent = q ? `${t("Current price")}: ${fmt(q.price, { maximumFractionDigits: 4 })} ${q.currency || ""}` : "";
        });
      }

      if (form) form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const ticker = normalizeSymbol(fd.get("ticker"));
        const direction = fd.get("direction") === "below" ? "below" : "above";
        const targetPrice = parseFloat(fd.get("targetPrice"));
        if (!ticker) { toast(t("Enter a ticker.")); return; }
        if (!(targetPrice > 0)) { toast(t("Enter a target price greater than 0.")); return; }
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        const { error } = await SUPABASE.from("price_alerts").insert({
          user_id: SYNC_USER.id, ticker, direction, target_price: targetPrice, recurring: !!fd.get("recurring"),
        });
        submitBtn.disabled = false;
        if (error) { toast(t("Couldn't add that alert — try again.")); return; }
        toast(t("Alert added."));
        form.reset();
        alertDraft = { ticker: "", direction: "above", targetPrice: "", recurring: false, focus: "" };
        ALERTS_LOADED = false;
        render();
      });

      $$("[data-del-alert]").forEach((btn) => btn.addEventListener("click", async () => {
        const id = btn.dataset.delAlert;
        if (!(await showConfirmModal(t("Remove this alert?"), { danger: true, okLabel: "Remove" }))) return;
        // The result was previously discarded — a failed delete (network drop, RLS
        // rejection) still removed the row from ALERTS_CACHE and re-rendered as if it had
        // succeeded, so the alert silently reappeared on the next real fetch with no
        // explanation of what happened to the "Remove" the user just did.
        const { error } = await SUPABASE.from("price_alerts").delete().eq("id", id);
        if (error) { toast(t("Couldn't remove that alert — try again.")); return; }
        ALERTS_CACHE = ALERTS_CACHE.filter((a) => a.id !== id);
        render();
      }));

      const enableBtn = $("#enablePushBtn");
      if (enableBtn) enableBtn.addEventListener("click", async () => { await enablePriceAlertPush(); render(); });
      const disableBtn = $("#disablePushBtn");
      if (disableBtn) disableBtn.addEventListener("click", async () => { await disablePriceAlertPush(); render(); });

      // Same "fetch once, re-render only if still on this page" guard the
      // Dashboard's own background fetches already use.
      if (!ALERTS_LOADED) {
        ALERTS_LOADED = true;
        fetchMyAlerts().then(({ ok, rows }) => {
          // A failed fetch leaves whatever was already cached in place (never overwrite a
          // good cache with an empty one on a blip) and clears the guard so the next mount
          // gets a real retry instead of "No alerts yet." for the rest of the session.
          if (ok) ALERTS_CACHE = rows; else ALERTS_LOADED = false;
          if (currentPageKey() === "alerts") render();
        });
      }
      if (PUSH_SUBSCRIBED === null) {
        checkPushSubscribed().then(() => { if (currentPageKey() === "alerts") render(); });
      }
    },
  };
}

if (typeof PAGES === "object") PAGES.alerts = pageAlerts;
