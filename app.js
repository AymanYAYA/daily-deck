// Hfad – a simple Anki: your own decks and cards, scheduled with FSRS.
// Files: index.html (page and styles), app.js (this file: scheduler, storage, screens), decks.js (starter verbs deck).

// ============================================================================
// 1. FSRS-5 scheduler (the algorithm Anki uses since 23.10), default parameters.
//    Each card has a stability S (days until recall drops to 90%) and a difficulty D (1–10).
//    Grades: 1 Again · 2 Hard · 3 Good · 4 Easy.
// ============================================================================
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const F = 19 / 81, C = -0.5;
const RETENTION = 0.9;            // aim: 90% chance you still remember a card when it comes back
const MAX_IVL = 36500;
const DAY = 86400000;
const clampD = d => Math.min(10, Math.max(1, d));
const retrievability = (t, s) => Math.pow(1 + F * t / s, C);                     // chance of recall after t days
const ivlFor = s => Math.min(MAX_IVL, Math.max(1, Math.round(s / F * (Math.pow(RETENTION, 1 / C) - 1))));
const initD = g => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
const nextD = (d, g) => clampD(W[7] * initD(4) + (1 - W[7]) * (d - W[6] * (g - 3) * (10 - d) / 9));
const successS = (d, s, r, g) => s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
const lapseS = (d, s, r) => Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
const sameDayS = (s, g) => s * Math.exp(W[17] * (g - 3 + W[18]));                  // reviewed again the same day

// What each of the four buttons would do to this card. Intervals are kept in order: Hard ≤ Good < Easy.
function outcomes(c, now = Date.now()) {
  const out = {};
  for (const g of [1, 2, 3, 4]) {
    let s, d;
    if (c.state === "new") { s = W[g - 1]; d = initD(g); }
    else {
      const t = Math.max(0, Math.round((dayStart(now) - dayStart(c.last)) / DAY));
      if (t < 1) s = sameDayS(c.stab, g);
      else { const r = retrievability(t, c.stab); s = g === 1 ? lapseS(c.diff, c.stab, r) : successS(c.diff, c.stab, r, g); }
      d = nextD(c.diff, g);
    }
    out[g] = { stab: Math.max(0.01, s), diff: d, ivl: g === 1 ? 0 : ivlFor(s) };
  }
  out[3].ivl = Math.max(out[3].ivl, out[2].ivl);
  out[4].ivl = Math.max(out[4].ivl, out[3].ivl + 1);
  return out;
}
const fmtIvl = d => d === 0 ? "now" : d < 30 ? d + "d" : d < 365 ? Math.round(d / 30) + "mo" : (d / 365).toFixed(1) + "y";

// ============================================================================
// 2. Storage. Everything lives in this browser (localStorage). Settings → Backup saves a copy as a file.
// ============================================================================
const KEY = "dailydeck.v2", OLD_KEY = "dailydeck.v1"; // storage keys keep the old name so existing progress is not lost
let S;
function dayStart(t = Date.now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dayKey(t = Date.now()) { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const defaultOpts = () => ({ newPerDay: 10, maxReviews: 200, mode: "flip" });
function newCard(deck, front, back, extra = "", alts = [], order = 0) {
  return { id: uid(), deck, front, back, extra, alts, order: order || Date.now(), state: "new", due: 0, stab: 0, diff: 0, reps: 0, lapses: 0, last: 0 };
}
// Starter deck built from decks.js (the verbs), so a first visit has something to try.
function starterCards(deckId) {
  return VERBS.map((d, i) => {
    const kind = d[5];
    const front = kind ? d[3] + "\n\n" + d[0] : d[0];
    const extra = kind ? d[0].replace(/___\s*\([^)]*\)/, d[1]) : d[3];
    const c = newCard(deckId, front, d[1], extra, d[2] || [], i + 1);
    c.id = "v" + (i + 1);
    return c;
  });
}
function freshState() {
  const deck = { id: "verbs", name: "Verbs", opts: { ...defaultOpts(), mode: "type" } };
  return { v: 2, decks: [deck], cards: starterCards(deck.id), log: [], intro: {} };
}
// Older version of the app (one built-in verbs deck, SM-2): keep the verb progress.
function migrateV1(old) {
  const st = freshState();
  const prev = new Map((old.cards || []).map(c => [c.id, c]));
  st.cards.forEach(c => {
    const o = prev.get(c.id), p = o && o.p;
    if (!p || !p.introduced) return;
    c.state = "review"; c.stab = Math.max(0.5, p.interval || 1); c.diff = clampD(initD(3) + (p.lapses || 0) * 0.5);
    c.due = p.due || dayStart(); c.last = c.due - (p.interval || 1) * DAY; c.reps = p.reps || 1; c.lapses = p.lapses || 0;
  });
  return st;
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) S = JSON.parse(raw); } catch (e) {}
  if (!S || !Array.isArray(S.decks)) {
    let old = null;
    try { const raw = localStorage.getItem(OLD_KEY); if (raw) old = JSON.parse(raw); } catch (e) {}
    S = old && Array.isArray(old.cards) ? migrateV1(old) : freshState();
    save();
  }
  S.log = S.log || []; S.intro = S.intro || {};
  if (!S.since) { S.since = Date.now(); save(); } // when this browser started keeping your progress
  // Ask the browser to keep this data instead of clearing it when space runs low.
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  S.decks.forEach(d => { d.opts = { ...defaultOpts(), ...(d.opts || {}) }; });
}
// Every change: keep it in this browser, then send it to the cloud a moment later if signed in.
function save() { S.updated = Date.now(); saveLocal(); schedulePush(); }
function saveLocal() {
  const limit = Date.now() - 180 * DAY; // keep the history small (about 5 MB per site in browsers)
  if (S.log.length && S.log[0].t < limit) S.log = S.log.filter(l => l.t >= limit);
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Could not save: storage is full or blocked."); }
}

