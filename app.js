// Daily Deck – app logic: decks, spaced repetition (SM-2), answer checking and screens. Cards live in decks.js.
// ---------- Decks ----------
const DECKS = {
  verbs: { name: "Verbs", about: "French verb → English verb" },
};
// Levels: same ladder for every deck. A level with no cards yet shows as "soon".
const LEVELS = ["Intern", "Analyst", "Consultant", "Manager", "Partner"];
const TAG_LEVEL = { Meeting: "Analyst", Email: "Analyst", Interview: "Consultant", Case: "Consultant", Consulting: "Consultant", Finance: "Partner", Tech: "Partner" };

const KEY = "dailydeck.v1";
const DAY = 86400000;
const MASTERED = 21; // mastered: its next review is 3 weeks or more away
const SOLID = 7;     // solid: its next review is a week or more away. A level closes when all its cards are solid.
const UNLOCK = 3;    // Expressions: "say it" unlocks once you understand the card with a 3-day gap
const HARD = 2;      // missed twice or more: listed in "Hardest cards"
let S;

function blank() { return { introduced: null, due: 0, interval: 0, ease: 2.3, reps: 0, lapses: 0 }; }
function makeExpr(d, i) { return { id: "d" + (i + 1), deck: "expr", en: d[0], alts: [], fr: d[1], ex: d[2], tag: d[3], level: d[4] || TAG_LEVEL[d[3]] || "Intern", ...blank(), p: blank() }; }
// Kinds: none = French verb → English verb · "Simple past" / "Past participle" = give that form · "Sentence" = fill in the blank
function makeVerb(d, i) {
  const kind = d[5] || "", c = { id: "v" + (i + 1), deck: "verbs", fr: d[0], en: d[1], alts: d[2] || [], ex: d[3], tag: "Verbs", level: d[4] || "Intern", kind, ...blank(), p: blank() };
  if (kind === "Sentence") { c.trans = d[3]; c.ex = d[0].replace(/___\s*\([^)]*\)/, d[1]); }
  return c;
}
const KIND_LABEL = { "": "Verb", "Simple past": "Irregular verb", "Past participle": "Irregular verb", Sentence: "Fill in the verb" };
function allMade() { return VERBS.map(makeVerb); } // add new decks here
function fresh() { return { cards: allMade(), log: [], settings: {}, intro: {}, goal: {}, flags: {}, level: {}, deck: "verbs" }; }
function normalize() {
  S.settings = Object.assign({ newPerDay: 10, reviewCap: 80 }, S.settings || {});
  S.intro = S.intro || {}; S.log = S.log || []; S.goal = S.goal || {}; S.flags = S.flags || {};
  if (typeof S.level !== "object" || S.level === null) S.level = {};
  if (!DECKS[S.deck]) S.deck = "verbs";
  S.cards.forEach(c => { if (!c.p) c.p = blank(); if (!c.deck) c.deck = "expr"; });
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) S = JSON.parse(raw); } catch (e) {}
  if (!S || !Array.isArray(S.cards)) S = fresh();
  normalize();
  // Text, level and accepted answers always come from the deck: a corrected card is fixed and keeps its progress.
  // Cards and history of decks that no longer exist are dropped.
  const made = allMade(), ids = new Set(made.map(m => m.id));
  S.cards = S.cards.filter(c => ids.has(c.id));
  S.log = S.log.filter(l => DECKS[l.deck]);
  const have = new Map(S.cards.map(c => [c.id, c]));
  made.forEach(m => {
    const c = have.get(m.id);
    if (c) { Object.assign(c, { en: m.en, fr: m.fr, ex: m.ex, tag: m.tag, level: m.level, alts: m.alts, deck: m.deck, kind: m.kind, trans: m.trans }); delete c.asked; }
    else S.cards.push(m);
  });
  Object.keys(DECKS).forEach(d => { if (S.level[d] === undefined) S.level[d] = currentLevel(d); });
  save();
}
// Browsers give each site about 5 MB: keep the detailed log for 180 days, older days as a simple count.
function compact() {
  const limit = dayStart() - 180 * DAY;
  if (!S.log.length || S.log[0].t >= limit) return;
  S.days = S.days || {};
  S.log.forEach(l => { if (l.t < limit && !l.practice) S.days[dayKey(l.t)] = (S.days[dayKey(l.t)] || 0) + 1; });
  S.log = S.log.filter(l => l.t >= limit);
}
function save() { try { compact(); localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

// ---------- Dates ----------
function dayStart(t = Date.now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dayKey(t = Date.now()) { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

// ---------- Cards and sides ----------
// "p" = say it in English (French shown). "r" = understand it (English shown), Expressions only.
const side = (c, dir) => dir === "p" ? c.p : c;
const byId = id => S.cards.find(c => c.id === id);
const parseQ = q => { const [id, dir] = q.split("|"); return { c: byId(id), dir }; };
const sidesOf = c => c.deck === "verbs" ? ["p"] : ["r", "p"];
const deckCards = d => S.cards.filter(c => c.deck === d);
const levelCards = (d, name) => deckCards(d).filter(c => c.level === name);
const isMastered = c => sidesOf(c).every(dir => side(c, dir).interval >= MASTERED);
// Irregular verbs are what you hesitate on most: their cards must hold two weeks, not one, before the level closes.
const SOLID_BY_LEVEL = { Analyst: 14 };
const solidDays = level => SOLID_BY_LEVEL[level] || SOLID;
const isSolid = c => sidesOf(c).every(dir => side(c, dir).interval >= solidDays(c.level));
const unlocked = c => c.deck === "verbs" || (!!c.introduced && c.interval >= UNLOCK);
function currentLevel(d) { // first level not closed yet; a level without cards stops the climb
  for (let i = 0; i < LEVELS.length; i++) { const cs = levelCards(d, LEVELS[i]); if (!cs.length || !cs.every(isSolid)) return i; }
  return LEVELS.length;
}

// ---------- Scheduler (SM-2 style, the logic behind Anki) ----------
// grade: 0 Again, 1 Hard, 2 Good, 3 Easy. Returns the next gap in days and the new ease.
function elapsedDays(s) { return s.introduced && s.reps ? Math.max(0, Math.round((dayStart() - (s.due - s.interval * DAY)) / DAY)) : 0; }
// Every button always gives a different gap, from shortest to longest:
//   Again → again in a few cards, then tomorrow
//   first time: Hard 1 day · Good 2 days · Easy 4 days
//   after that: Hard ≈ gap × 1.2 · Good ≈ gap × ease (about 2.3) · Easy ≈ gap × ease × 1.3, each at least one day more than the one before
function nextState(s, grade, elapsed = s.interval) {
  let { interval, ease, reps, lapses } = s;
  if (grade === 0) return { interval: 1, ease: Math.max(1.3, ease - 0.2), reps: 0, lapses: lapses + 1 };
  const late = Math.max(0, elapsed - interval);
  let hard, good, easy;
  if (reps === 0) [hard, good, easy] = [1, 2, 4];
  else {
    hard = Math.max(interval + 1, Math.round(interval * 1.2));
    good = Math.max(hard + 1, Math.round((interval + late / 2) * ease));
    easy = Math.max(good + 1, Math.round((interval + late) * ease * 1.3));
  }
  if (grade === 1) ease -= 0.15;
  if (grade === 3) ease += 0.15;
  return { interval: [0, hard, good, easy][grade], ease: Math.max(1.3, Math.round(ease * 100) / 100), reps: reps + 1, lapses };
}
const fmtDays = d => d === 1 ? "tomorrow" : d < 30 ? `in ${d} days` : d < 365 ? `in ${Math.round(d / 30)} months` : `in ${(d / 365).toFixed(1)} years`;
const short = d => d < 30 ? d + "d" : d < 365 ? Math.round(d / 30) + "mo" : (d / 365).toFixed(1) + "y";
const gapLabel = (g, d) => g === 0 ? "now" : short(d);

// ---------- Queue ----------
let queue = [], current = null, flipped = false, sessionDone = 0, backlog = 0, practice = false, practiceDone = false, practiceKind = "";
let typed = "", verdict = null, hint = false, gaveUp = false;
const D = () => S.deck;
const goalKey = () => D() + "|" + dayKey();
function doneToday(d = D()) { const s = dayStart(); return new Set(S.log.filter(l => l.t >= s && !l.practice && (l.deck || "expr") === d).map(l => l.id + "|" + (l.dir || "r"))).size; }
function reviewsToday() { const s = dayStart(); return S.log.filter(l => l.t >= s && !l.wasNew && !l.practice && (l.deck || "expr") === D()).length; }
function risk(s) { return (dayStart() - s.due) / DAY / Math.max(1, s.interval); } // most at risk first
function buildQueue(extraNew = 0) {
  practice = false;
  const end = dayStart() + DAY, cards = deckCards(D());
  const due = [];
  cards.forEach(c => sidesOf(c).forEach(dir => { const s = side(c, dir); if (s.introduced && s.due < end) due.push({ q: c.id + "|" + dir, s }); }));
  due.sort((a, b) => risk(b.s) - risk(a.s));
  const room = Math.max(0, S.settings.reviewCap - reviewsToday());
  backlog = Math.max(0, due.length - room);
  const reviews = due.slice(0, room).map(x => x.q);
  const fresh = [];
  if (!backlog) { // behind on reviews: no new cards until you catch up
    const k = goalKey(), lv = LEVELS[currentLevel(D())];
    const roomR = Math.max(0, S.settings.newPerDay + extraNew - (S.intro[k + "|r"] || 0));
    const roomP = Math.max(0, S.settings.newPerDay + extraNew - (S.intro[k + "|p"] || 0));
    const pool = lv ? levelCards(D(), lv) : [];
    const newR = D() === "expr" ? pool.filter(c => !c.introduced).slice(0, roomR).map(c => c.id + "|r") : [];
    const newP = (D() === "verbs" ? pool : cards).filter(c => unlocked(c) && !c.p.introduced).slice(0, roomP).map(c => c.id + "|p");
    for (let i = 0; i < Math.max(newR.length, newP.length); i++) { if (newP[i]) fresh.push(newP[i]); if (newR[i]) fresh.push(newR[i]); }
  }
  queue = [...reviews, ...fresh];
  if (!S.goal[goalKey()]) { S.goal[goalKey()] = { target: queue.length + doneToday(), won: false }; save(); }
}
function hardest(d = D()) {
  const out = [];
  deckCards(d).forEach(c => sidesOf(c).forEach(dir => { const s = side(c, dir); if (s.lapses >= HARD) out.push({ c, dir, s }); }));
  return out.sort((a, b) => b.s.lapses - a.s.lapses);
}
function startPractice() { // replay the hardest cards without changing their schedule
  queue = hardest().slice(0, 10).map(x => x.c.id + "|" + x.dir);
  practice = true; practiceKind = "hard"; practiceDone = false; next(); go("review");
}
// Keep going after the day is done: replay cards you've already seen, the ones coming back soonest first.
// It does not move their next review, so the spacing that makes memory stick stays intact.
function startExtra() {
  const seen = [];
  deckCards(D()).forEach(c => sidesOf(c).forEach(dir => { const s = side(c, dir); if (s.introduced) seen.push({ q: c.id + "|" + dir, due: s.due }); }));
  queue = seen.sort((a, b) => a.due - b.due).slice(0, 20).map(x => x.q);
  practice = true; practiceKind = "extra"; practiceDone = false; next(); go("review");
}
const seenCount = () => deckCards(D()).filter(c => sidesOf(c).some(dir => side(c, dir).introduced)).length;
function next() { current = queue[0] || null; flipped = false; typed = ""; verdict = null; hint = false; gaveUp = false; }

// Say it cards are graded by the app, not by you:
// Easy = found alone · Good = found with the hint · Hard = almost (a typo, a missing word) · Again = wrong or "I give up".
function autoGrade() {
  if (gaveUp || !verdict || verdict.kind === "wrong") return 0;
  if (verdict.kind === "almost") return 1;
  return hint ? 2 : 3;
}
const GRADES = [
  ["Again", "Not found"],
  ["Hard", "Almost"],
  ["Good", "Found with the hint"],
  ["Easy", "Found on your own"],
];

function grade(g) {
  if (!current) return;
  const { c, dir } = parseQ(current);
  const s = side(c, dir);
  if (practice) {
    S.log.push({ t: Date.now(), id: c.id, deck: c.deck, dir, g, practice: true });
  } else {
    const fullBefore = isMastered(c);
    const wasNew = !s.introduced;
    const elapsed = elapsedDays(s);
    if (wasNew) { s.introduced = Date.now(); const k = goalKey() + "|" + dir; S.intro[k] = (S.intro[k] || 0) + 1; }
    const before = s.interval;
    Object.assign(s, nextState(s, g, elapsed));
    s.due = dayStart() + s.interval * DAY;
    S.log.push({ t: Date.now(), id: c.id, deck: c.deck, dir, g, wasNew, before, after: s.interval });
    if (!fullBefore && isMastered(c)) toast(`Mastered<br><b>${esc(c.en)}</b>`, true);
    const lvNow = currentLevel(D());
    if (lvNow > S.level[D()] && LEVELS[lvNow]) { toast(`Level up<br><b>${LEVELS[lvNow]}</b>`, true); confetti(); }
    S.level[D()] = lvNow;
    const goal = S.goal[goalKey()];
    if (goal && !goal.won && doneToday() >= goal.target) { goal.won = true; toast("Daily goal reached<br><b>Day won</b>", true); confetti(); }
  }
  queue.shift();
  if (g === 0) queue.splice(Math.min(3, queue.length), 0, current); // see it again a few cards later
  if (!queue.length && practice) practiceDone = true;
  sessionDone++;
  save(); next(); renderReview();
}

// ---------- Checking a typed answer ----------
function norm(t) {
  return String(t ?? "").toLowerCase().replace(/['’‘]/g, "").replace(/…/g, " ").replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
const core = t => norm(t).replace(/^(to|a|an|the) /, "");
function accepted(c) {
  const out = [c.en, ...(c.alts || [])].map(core);
  const m = c.en.match(/^(.*?)\s*\(([^)]+)\)\s*$/); // "return on investment (ROI)": full form or acronym
  if (m) out.push(core(m[1]), core(m[2]));
  return out.filter(Boolean);
}
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
function check(answer, c) {
  const a = core(answer);
  if (!a) return { kind: "wrong" };
  const acc = accepted(c);
  if (acc.includes(a)) return { kind: "exact" };
  // almost = one typo in a word of 4+ letters, or 80% of the letters right
  if (acc.some(e => { const d = lev(a, e); return (d === 1 && e.length >= 4) || 1 - d / Math.max(a.length, e.length) >= 0.8; })) return { kind: "almost" };
  return { kind: "wrong" };
}
function diff(answer, expected) { // underline the words you missed
  const got = new Set(norm(answer).split(" "));
  return expected.split(/(\s+)/).map(w => /^\s+$/.test(w) || !norm(w) || got.has(norm(w)) ? esc(w) : `<mark>${esc(w)}</mark>`).join("");
}
const hintOf = t => t.split(" ").map(w => w.replace(/(^[^A-Za-z]*[A-Za-z])|[A-Za-z]/g, (m, first) => first || "_")).join("  ");

// ---------- Speech ----------
function speak(text) {
  try { const u = new SpeechSynthesisUtterance(text.replace("…", "")); u.lang = "en-GB"; u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
}

// ---------- Effects ----------
let fxTimer, fxQueue = [];
function toast(html, big) { fxQueue.push([html, big]); if (fxQueue.length === 1) showFx(); }
function showFx() {
  const [html, big] = fxQueue[0]; const t = $("#fx");
  t.innerHTML = html; t.className = "fx show" + (big ? " big" : "");
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => { t.className = "fx"; fxQueue.shift(); if (fxQueue.length) setTimeout(showFx, 150); }, big ? 2400 : 900);
}
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = $("#confetti"), colors = ["#4E5D3A", "#9A7531", "#A6533F", "#4E7A4C", "#E7E6D3"];
  for (let i = 0; i < 36; i++) {
    const e = document.createElement("i");
    e.style.left = Math.random() * 100 + "vw"; e.style.background = colors[i % colors.length];
    e.style.animationDelay = Math.random() * 0.3 + "s"; e.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(e); setTimeout(() => e.remove(), 2200);
  }
}

// ---------- Rendering ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

function renderDecks() {
  $("#decks").hidden = Object.keys(DECKS).length < 2; // the switcher only shows when there is a choice
  $("#decks").innerHTML = Object.entries(DECKS).map(([id, d]) =>
    `<button type="button" role="tab" data-deck="${id}" aria-selected="${id === D()}">${d.name} <span>${deckCards(id).length}</span></button>`).join("");
  document.querySelectorAll("[data-deck]").forEach(b => b.onclick = () => {
    if (b.dataset.deck === D()) return;
    S.deck = b.dataset.deck; save(); buildQueue(); next(); sessionDone = 0;
    const tab = $("#view-stats").hidden ? "review" : "stats"; go(tab);
  });
}
function where() {
  const i = currentLevel(D());
  return LEVELS[i] ? `Level ${i + 1} · <b>${LEVELS[i]}</b>` : "All levels closed";
}
function renderStrip() {
  const g = S.goal[goalKey()], d = doneToday(), target = g ? g.target : 0, won = g && g.won;
  const pct = target ? Math.min(1, d / target) : (d ? 1 : 0);
  $("#strip").innerHTML = `
    <div class="goal ${won ? "won" : ""}">
      <div class="goal-top"><span class="label">${won ? "Day won" : "Today's goal"}</span>
        <span class="goal-n"><b>${Math.min(d, target)}</b> / ${target} cards${d > target ? ` <span class="bonus">+${d - target} extra</span>` : ""}</span></div>
      <div class="bar goalbar"><i style="width:${pct * 100}%"></i></div>
    </div>
    <p class="muted goal-note">${where()} · Goal = cards due today + ${S.settings.newPerDay} new.${won ? " Anything more is extra." : ""}</p>`;
}
function checkUrl(c) {
  const q = c.en.replace(/\s*\([^)]*\)/g, "").replace(/…/g, "").replace(/[,.?!]+$/g, "").trim();
  return "https://context.reverso.net/traduction/anglais-francais/" + encodeURIComponent(q).replace(/%20/g, "+");
}
function tools(c) {
  return `<div class="tools"><a href="${checkUrl(c)}" target="_blank" rel="noopener">Check in real sentences ↗</a>
    <button class="link" id="flag" type="button">${S.flags[c.id] ? "Flagged ✓" : "Flag as doubtful"}</button></div>`;
}
function renderCounts() {
  renderDecks(); renderStrip();
  if (practice) { $("#counts").innerHTML = `<span>Practice <b>${queue.length}</b></span>`; return; }
  const newLeft = queue.filter(q => { const { c, dir } = parseQ(q); return !side(c, dir).introduced; }).length;
  $("#counts").innerHTML = `<span>New <b>${newLeft}</b></span><span>Review <b>${queue.length - newLeft}</b></span>`;
}
function newLeftInLevel() { const lv = LEVELS[currentLevel(D())]; return lv ? levelCards(D(), lv).filter(c => D() === "verbs" ? !c.p.introduced : !c.introduced).length : 0; }

function renderDone(v) {
  if (practiceDone) {
    practice = false; practiceDone = false;
    v.innerHTML = `<div class="panel done"><div class="big">Practice done</div>
      <p class="muted" style="margin:0">Your schedule did not change. These cards still come back on their usual day.</p>
      <div class="row" style="justify-content:center"><button class="small" id="backReview">Back to today's review</button></div></div>`;
    $("#backReview").onclick = () => { buildQueue(); next(); renderReview(); };
    return;
  }
  const end2 = dayStart() + 2 * DAY;
  const tomorrow = deckCards(D()).reduce((n, c) => n + sidesOf(c).filter(dir => { const s = side(c, dir); return s.introduced && s.due < end2; }).length, 0);
  const g = S.goal[goalKey()], won = g && g.won;
  const t0 = dayStart(), today = S.log.filter(l => l.t >= t0 && !l.practice && (l.deck || "expr") === D());
  const lv = LEVELS[currentLevel(D())];
  const canMore = !backlog && newLeftInLevel();
  v.innerHTML = `<div class="panel done ${won ? "won" : ""}">
    <div class="big">${won ? "Day won" : "All clear"}</div>
    <p class="muted" style="margin:0">${won ? "You did every card planned for today." : "Nothing left to review right now."}</p>
    <div class="tiles recap">
      <div class="tile"><span class="v">${doneToday()}</span><span class="label">cards today</span></div>
      <div class="tile"><span class="v">${today.filter(l => l.wasNew).length}</span><span class="label">new</span></div>
      <div class="tile"><span class="v">${deckCards(D()).filter(isMastered).length}</span><span class="label">mastered</span></div>
    </div>
    <p class="muted" style="margin:0;font-size:.9rem">${tomorrow} card${tomorrow === 1 ? "" : "s"} due tomorrow.</p>
    ${backlog ? `<p class="muted" style="margin:0">${backlog} older review${backlog > 1 ? "s" : ""} will wait for tomorrow, so the daily load stays light.</p>` : ""}
    ${canMore ? `<button class="primary" id="moreNew" type="button">10 more new cards</button>` : ""}
    ${seenCount() ? `<button class="small" id="extraBtn" type="button">Keep reviewing cards I've seen</button>
      <p class="muted" style="margin:0;font-size:.82rem">Up to 20 cards, soonest first. Extra practice: it does not change when they come back.</p>` : ""}
    ${canMore ? "" :
      !backlog ? `<p class="muted" style="margin:0;font-size:.9rem">${lv && levelCards(D(), lv).length ? `Every card of ${lv} is started. The level closes when each card is solid (next review a week or more away).` : "The next level's cards are being written."}</p>` : ""}
  </div>`;
  if ($("#moreNew")) $("#moreNew").onclick = () => { buildQueue(10); next(); renderReview(); };
  if ($("#extraBtn")) $("#extraBtn").onclick = startExtra;
}

// What the question looks like, per kind of card
const FORM_HELP = { "Simple past": "Simple past · prétérit <span>(Yesterday I …)</span>", "Past participle": "Past participle · participe passé <span>(I have …)</span>" };
function front(c, faded) {
  if (c.kind === "Sentence") return `<div class="front sentence${faded ? " muted-front" : ""}">${esc(c.fr).replace("___", '<span class="blank">_____</span>')}</div>`;
  return `<div class="front fr-front${faded ? " muted-front" : ""}">${esc(c.fr)}</div>${FORM_HELP[c.kind] ? `<div class="form">${FORM_HELP[c.kind]}</div>` : ""}`;
}
function renderReview() {
  renderCounts();
  const v = $("#view-review");
  if (!current) return renderDone(v);
  const { c, dir } = parseQ(current);
  const s = side(c, dir), say = dir === "p";
  const notes = [];
  if (backlog && !practice && reviewsToday() === 0) notes.push(`You were away for a bit. Today is capped at ${S.settings.reviewCap} reviews, most urgent first; new cards are paused until you catch up.`);
  if (practice) notes.push(practiceKind === "extra" ? "Extra practice on cards you've seen. It does not change your schedule." : "Practice: your hardest cards. It does not change your schedule.");
  const status = !s.introduced ? "new" : s.interval >= MASTERED ? "mastered" : "learning";
  const label = c.deck === "verbs" ? KIND_LABEL[c.kind || ""] : `${esc(c.tag)} · ${say ? "Say it" : "Understand it"}`;
  let body, actions;

  if (!say) { // Expressions, English shown: you grade yourself
    const previews = [0, 1, 2, 3].map(g => short(nextState(s, g, elapsedDays(s)).interval));
    body = `<div class="front">${esc(c.en)}</div>
      <button class="small listen" id="listen" type="button">Listen</button>
      ${flipped ? `<div class="back"><div class="fr">${esc(c.fr)}</div>${c.ex ? `<div class="ex">“${esc(c.ex)}”</div>` : ""}${tools(c)}</div>`
        : `<div class="spacer"></div><p class="muted" style="margin:0;font-size:.9rem">Say what it means, then check.</p>`}`;
    actions = flipped ? `<div class="grades">${GRADES.map(([n], g) => `<button class="g${g}" data-g="${g}">${n}<small>${practice ? "" : gapLabel(g, nextState(s, g, elapsedDays(s)).interval)}</small></button>`).join("")}</div>`
      : `<button class="primary show" id="showBtn">Show answer</button>`;
  } else if (!flipped) { // French shown: type the English
    body = `${front(c)}
      ${hint ? `${c.trans ? `<div class="trans">${esc(c.trans)}</div>` : ""}<div class="hint" aria-label="Hint">${esc(hintOf(c.en))}</div>` : ""}
      <div class="spacer"></div>
      <div class="answer">
        <label for="ans" class="sr">Your answer in English</label>
        <input id="ans" type="text" placeholder="Type it in English" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" value="${esc(typed)}">
        <div class="row">${hint ? `<span class="muted" style="font-size:.85rem">Hint used: Good at best.</span>` : `<button class="small" id="hintBtn" type="button">Hint</button>`}</div>
      </div>`;
    actions = `<div class="pair"><button class="giveup" id="giveUp" type="button">I give up</button><button class="primary show" id="showBtn">Check</button></div>`;
  } else { // result, graded by the app
    const g = autoGrade(), [gName, gWhy] = GRADES[g];
    const previews = [0, 1, 2, 3].map(x => short(nextState(s, x, elapsedDays(s)).interval));
    const others = (c.alts || []).length ? `<div class="muted alts">Also accepted: ${c.alts.map(esc).join(", ")}</div>` : "";
    body = `${front(c, true)}
      <div class="back">
        <div class="verdict g${g}">${gWhy} · suggested: <b>${gName}</b></div>
        ${typed.trim() && !gaveUp ? `<div class="yours"><span class="label">You typed</span> ${esc(typed)}</div>` : ""}
        <div class="en-ans">${typed.trim() && !gaveUp ? diff(typed, c.en) : esc(c.en)}</div>
        ${others}
        ${c.ex ? `<div class="ex">“${esc(c.ex)}”</div>` : ""}${c.trans ? `<div class="muted trans-back">${esc(c.trans)}</div>` : ""}
        <button class="small listen" id="listen" type="button">Listen</button>
        ${tools(c)}
      </div>`;
    actions = `<div class="grades">${GRADES.map(([n], x) => `<button class="g${x}${x === g ? " suggest" : ""}" data-g="${x}">${n}<small>${practice ? "" : gapLabel(x, nextState(s, x, elapsedDays(s)).interval)}</small></button>`).join("")}</div>`;
  }

  v.innerHTML = notes.map(n => `<div class="notice" role="status">${n}</div>`).join("") +
    `<article class="card ${flipped ? "flip" : ""}" aria-live="polite">
      <div class="meta"><span class="tag">${label}</span><span class="state">${esc(c.level)} · ${status}</span></div>
      ${body}
    </article>${actions}`;

  const L = $("#listen"); if (L) L.onclick = () => speak(c.kind ? c.ex : c.en);
  const F = $("#flag"); if (F) F.onclick = () => { S.flags[c.id] ? delete S.flags[c.id] : (S.flags[c.id] = Date.now()); save(); F.textContent = S.flags[c.id] ? "Flagged ✓" : "Flag as doubtful"; };
  if (!say) {
    if (flipped) v.querySelectorAll("[data-g]").forEach(b => b.onclick = () => grade(+b.dataset.g));
    else $("#showBtn").onclick = () => { flipped = true; renderReview(); };
    return;
  }
  if (flipped) { v.querySelectorAll("[data-g]").forEach(b => b.onclick = () => grade(+b.dataset.g)); return; }
  const ans = $("#ans");
  const reveal = () => { typed = ans.value; verdict = check(typed, c); flipped = true; renderReview(); };
  $("#showBtn").onclick = reveal;
  $("#giveUp").onclick = () => { typed = ans.value; gaveUp = true; flipped = true; renderReview(); };
  ans.oninput = () => { typed = ans.value; };
  ans.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); reveal(); } };
  const h = $("#hintBtn"); if (h) h.onclick = () => { typed = ans.value; hint = true; renderReview(); };
  if (matchMedia("(pointer: fine)").matches) ans.focus();
}

function renderStats() {
  const v = $("#view-stats"), d = D(), cards = deckCards(d);
  const li = currentLevel(d), lv = LEVELS[li];
  const lvCards = lv ? levelCards(d, lv) : [], lvSolid = lvCards.filter(isSolid).length;
  const mastered = cards.filter(isMastered).length;
  const ladder = LEVELS.map((name, i) => {
    const n = levelCards(d, name).length;
    return `<li class="${i < li ? "past" : i === li ? "now" : ""}"><span>${i + 1}. ${name}</span><span class="muted">${n ? n + " cards" : "soon"}${i < li ? " · closed" : ""}</span></li>`;
  }).join("");
  // last 14 days
  const bars = [];
  for (let i = 13; i >= 0; i--) { const s = dayStart() - i * DAY; bars.push({ s, n: S.log.filter(l => l.t >= s && l.t < s + DAY && (l.deck || "expr") === d).length }); }
  const top = Math.ceil(Math.max(10, ...bars.map(b => b.n)) / 10) * 10;
  const W = 320, H = 110, pad = 18, bw = (W - pad) / 14;
  const svg = `<svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Cards reviewed per day over the last 14 days">
    <line x1="${pad}" x2="${W}" y1="${H}" y2="${H}" stroke="var(--line)"/>
    <text x="0" y="8">${top}</text><text x="0" y="${H}">0</text>
    ${bars.map((b, i) => { const h = b.n ? Math.max(2, (b.n / top) * (H - 4)) : 0; const x = pad + i * bw + 2;
      return `<rect x="${x}" y="${H - h}" width="${bw - 4}" height="${h}" rx="2" fill="${i === 13 ? "var(--accent)" : "var(--accent-soft)"}"/>` +
        (i % 2 === 1 ? `<text x="${x + (bw - 4) / 2}" y="${H + 13}" text-anchor="middle">${new Date(b.s).getDate()}</text>` : ""); }).join("")}
  </svg>`;
  const hard = hardest(d).slice(0, 10);
  const flagged = Object.keys(S.flags).map(byId).filter(c => c && c.deck === d);
  v.innerHTML = `
  <div class="panel kpi">
    <span class="label">${DECKS[d].name} · level ${Math.min(li + 1, LEVELS.length)} of ${LEVELS.length}</span>
    <div class="num">${lv || "All levels closed"}</div>
    ${lv ? `<div class="bar"><i style="width:${lvCards.length ? 100 * lvSolid / lvCards.length : 0}%"></i></div>
    <span class="muted" style="font-size:.85rem">${lvSolid} / ${lvCards.length} cards solid. A card is solid when its next review is ${solidDays(lv) === 7 ? "a week" : solidDays(lv) + " days"} or more away. When every card of the level is solid, the next level opens.</span>` : ""}
    <ol class="ladder">${ladder}</ol>
  </div>
  <div class="panel kpi">
    <span class="label">Mastered</span>
    <div class="num">${mastered} <span>/ ${cards.length} cards</span></div>
    <div class="bar"><i style="width:${100 * mastered / cards.length}%"></i></div>
    <span class="muted" style="font-size:.85rem">Mastered = you found it so many times that its next review is 3 weeks or more away. The first ones appear after about a month.</span>
  </div>
  <div class="panel">
    <h2>Hardest cards</h2>
    <p class="muted" style="margin:0;font-size:.85rem">Your top 10 misses (Again).</p>
    ${hard.length ? `<ol class="hardlist">${hard.map(x => `<li><span>${esc(x.dir === "p" ? x.c.fr : x.c.en)} <span class="muted">→ ${esc(x.dir === "p" ? x.c.en : x.c.fr)}</span></span><span class="muted">${x.s.lapses}×</span></li>`).join("")}</ol>
      <button class="primary" id="practiceBtn" type="button">Practice these</button>`
      : `<p class="muted" style="margin:0">Nothing yet.</p>`}
  </div>
  ${flagged.length ? `<div class="panel">
    <h2>Flagged cards</h2>
    <p class="muted" style="margin:0;font-size:.85rem">Cards you marked as doubtful. Copy the list and send it to Claude to check.</p>
    <ol class="hardlist">${flagged.map(c => `<li><span>${esc(c.fr)} <span class="muted">→ ${esc(c.en)}</span></span></li>`).join("")}</ol>
    <div class="row"><button class="small" id="copyFlags" type="button">Copy the list</button><span class="toast" id="flagToast" role="status"></span></div>
  </div>` : ""}
  <div class="panel">
    <div class="chart"><span class="label">Cards per day</span>${svg}</div>
  </div>
  <div class="panel">
    <h2>Settings</h2>
    <div class="field"><label for="npd">New cards per day</label><span class="muted help">Sets your daily goal. More = faster progress, but more reviews in the following days.</span>
      <select id="npd">${[5, 10, 15, 20, 30, 40, 50].map(n => `<option ${n === S.settings.newPerDay ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <div class="field"><label for="cap">Maximum reviews per day</label><span class="muted help">A ceiling, so a few missed days never turn into a mountain.</span>
      <select id="cap">${[40, 60, 80, 120, 200, 300].map(n => `<option ${n === S.settings.reviewCap ? "selected" : ""}>${n}</option>`).join("")}</select></div>
  </div>`;
  const pb = $("#practiceBtn"); if (pb) pb.onclick = startPractice;
  const cf = $("#copyFlags");
  if (cf) cf.onclick = () => {
    const txt = "Daily Deck – flagged cards:\n" + flagged.map(c => `- ${c.fr} → ${c.en} (${c.ex})`).join("\n");
    try { navigator.clipboard.writeText(txt).then(() => $("#flagToast").textContent = "Copied. Paste it to Claude."); } catch (e) { $("#flagToast").textContent = "Copy blocked here."; }
  };
  $("#npd").onchange = e => { S.settings.newPerDay = +e.target.value; save(); buildQueue(); next(); renderStrip(); };
  $("#cap").onchange = e => { S.settings.reviewCap = +e.target.value; save(); buildQueue(); next(); };
}

// ---------- Tabs ----------
function go(tab) {
  document.querySelectorAll("[data-view]").forEach(s => s.hidden = s.id !== "view-" + tab);
  document.querySelectorAll("[data-tab]").forEach(b => b.dataset.tab === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  renderDecks(); renderStrip();
  if (tab === "review") { if (!current && !practiceDone) { buildQueue(); next(); } renderReview(); }
  if (tab === "stats") renderStats();
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => go(b.dataset.tab));

// Keyboard: space/Enter shows the answer or goes on, 1-4 grade an Expressions card
document.addEventListener("keydown", e => {
  if ($("#view-review").hidden || /input|textarea|select/i.test(e.target.tagName)) return;
  if (e.key === " " || e.key === "Enter") { const b = $(".grades .suggest") || $("#showBtn"); if (b) { e.preventDefault(); b.click(); } }
  else if (flipped && "1234".includes(e.key) && $("[data-g]")) grade(+e.key - 1);
});

load(); buildQueue(); next(); renderReview();