// ============================================================================
// 2b. Cloud sync (cloud.js): sign in with Google, your decks follow you on every device.
//     Rule: the most recent version wins. A device that has never synced with this account asks before replacing anything.
// ============================================================================
const DEVICE = (() => { try { let d = localStorage.getItem("dailydeck.device"); if (!d) { d = uid(); localStorage.setItem("dailydeck.device", d); } return d; } catch (e) { return "unknown"; } })();
let sync = { state: "off", pending: null, last: 0 };
const cloudOn = () => window.cloud && window.cloud.user;
function payload() {
  const { log, pendingCloud, ...rest } = S, t0 = dayStart();
  return { v: 2, updated: S.updated || Date.now(), device: DEVICE, state: JSON.stringify({ ...rest, log: log.filter(l => l.t >= t0) }) };
}
let pushTimer;
function schedulePush() { if (!cloudOn() || S.syncedTo !== window.cloud.user.uid) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 1500); }
async function pushNow() {
  if (!cloudOn()) return;
  sync.state = "syncing"; syncBadge();
  try { await window.cloud.push(payload()); S.syncedTo = window.cloud.user.uid; sync.last = Date.now(); sync.state = "ok"; saveLocal(); }
  catch (e) { sync.state = "error"; }
  syncBadge();
}
function applyRemote(remote) {
  const r = JSON.parse(remote.state), t0 = dayStart();
  const seen = new Set(), log = [...S.log.filter(l => l.t < t0), ...S.log.filter(l => l.t >= t0), ...(r.log || [])]
    .filter(l => { const k = l.t + "|" + l.card; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.t - b.t);
  S = { ...r, log, since: S.since, syncedTo: window.cloud.user.uid, updated: remote.updated };
  S.intro = S.intro || {}; S.decks.forEach(d => { d.opts = { ...defaultOpts(), ...(d.opts || {}) }; });
  saveLocal(); sync.last = Date.now(); sync.state = "ok";
  if (view.name !== "study") render();
}
async function syncNow(firstTime) {
  if (!cloudOn()) return;
  sync.state = "syncing"; syncBadge();
  let remote;
  try { remote = await window.cloud.pull(); } catch (e) { sync.state = "error"; syncBadge(); return; }
  const studied = S.cards.filter(c => c.state !== "new").length;
  if (!remote) return pushNow();                                               // first device: the cloud starts from here
  if (S.syncedTo === window.cloud.user.uid) {                                  // this device already syncs with this account
    if (remote.updated > (S.updated || 0) && remote.device !== DEVICE) applyRemote(remote);
    else if ((S.updated || 0) > remote.updated) return pushNow();
    else { sync.state = "ok"; sync.last = Date.now(); }
  } else if (!studied) applyRemote(remote);                                    // nothing here yet: take the cloud
  else { sync.pending = remote; sync.state = "choice"; if (firstTime && view.name !== "study") go({ name: "settings" }); }
  syncBadge();
}
function syncBadge() { const b = document.getElementById("syncBadge"); if (b) b.innerHTML = syncText(); }
function syncText() {
  if (!window.cloud) return `<span class="muted">Sync loading…</span>`;
  if (!window.cloud.user) return `<button class="link" data-go-settings>☁ Sign in to sync your devices</button>`;
  return { off: "☁ Signed in", syncing: "☁ Syncing…", ok: "☁ Synced", error: "☁ Sync failed, retrying soon", choice: "☁ Choose which data to keep (Settings)" }[sync.state] || "☁";
}
window.addEventListener("cloud-ready", () => { syncBadge(); if (view.name === "settings") render(); });
window.addEventListener("cloud-auth", () => {
  if (cloudOn()) syncNow(true); else { sync.state = "off"; }
  syncBadge(); if (view.name === "settings") render();
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && cloudOn() && view.name !== "study") syncNow(false); });
document.addEventListener("click", e => { if (e.target.closest("[data-go-settings]")) go({ name: "settings" }); });

// ============================================================================
// 3. Daily queue per deck: learning cards first, then reviews mixed with new cards.
// ============================================================================
const deckById = id => S.decks.find(d => d.id === id);
const cardById = id => S.cards.find(c => c.id === id);
const cardsOf = id => S.cards.filter(c => c.deck === id);
const introKey = id => id + "|" + dayKey();
function reviewsToday(id) { const s = dayStart(); return S.log.filter(l => l.t >= s && l.deck === id && l.was !== "new").length; }
function counts(deck, extraNew = 0) {
  const end = dayStart() + DAY, cs = cardsOf(deck.id);
  const learning = cs.filter(c => c.state === "learning" && c.due < end).sort((a, b) => a.due - b.due);
  const due = cs.filter(c => c.state === "review" && c.due < end).sort((a, b) => a.due - b.due)
    .slice(0, Math.max(0, deck.opts.maxReviews - reviewsToday(deck.id)));
  const fresh = cs.filter(c => c.state === "new").sort((a, b) => a.order - b.order)
    .slice(0, Math.max(0, deck.opts.newPerDay + extraNew - (S.intro[introKey(deck.id)] || 0)));
  return { learning, due, fresh, newLeft: cs.filter(c => c.state === "new").length };
}
function buildQueue(deck, extraNew = 0) {
  const { learning, due, fresh } = counts(deck, extraNew);
  const mixed = [], every = fresh.length ? Math.max(1, Math.floor(due.length / fresh.length)) : 0;
  let n = 0;
  due.forEach((c, i) => { mixed.push(c); if (every && (i + 1) % every === 0 && n < fresh.length) mixed.push(fresh[n++]); });
  while (n < fresh.length) mixed.push(fresh[n++]);
  return [...learning, ...mixed].map(c => c.id);
}
function answer(c, g) {
  const o = outcomes(c)[g], now = Date.now(), was = c.state;
  if (was === "new") S.intro[introKey(c.deck)] = (S.intro[introKey(c.deck)] || 0) + 1;
  c.stab = o.stab; c.diff = o.diff; c.last = now; c.reps++;
  if (g === 1) { if (was === "review") c.lapses++; c.state = "learning"; c.due = now; } // comes back a few cards later
  else { c.state = "review"; c.due = dayStart(now) + o.ivl * DAY; }
  S.log.push({ t: now, card: c.id, deck: c.deck, g, was });
  save();
}

// ============================================================================
// 4. Typed answers: compare with the back of the card, tolerate one typo.
// ============================================================================
const norm = t => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’‘]/g, "").replace(/…/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const core = t => norm(t).replace(/^(to|a|an|the) /, "");
const accepted = c => [...String(c.back).split(/\s*[\/;\n]\s*/), ...(c.alts || [])].map(core).filter(Boolean);
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } }
  return d[b.length];
}
function check(typed, c) {
  const a = core(typed), acc = accepted(c);
  if (!a) return "wrong";
  if (acc.includes(a)) return "exact";
  return acc.some(e => { const d = lev(a, e); return (d === 1 && e.length >= 4) || 1 - d / Math.max(a.length, e.length) >= 0.8; }) ? "almost" : "wrong";
}
const markMissing = (typed, expected) => { const got = new Set(norm(typed).split(" ")); return expected.split(/(\s+)/).map(w => /^\s+$/.test(w) || !norm(w) || got.has(norm(w)) ? esc(w) : `<mark>${esc(w)}</mark>`).join(""); };
const hintOf = t => String(t).split(" ").map(w => w.replace(/(^[^\p{L}]*\p{L})|\p{L}/gu, (m, first) => first || "_")).join("  ");

// ============================================================================
// 5. Screens
// ============================================================================
const $ = s => document.querySelector(s);
const app = $("#app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
let view = { name: "home" }, ses = null;
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800); }
function go(v) { view = v; render(); window.scrollTo(0, 0); }
// "Tap again to confirm" instead of a browser pop-up
function armed(btn, label, action) {
  btn.onclick = () => {
    if (btn.classList.contains("armed")) return action();
    btn.classList.add("armed"); const old = btn.textContent; btn.textContent = label;
    setTimeout(() => { btn.classList.remove("armed"); btn.textContent = old; }, 3000);
  };
}
const header = (title, backTo) => `<div class="top">${backTo ? `<button class="back-btn" id="back" aria-label="Back">‹</button>` : ""}<h1>${esc(title)}</h1></div>`;
const wireBack = to => { const b = $("#back"); if (b) b.onclick = () => go(to); };
function nums(n, d) { return `<span class="nums"><span class="${n ? "n-new" : "n-zero"}" title="New">${n}</span><span class="${d ? "n-due" : "n-zero"}" title="To review">${d}</span></span>`; }

function render() {
  document.querySelectorAll("[data-tab]").forEach(b => b.dataset.tab === (view.name === "settings" ? "settings" : "decks") ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  ({ home, deck: deckScreen, add, bulk, browse, edit, options, study, settings })[view.name]();
}

// --- Home: your decks
function home() {
  const rows = S.decks.map(d => {
    const k = counts(d), total = cardsOf(d.id).length;
    return `<button class="deck-row" data-deck="${d.id}"><span><span class="name">${esc(d.name)}</span><br><span class="sub">${total} card${total === 1 ? "" : "s"}</span></span>${nums(k.fresh.length, k.due.length + k.learning.length)}</button>`;
  }).join("");
  app.innerHTML = `${header("Hfad")}
    <div class="small-text sync" id="syncBadge">${syncText()}</div>
    ${S.decks.length ? `<div class="row small-text muted"><span class="n-new">● New</span><span class="n-due">● To review</span></div><div class="decks">${rows}</div>`
      : `<div class="panel empty"><div class="big">No deck yet</div><p class="muted" style="margin:0">Create your first deck, then add cards to it.</p></div>`}
    <div class="panel">
      <div class="field"><label for="newDeck">New deck</label><input id="newDeck" type="text" placeholder="e.g. Phrasal verbs, Interview English…" autocomplete="off"></div>
      <button class="primary" id="createDeck">Create deck</button>
    </div>`;
  document.querySelectorAll("[data-deck]").forEach(b => b.onclick = () => go({ name: "deck", deck: b.dataset.deck }));
  const create = () => {
    const name = $("#newDeck").value.trim(); if (!name) return $("#newDeck").focus();
    const d = { id: uid(), name, opts: defaultOpts() }; S.decks.push(d); save(); toast("Deck created"); go({ name: "add", deck: d.id });
  };
  $("#createDeck").onclick = create;
  $("#newDeck").onkeydown = e => { if (e.key === "Enter") create(); };
}

// --- One deck: study, add, browse, options
const ivlOf = c => c.state === "new" ? 0 : Math.max(0, Math.round((c.due - dayStart(c.last)) / DAY));
function deckScreen() {
  const d = deckById(view.deck); if (!d) return go({ name: "home" });
  const k = counts(d), cs = cardsOf(d.id), todo = k.fresh.length + k.due.length + k.learning.length;
  const young = cs.filter(c => c.state !== "new" && ivlOf(c) < 21).length, mature = cs.filter(c => c.state === "review" && ivlOf(c) >= 21).length;
  const tomorrow = cs.filter(c => c.state !== "new" && c.due < dayStart() + 2 * DAY).length;
  app.innerHTML = `${header(d.name, true)}
    <div class="panel study-box">
      <div class="study-nums"><div><b class="n-new">${k.fresh.length}</b><span class="label">New</span></div><div><b class="n-due">${k.due.length + k.learning.length}</b><span class="label">To review</span></div></div>
      ${todo ? `<button class="primary wide" id="studyBtn">Study now</button>`
        : `<p style="margin:0"><b>Done for today.</b> <span class="muted">${cs.length ? `${tomorrow} card${tomorrow === 1 ? "" : "s"} to review tomorrow.` : "Add some cards to start."}</span></p>
           ${k.newLeft ? `<button class="wide" id="moreBtn">Study 10 more new cards</button>` : ""}`}
    </div>
    <div class="menu">
      <button id="addBtn">＋ Add a card</button><button id="bulkBtn">Add many</button>
      <button id="browseBtn">Browse cards</button><button id="optBtn">Options</button>
    </div>
    <div class="panel">
      <div class="stats"><div><b>${cs.length}</b><span>Cards</span></div><div><b>${cs.length - young - mature}</b><span>New</span></div><div><b>${young}</b><span>Learning</span></div><div><b>${mature}</b><span>Mature</span></div></div>
      <p class="muted small-text" style="margin:0">Mature = the next review is 3 weeks or more away. Answer mode: <b>${d.opts.mode === "type" ? "type the answer" : "flip the card"}</b>, ${d.opts.newPerDay} new cards a day.</p>
    </div>`;
  wireBack({ name: "home" });
  const sb = $("#studyBtn"); if (sb) sb.onclick = () => startStudy(d);
  const mb = $("#moreBtn"); if (mb) mb.onclick = () => startStudy(d, 10);
  $("#addBtn").onclick = () => go({ name: "add", deck: d.id });
  $("#bulkBtn").onclick = () => go({ name: "bulk", deck: d.id });
  $("#browseBtn").onclick = () => go({ name: "browse", deck: d.id, q: "" });
  $("#optBtn").onclick = () => go({ name: "options", deck: d.id });
}

// --- Add one card
function add() {
  const d = deckById(view.deck); if (!d) return go({ name: "home" });
  app.innerHTML = `${header("Add a card", true)}
    <p class="muted small-text" style="margin:-8px 0 0">Deck: <b>${esc(d.name)}</b> · <span id="nCards">${cardsOf(d.id).length}</span> cards</p>
    <div class="panel">
      <div class="field"><label for="front">Front <span class="help">— the question</span></label><textarea id="front" placeholder="e.g. partir"></textarea></div>
      <div class="field"><label for="backF">Back <span class="help">— the answer. Several right answers? Separate them with /</span></label><textarea id="backF" placeholder="e.g. to leave"></textarea></div>
      <div class="field"><label for="extra">Example or note <span class="help">— optional, shown with the answer</span></label><textarea id="extra" placeholder="e.g. I leave work at 6."></textarea></div>
      <label class="check"><input type="checkbox" id="rev"> Also add the reversed card (back → front)</label>
      <button class="primary wide" id="saveCard">Add card</button>
    </div>`;
  wireBack({ name: "deck", deck: d.id });
  $("#front").focus();
  $("#saveCard").onclick = () => {
    const f = $("#front").value.trim(), b = $("#backF").value.trim(), x = $("#extra").value.trim();
    if (!f || !b) return toast("Fill in the front and the back.");
    S.cards.push(newCard(d.id, f, b, x));
    if ($("#rev").checked) S.cards.push(newCard(d.id, b, f, x));
    save(); toast($("#rev").checked ? "2 cards added" : "Card added");
    $("#front").value = $("#backF").value = $("#extra").value = ""; $("#front").focus();
    $("#nCards").textContent = cardsOf(d.id).length;
  };
}

// --- Add many at once: one card per line, "front ; back" (or pasted from a spreadsheet)
function parseLines(text) {
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.includes("\t") ? l.split("\t") : l.split(/\s*;\s*/);
    return parts.length >= 2 && parts[0] && parts[1] ? { front: parts[0].trim(), back: parts[1].trim(), extra: (parts[2] || "").trim() } : null;
  });
}
function bulk() {
  const d = deckById(view.deck); if (!d) return go({ name: "home" });
  app.innerHTML = `${header("Add many", true)}
    <div class="panel">
      <p style="margin:0">One card per line: <b>front ; back</b>, and optionally <b>; example</b>.</p>
      <p class="muted small-text" style="margin:0">You can also paste two columns from Excel or Google Sheets. Example:<br><code>partir ; to leave ; I leave at 6.</code><br><code>oublier ; to forget</code></p>
      <textarea id="lines" class="big" placeholder="partir ; to leave&#10;oublier ; to forget"></textarea>
      <label class="check"><input type="checkbox" id="rev"> Also add the reversed cards</label>
      <p class="muted small-text" id="preview" style="margin:0">0 cards ready.</p>
      <button class="primary wide" id="addAll" disabled>Add cards</button>
    </div>`;
  wireBack({ name: "deck", deck: d.id });
  const upd = () => {
    const rows = parseLines($("#lines").value), ok = rows.filter(Boolean).length, bad = rows.length - ok;
    $("#preview").textContent = `${ok} card${ok === 1 ? "" : "s"} ready${bad ? ` · ${bad} line${bad === 1 ? "" : "s"} without “ ; ” will be skipped` : ""}.`;
    $("#addAll").disabled = !ok; $("#addAll").textContent = ok ? `Add ${ok * ($("#rev").checked ? 2 : 1)} cards` : "Add cards";
  };
  $("#lines").oninput = upd; $("#rev").onchange = upd;
  $("#addAll").onclick = () => {
    const rows = parseLines($("#lines").value).filter(Boolean), base = Date.now();
    rows.forEach((r, i) => {
      S.cards.push(newCard(d.id, r.front, r.back, r.extra, [], base + i));
      if ($("#rev").checked) S.cards.push(newCard(d.id, r.back, r.front, r.extra, [], base + i + 0.5));
    });
    save(); toast(`${rows.length * ($("#rev").checked ? 2 : 1)} cards added`); go({ name: "deck", deck: d.id });
  };
}

// --- Browse and search
function statusOf(c) {
  if (c.state === "new") return "new";
  const days = Math.round((c.due - dayStart()) / DAY);
  return days <= 0 ? "due" : "in " + fmtIvl(days);
}
function browse() {
  const d = deckById(view.deck); if (!d) return go({ name: "home" });
  app.innerHTML = `${header("Browse", true)}
    <input type="search" id="q" placeholder="Search ${cardsOf(d.id).length} cards" value="${esc(view.q || "")}" autocomplete="off">
    <div class="panel" style="padding:4px 16px"><div class="list" id="list"></div></div>`;
  wireBack({ name: "deck", deck: d.id });
  const draw = () => {
    const q = norm($("#q").value);
    const items = cardsOf(d.id).filter(c => !q || norm(c.front + " " + c.back).includes(q)).sort((a, b) => a.order - b.order);
    $("#list").innerHTML = items.length ? items.slice(0, 300).map(c => `<button class="item" data-card="${c.id}"><span class="f">${esc(c.front)}</span><span class="b">${esc(c.back)}</span><span class="s">${statusOf(c)}</span></button>`).join("")
      + (items.length > 300 ? `<p class="muted small-text">Showing 300 of ${items.length}. Search to narrow down.</p>` : "")
      : `<p class="muted">No card found.</p>`;
    document.querySelectorAll("[data-card]").forEach(b => b.onclick = () => go({ name: "edit", deck: d.id, card: b.dataset.card, q: $("#q").value }));
  };
  $("#q").oninput = draw; draw();
}

// --- Edit one card
function edit() {
  const c = cardById(view.card); if (!c) return go({ name: "browse", deck: view.deck });
  app.innerHTML = `${header("Edit card", true)}
    <div class="panel">
      <div class="field"><label for="front">Front</label><textarea id="front">${esc(c.front)}</textarea></div>
      <div class="field"><label for="backF">Back</label><textarea id="backF">${esc(c.back)}</textarea></div>
      <div class="field"><label for="extra">Example or note</label><textarea id="extra">${esc(c.extra)}</textarea></div>
      <p class="muted small-text" style="margin:0">Status: ${statusOf(c)} · reviewed ${c.reps} time${c.reps === 1 ? "" : "s"} · forgotten ${c.lapses} time${c.lapses === 1 ? "" : "s"}. Editing keeps the progress.</p>
      <button class="primary wide" id="saveEdit">Save</button>
      <div class="row"><button class="small" id="resetCard">Reset progress</button><button class="small danger" id="delCard">Delete card</button></div>
    </div>`;
  const backTo = { name: "browse", deck: view.deck, q: view.q };
  wireBack(backTo);
  $("#saveEdit").onclick = () => {
    const f = $("#front").value.trim(), b = $("#backF").value.trim();
    if (!f || !b) return toast("Front and back can't be empty.");
    c.front = f; c.back = b; c.extra = $("#extra").value.trim(); c.alts = []; save(); toast("Saved"); go(backTo);
  };
  armed($("#resetCard"), "Tap again to reset", () => { Object.assign(c, { state: "new", due: 0, stab: 0, diff: 0, reps: 0, lapses: 0, last: 0 }); save(); toast("Progress reset"); go(backTo); });
  armed($("#delCard"), "Tap again to delete", () => { S.cards = S.cards.filter(x => x !== c); save(); toast("Card deleted"); go(backTo); });
}

// --- Deck options
function options() {
  const d = deckById(view.deck); if (!d) return go({ name: "home" });
  const sel = (id, list, v) => `<select id="${id}">${list.map(n => `<option value="${n}" ${n === v ? "selected" : ""}>${n === 9999 ? "No limit" : n}</option>`).join("")}</select>`;
  app.innerHTML = `${header("Options", true)}
    <div class="panel">
      <div class="field"><label for="dname">Deck name</label><input type="text" id="dname" value="${esc(d.name)}"></div>
      <div class="field"><label>Answer mode</label>
        <div class="seg"><button type="button" data-mode="flip" aria-pressed="${d.opts.mode === "flip"}">Flip the card</button><button type="button" data-mode="type" aria-pressed="${d.opts.mode === "type"}">Type the answer</button></div>
        <span class="help">Flip: you think of the answer, turn the card and grade yourself, like Anki. Type: you type it, the app checks it and suggests a grade.</span></div>
      <div class="field"><label for="npd">New cards per day</label>${sel("npd", [5, 10, 15, 20, 30, 50, 100], d.opts.newPerDay)}<span class="help">More new cards = faster progress, but more reviews in the following days.</span></div>
      <div class="field"><label for="mr">Maximum reviews per day</label>${sel("mr", [50, 100, 200, 300, 500, 9999], d.opts.maxReviews)}<span class="help">A ceiling, so a few missed days never turn into a mountain.</span></div>
      <button class="primary wide" id="saveOpt">Save</button>
    </div>
    <div class="panel"><button class="danger" id="delDeck">Delete this deck and its ${cardsOf(d.id).length} cards</button></div>`;
  wireBack({ name: "deck", deck: d.id });
  let mode = d.opts.mode;
  document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { mode = b.dataset.mode; document.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
  $("#saveOpt").onclick = () => {
    d.name = $("#dname").value.trim() || d.name; d.opts = { mode, newPerDay: +$("#npd").value, maxReviews: +$("#mr").value };
    save(); toast("Options saved"); go({ name: "deck", deck: d.id });
  };
  armed($("#delDeck"), "Tap again to delete everything", () => { S.decks = S.decks.filter(x => x !== d); S.cards = S.cards.filter(c => c.deck !== d.id); save(); toast("Deck deleted"); go({ name: "home" }); });
}

// --- Study: the card turns over
function startStudy(d, extraNew = 0) {
  ses = { deck: d.id, queue: buildQueue(d, extraNew), done: 0, flipped: false, typed: "", verdict: "", hint: false };
  go({ name: "study", deck: d.id });
}
function suggestion() { // typed mode only
  if (ses.verdict === "giveup" || ses.verdict === "wrong") return 1;
  if (ses.verdict === "almost" || ses.hint) return 2;
  return 3; // right on your own: Good. Keep Easy for answers that were truly effortless.
}
const VERDICT = { exact: "Right", almost: "Almost: one typo or a word missing", wrong: "Not right", giveup: "You gave up" };
function study() {
  const d = deckById(ses ? ses.deck : view.deck);
  if (!d || !ses) return go({ name: "home" });
  const c = cardById(ses.queue[0]);
  if (!c) { // session finished
    const k = counts(d);
    app.innerHTML = `${header(d.name, true)}
      <div class="panel empty"><div class="big">Well done</div>
        <p style="margin:0">${ses.done} card${ses.done === 1 ? "" : "s"} studied. You've finished this deck for now.</p>
        ${k.newLeft ? `<button class="wide" id="moreBtn">Study 10 more new cards</button>` : ""}
        <button class="primary wide" id="homeBtn">Back to decks</button></div>`;
    wireBack({ name: "deck", deck: d.id });
    const mb = $("#moreBtn"); if (mb) mb.onclick = () => startStudy(d, 10);
    $("#homeBtn").onclick = () => go({ name: "home" });
    return;
  }
  const typeMode = d.opts.mode === "type";
  const left = ses.queue.map(cardById).filter(Boolean);
  const nNew = left.filter(x => x.state === "new").length;
  const stateTag = c.state === "new" ? "New" : c.state === "learning" ? "Again" : "Review";
  app.innerHTML = `
    <div class="study-top"><button class="back-btn" id="back" aria-label="Back">‹</button><span class="muted small-text" style="flex:1">${esc(d.name)}</span>${nums(nNew, left.length - nNew)}</div>
    <div class="scene enter"><div class="flip" id="flip">
      <div class="face front"><div class="tag"><span>${stateTag}</span></div>
        <div class="q">${esc(c.front)}</div>
        ${typeMode ? `<div class="spacer"></div><div class="answer-box">
            <input type="text" id="ans" aria-label="Your answer" placeholder="Type your answer" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">
            <div id="hintBox"></div>
            <button class="small" id="hintBtn" style="align-self:flex-start">Hint</button></div>`
          : `<div class="spacer"></div><div class="tap">Tap the card to turn it over</div>`}
      </div>
      <div class="face back" id="backFace"></div>
    </div></div>
    <div id="controls">${typeMode ? `<div class="pair"><button class="giveup" id="giveUp">I give up</button><button class="primary" id="showBtn">Check</button></div>` : `<button class="primary wide" id="showBtn">Show answer</button>`}</div>`;
  wireBack({ name: "deck", deck: d.id });
  const reveal = () => {
    if (ses.flipped) return;
    ses.flipped = true;
    if (typeMode && !ses.verdict) { ses.typed = $("#ans").value; ses.verdict = check(ses.typed, c); }
    const sug = typeMode ? suggestion() : 0;
    $("#backFace").innerHTML = `<div class="tag"><span>${stateTag}</span></div>
      <div class="q small-q">${esc(c.front)}</div>
      ${typeMode ? `<div class="verdict g${sug}">${VERDICT[ses.verdict]}${ses.hint && ses.verdict === "exact" ? " (with the hint)" : ""}</div>${ses.typed.trim() && ses.verdict !== "giveup" ? `<div class="yours">You typed: ${esc(ses.typed)}</div>` : ""}` : ""}
      <div class="a">${typeMode && ses.typed.trim() && ses.verdict !== "giveup" && ses.verdict !== "exact" ? markMissing(ses.typed, c.back) : esc(c.back)}</div>
      ${c.extra ? `<div class="x">${esc(c.extra)}</div>` : ""}`;
    requestAnimationFrame(() => $("#flip").classList.add("turned"));
    const o = outcomes(c);
    $("#controls").innerHTML = `<div class="grades">${[1, 2, 3, 4].map(g => `<button class="g-${g}${g === sug ? " suggest" : ""}" data-g="${g}">${["Again", "Hard", "Good", "Easy"][g - 1]}<small>${fmtIvl(o[g].ivl)}</small></button>`).join("")}</div>`;
    document.querySelectorAll("[data-g]").forEach(b => b.onclick = () => grade(+b.dataset.g));
  };
  const grade = g => {
    answer(c, g); ses.done++;
    ses.queue.shift();
    if (g === 1) ses.queue.splice(Math.min(3, ses.queue.length), 0, c.id); // see it again a few cards later
    Object.assign(ses, { flipped: false, typed: "", verdict: "", hint: false });
    render();
  };
  ses.reveal = reveal; ses.grade = grade;
  $("#showBtn").onclick = reveal;
  if (!typeMode) $("#flip").onclick = reveal;
  else {
    const ans = $("#ans");
    ans.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); reveal(); } };
    $("#giveUp").onclick = () => { ses.typed = ans.value; ses.verdict = "giveup"; reveal(); };
    $("#hintBtn").onclick = () => { ses.hint = true; $("#hintBox").innerHTML = `<div class="hint">${esc(hintOf(c.back))}</div>`; $("#hintBtn").remove(); ans.focus(); };
    if (matchMedia("(pointer: fine)").matches) ans.focus();
  }
}

// --- Settings: backup
function settings() {
  const total = S.cards.length;
  const studied = S.cards.filter(c => c.state !== "new").length;
  let account;
  if (!window.cloud) account = `<p class="muted" style="margin:0">Loading… If this stays, the sync service can't be reached from this network.</p>`;
  else if (!window.cloud.user) account = `<p style="margin:0">Sign in with Google to keep your decks and progress on all your devices (phone, computer…).</p>
      <button class="primary" id="signIn">Sign in with Google</button>`;
  else if (sync.state === "choice" && sync.pending) {
    const r = JSON.parse(sync.pending.state), rStudied = r.cards.filter(c => c.state !== "new").length;
    account = `<p style="margin:0">Signed in as <b>${esc(window.cloud.user.email)}</b>. Your account and this device both have progress. Which one do you keep?</p>
      <button class="primary" id="keepCloud">Keep my account: ${rStudied} cards studied, ${r.decks.length} deck${r.decks.length === 1 ? "" : "s"} (saved ${new Date(sync.pending.updated).toLocaleDateString("en-GB")})</button>
      <button id="keepLocal">Keep this device: ${studied} cards studied, ${S.decks.length} deck${S.decks.length === 1 ? "" : "s"}</button>
      <p class="muted small-text" style="margin:0">The other version is replaced. Download a backup first if you're unsure.</p>`;
  } else account = `<p style="margin:0">Signed in as <b>${esc(window.cloud.user.email)}</b>. Your decks are saved in your account and follow you on every device.</p>
      <p class="muted small-text" style="margin:0" id="syncBadge">${syncText()}${sync.last ? ` · ${new Date(sync.last).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
      <div class="row"><button class="small" id="syncBtn">Sync now</button><button class="small" id="signOut">Sign out</button></div>`;
  const install = isInstalled() ? `<p style="margin:0">✓ Hfad is installed on this device. It opens from its icon and works without internet.</p>`
    : installPrompt ? `<p style="margin:0">Add Hfad to this device like a real app: its own icon, full screen, works without internet.</p><button class="primary" id="installBtn">Install Hfad</button>`
    : isIOS() ? `<p style="margin:0">Add Hfad to your home screen like a real app: its own icon, full screen, works without internet.</p>
        <ol class="small-text" style="margin:0;padding-left:1.2em"><li>Open this page in <b>Safari</b>.</li><li>Tap <b>Share</b> (the square with an arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>`
    : `<p style="margin:0">Add Hfad to this device like a real app: in Chrome or Edge, use the <b>Install</b> icon at the right of the address bar, or the browser menu → <b>Install Hfad</b>.</p>`;
  app.innerHTML = `${header("Settings")}
    <div class="panel">
      <h2>Install the app</h2>
      ${install}
    </div>
    <div class="panel">
      <h2>Account and sync</h2>
      ${account}
    </div>
    <div class="panel">
      <h2>This browser</h2>
      <p style="margin:0">Progress saved here since <b>${new Date(S.since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</b> · <b>${S.cards.filter(c => c.state !== "new").length}</b> cards already studied.</p>
      <p class="muted small-text" style="margin:0">If this date is today every time you open the app, this browser is not keeping your progress. Open the app the same way every time, ideally from an icon on your home screen (Safari → Share → Add to Home Screen).</p>
    </div>
    <div class="panel">
      <h2>Backup</h2>
      <p style="margin:0">Your decks and progress live in this browser only (${S.decks.length} deck${S.decks.length === 1 ? "" : "s"}, ${total} cards). Download a backup now and then, and before changing phone or clearing your browser.</p>
      <button class="primary" id="dl">Download a backup</button>
      <button id="restoreBtn">Restore from a backup file</button>
      <input type="file" id="file" accept=".json,application/json" hidden>
      <p class="muted small-text" style="margin:0">Restoring replaces everything in this browser with the content of the file.</p>
    </div>
    <div class="panel">
      <h2>How cards are scheduled</h2>
      <p class="muted small-text" style="margin:0">Hfad uses FSRS, the same scheduler as recent versions of Anki. It aims for a 90% chance that you still remember a card when it comes back: cards you know well come back after longer and longer gaps, cards you forget come back sooner.</p>
    </div>`;
  const on = (id, f) => { const el = $("#" + id); if (el) el.onclick = f; };
  on("installBtn", async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); });
  on("signIn", async () => { try { await window.cloud.signIn(); } catch (e) { toast("Sign-in failed: " + (e.code || "try again")); } });
  on("signOut", async () => { await window.cloud.signOut(); S.syncedTo = null; saveLocal(); toast("Signed out. Your cards stay on this device."); render(); });
  on("syncBtn", () => syncNow(false).then(render));
  on("keepCloud", () => { applyRemote(sync.pending); sync.pending = null; toast("Your account's data is now on this device"); go({ name: "home" }); });
  on("keepLocal", () => { sync.pending = null; S.syncedTo = window.cloud.user.uid; S.updated = Date.now(); saveLocal(); pushNow().then(() => { toast("This device's data is now saved in your account"); render(); }); });
  $("#dl").onclick = () => {
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: "application/json" }));
      a.download = `hfad-backup-${dayKey()}.json`; document.body.appendChild(a); a.click(); a.remove();
      toast("Backup downloaded");
    } catch (e) { toast("Download blocked by this browser."); }
  };
  $("#restoreBtn").onclick = () => $("#file").click();
  $("#file").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.decks) || !Array.isArray(data.cards)) throw 0;
      S = { ...data, syncedTo: cloudOn() ? window.cloud.user.uid : null }; S.log = S.log || []; S.intro = S.intro || {}; save(); toast("Backup restored"); go({ name: "home" });
    } catch (err) { toast("This file is not a Hfad backup."); }
  };
}

// ============================================================================
// 6. Start
// ============================================================================
document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => go({ name: b.dataset.tab === "settings" ? "settings" : "home" }));
document.addEventListener("keydown", e => { // keyboard: space/enter turns the card, 1–4 grade it
  if (e.defaultPrevented || view.name !== "study" || !ses || /input|textarea|select/i.test(e.target.tagName)) return; // the answer box handles its own Enter
  if (!ses.flipped && (e.key === " " || e.key === "Enter")) { e.preventDefault(); ses.reveal && ses.reveal(); }
  else if (ses.flipped && "1234".includes(e.key)) ses.grade(+e.key);
  else if (ses.flipped && (e.key === " " || e.key === "Enter")) { e.preventDefault(); const s = document.querySelector(".grades .suggest") || document.querySelector(".g-3"); s && s.click(); }
});
// ============================================================================
// 7. Installable app (PWA): works offline, can be added to the home screen.
// ============================================================================
let installPrompt = null; // Android and desktop Chrome/Edge offer a one-tap install
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; if (view.name === "settings") render(); });
window.addEventListener("appinstalled", () => { installPrompt = null; toast("Hfad is installed"); if (view.name === "settings") render(); });
const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});

load();
render();
