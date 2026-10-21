// Soccer booking lab: three looks for booking + homework, with 34 weekly open times.
// Mock-up only. Nothing here talks to Firebase.

const q = new URLSearchParams(location.search);
const OPT = q.get("opt") || "a";
const SHEET = q.get("sheet") === "1";
const PICK = q.get("pick") === "1";
const TODAY = new Date(2026, 9, 21); // Wed Oct 21 2026
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---- made-up data: 34 weekly times (same shape as availability slots) ----
const S = (d, h, type = "1on1", label = "", cap = 1) => ({ d, h, type, label, cap });
const SLOTS = [
  S(1, 8), S(1, 16), S(1, 17), S(1, 18), S(1, 19),
  S(2, 16), S(2, 17), S(2, 18, "group", "U12 small group", 8), S(2, 19),
  S(3, 7), S(3, 16), S(3, 17), S(3, 18), S(3, 19),
  S(4, 16), S(4, 17), S(4, 18, "group", "U14 small group", 8), S(4, 19),
  S(5, 7), S(5, 16), S(5, 17), S(5, 18),
  S(6, 8), S(6, 9), S(6, 9, "group", "Finishing", 10), S(6, 10), S(6, 11), S(6, 12),
  S(0, 9), S(0, 10), S(0, 11), S(0, 13), S(0, 14), S(0, 15, "group", "Keepers", 6)
];
// Which dates are full, and how many are already in a group (bookedCounts).
const iso = d => d.toLocaleDateString("en-CA");
const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const seed = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 100; };
const MY = { d: 4, h: 17 }; // the client's usual: Thursdays 5 PM (booked this week)
function occurrences(days = 14) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = add(TODAY, i);
    for (const s of SLOTS.filter(s => s.d === date.getDay())) {
      if (i === 0 && s.h <= 15) continue; // already past today
      const key = `${iso(date)}-${s.h}-${s.type}`;
      const r = seed(key);
      const mine = i < 7 && s.d === MY.d && s.h === MY.h && s.type === "1on1";
      const taken = s.cap > 1 ? Math.min(s.cap, 2 + (r % (s.cap - 1))) : (r < 38 ? 1 : 0);
      out.push({ ...s, date, key, mine, left: s.cap - taken, full: !mine && taken >= s.cap });
    }
  }
  return out;
}
const OCC = occurrences(14);
const OPEN = OCC.filter(o => !o.full && !o.mine);

const HOMEWORK = [
  { title: "Wall passes, weak foot", skill: "Passing", done: 2, target: 3, clip: "0:40–2:10", due: add(TODAY, 1) },
  { title: "Cone dribble: inside, outside", skill: "Dribbling", done: 1, target: 3, clip: "1:05–3:00", due: add(TODAY, 1) },
  { title: "Juggling, best in a row", skill: "Touch", done: 34, target: 0, goal: 50, clip: "", due: add(TODAY, 8) }
];
const NEXT = { date: add(TODAY, 1), h: 17, type: "1on1", where: "Lakeside Park, field 3", focus: "First touch under pressure" };
const LAST = { date: add(TODAY, -6), headline: "Weak-foot passing", line: "Cleaner contact on the left. Keep the ankle locked." };

// ---- formatting ----
const t = h => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
const tShort = h => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
const dShort = d => `${DAYS[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
const rel = d => { const n = Math.round((d - TODAY) / 864e5); return n === 0 ? "Today" : n === 1 ? "Tomorrow" : dShort(d); };
const part = h => h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
const typeName = o => o.type === "group" ? o.label : "1-on-1";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- shared pieces ----
const ICON = {
  ball: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7.5l4 2.9-1.5 4.7h-5L8 10.4z"/><path d="M12 3v4.5M16 10.4l4.3-1.4M14.5 15.1l2.7 3.7M9.5 15.1l-2.7 3.7M8 10.4L3.7 9"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>`,
  habit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 12.5l4.5 4.5L19 7.5"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
  chev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>`,
  repeat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a7 7 0 0 1 12-5l3 3M20 12a7 7 0 0 1-12 5l-3-3M19 4v6h-6M5 20v-6h6"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M7 12h10M10 18h4"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>`
};
const ic = n => `<i class="ic">${ICON[n]}</i>`;

function topbar(title) {
  return `<header class="lab-top"><span class="lab-brand">Southbound</span><span class="lab-top-title"></span><span class="lab-ava">SK</span></header>`;
}
function dock(tabs, on) {
  return `<nav class="lab-dock">${tabs.map(([n, label]) => `<a class="${label === on ? "on" : ""}">${ic(n)}<span>${label}</span></a>`).join("")}</nav>`;
}
const DOCK_NOW = [["home", "Today"], ["cal", "Sessions"], ["target", "Homework"], ["habit", "Habits"], ["more", "More"]];
const DOCK_NEW = [["home", "Today"], ["ball", "Soccer"], ["habit", "Habits"], ["more", "More"]];

function hwRing(h, size = 44) {
  const pct = h.target ? h.done / h.target : h.done / h.goal;
  const C = 2 * Math.PI * 18;
  return `<span class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="rbg"/><circle cx="22" cy="22" r="18" class="rfg" stroke-dasharray="${(C * Math.min(1, pct)).toFixed(1)} ${C.toFixed(1)}"/></svg><b>${h.target ? `${h.done}/${h.target}` : h.done}</b></span>`;
}
function hwThumb(i) {
  return `<span class="thumb t${i}"><span class="pl">${ic("play")}</span></span>`;
}
function hwRows(list, opts = {}) {
  return list.map((h, i) => `<button class="hwrow">${opts.thumb ? hwThumb(i) : hwRing(h)}<span class="hwrow-main"><b>${esc(h.title)}</b><span>${h.target ? `${h.done} of ${h.target} this week` : `Best ${h.done} · goal ${h.goal}`}${opts.due ? ` · due ${rel(h.due).toLowerCase()}` : ""}</span></span>${opts.thumb ? hwRing(h, 38) : `<span class="chev">${ic("chev")}</span>`}</button>`).join("");
}

// ======================================================================
// NOW: today's Sessions page with 34 times, one card each
// ======================================================================
function viewNow() {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const cards = order.flatMap(d => SLOTS.filter(s => s.d === d)).map(s => {
    const next = OPEN.find(o => o.d === s.d && o.h === s.h && o.type === s.type);
    return `<div class="now-card"><div class="now-day">${DAYS[s.d]}</div><div class="now-info"><b>${t(s.h)} – ${t(s.h + 1)}</b><span><em>Soccer</em>${s.label ? ` ${esc(s.label)}` : ""} · ${s.cap > 1 ? `${s.cap} spots` : "1:1"}</span></div><div class="now-act"><small>${next ? `Next open ${MON[next.date.getMonth()]} ${next.date.getDate()}` : "Booked"}</small>${next ? `<span class="btn sm">Request</span>` : ""}</div></div>`;
  }).join("");
  return `${topbar("Sessions")}<main class="pg now">
    <h1 class="hero-h">Sessions</h1><p class="sub">What's booked with your coach, and asking for another session.</p>
    <h2 class="sec">Coming up</h2><div class="now-card"><div class="now-day">Thu</div><div class="now-info"><b>5:00 PM – 6:00 PM</b><span>Booked</span></div></div>
    <h2 class="sec">Book a session</h2><p class="sub">Open times with Coach Eddie. Tap Request to ask for one.</p>
    ${cards}
  </main>${dock(DOCK_NOW, "Sessions")}`;
}

// ======================================================================
// A · DAY STRIP: one Soccer tab. Next session + its homework on top,
// then a two-week date strip; only one day's times show at a time.
// ======================================================================
function nextCard(withHw = true) {
  const due = HOMEWORK.filter(h => h.target);
  const left = due.reduce((n, h) => n + (h.target - h.done), 0);
  return `<section class="next">
    <div class="next-top"><span class="kick tan">Next session · ${rel(NEXT.date)}</span><span class="chip-sage">Booked</span></div>
    <div class="next-when"><b>${t(NEXT.h)}</b><span>${dShort(NEXT.date)} · 1-on-1 with Coach Eddie</span></div>
    <div class="next-meta">${ic("pin")}<span>${NEXT.where}</span></div>
    <div class="next-focus"><span class="kick">Focus</span>${NEXT.focus}</div>
    ${withHw ? `<div class="next-hw"><div class="next-hw-head"><span class="kick">Before this session</span><span class="kick tan">${left} practice${left === 1 ? "" : "s"} left</span></div>
      ${due.map(h => `<div class="bar-row"><span>${esc(h.title)}</span><span class="bar"><i style="width:${h.done / h.target * 100}%"></i></span><b>${h.done}/${h.target}</b></div>`).join("")}
      <span class="btn wide">${ic("play")} Practice now</span></div>` : ""}
  </section>`;
}
function dayStrip(sel) {
  return `<div class="strip">${Array.from({ length: 14 }, (_, i) => {
    const d = add(TODAY, i); const k = iso(d);
    const open = OPEN.filter(o => iso(o.date) === k).length;
    const mine = OCC.some(o => iso(o.date) === k && o.mine);
    return `<button class="day${i === sel ? " on" : ""}${!open && !mine ? " none" : ""}"><span>${i === 0 ? "Today" : DAYS[d.getDay()]}</span><b>${d.getDate()}</b><small>${mine ? "Yours" : open ? `${open} open` : "Full"}</small>${mine ? `<i class="dot"></i>` : ""}</button>`;
  }).join("")}</div>`;
}
function timeGrid(dayIndex, picked) {
  const k = iso(add(TODAY, dayIndex));
  const list = OCC.filter(o => iso(o.date) === k);
  const groups = ["Morning", "Afternoon", "Evening"].map(p => [p, list.filter(o => part(o.h) === p)]).filter(([, l]) => l.length);
  return groups.map(([p, l]) => `<div class="tg"><span class="kick">${p}</span><div class="tg-grid">${l.map(o => `<button class="slot${o.full ? " full" : ""}${o.type === "group" ? " grp" : ""}${picked && o.key === picked.key ? " on" : ""}"${o.full ? " disabled" : ""}><b>${tShort(o.h).replace(/[ap]$/, "")}:00 <small>${o.h < 12 ? "AM" : "PM"}</small></b><span>${o.full ? "Full" : o.type === "group" ? `${esc(o.label.replace(" small group", ""))} · ${o.left} left` : "1-on-1"}</span></button>`).join("")}</div></div>`).join("");
}
function viewA() {
  const sel = 3; // Sat Oct 24
  const k = iso(add(TODAY, sel));
  const picked = PICK ? OPEN.find(o => iso(o.date) === k && o.h === 10) : null;
  const book = `<section class="book">
      <div class="sec-row"><h2 class="sec">Book another</h2><span class="kick">${OPEN.length} open · next 2 weeks</span></div>
      <div class="seg"><button class="on">All</button><button>1-on-1</button><button>Groups</button></div>
      ${dayStrip(sel)}
      <div class="day-title">${LONG[add(TODAY, sel).getDay()]}, ${MON[add(TODAY, sel).getMonth()]} ${add(TODAY, sel).getDate()}</div>
      ${timeGrid(sel, picked)}
    </section>`;
  const hw = `<section><div class="sec-row"><h2 class="sec">Homework</h2><span class="kick">3 active</span></div><div class="hwlist">${hwRows(HOMEWORK, { thumb: true })}</div></section>`;
  const last = `<section class="last"><span class="kick">Last session · ${dShort(LAST.date)}</span><b>${LAST.headline}</b><p>“${LAST.line}”</p><span class="link">See the report ${ic("chev")}</span></section>`;
  const bar = picked ? `<div class="pickbar"><div><b>${dShort(picked.date)} · ${t(picked.h)}</b><span>1-on-1 with Coach Eddie</span></div><label class="rep">${ic("repeat")} Weekly</label><span class="btn">Request</span></div>` : "";
  return `${topbar("Soccer")}<main class="pg optA">
    <h1 class="hero-h">Soccer</h1>
    <div class="cols"><div class="col-main">${nextCard()}${book}</div><div class="col-side">${hw}${last}</div></div>
  </main>${bar}${dock(DOCK_NEW, "Soccer")}`;
}

// ======================================================================
// B · WEEK BOARD: the soccer week as one timeline (your session, homework
// days, open times folded per day). A day × time-of-day board finds times.
// ======================================================================
function board(weekStart) {
  const days = Array.from({ length: 7 }, (_, i) => add(weekStart, i));
  const rows = ["Morning", "Afternoon", "Evening"];
  return `<div class="board"><span></span>${days.map(d => `<span class="bh${iso(d) === iso(TODAY) ? " today" : ""}">${DAYS[d.getDay()]}<b>${d.getDate()}</b></span>`).join("")}
    ${rows.map(r => `<span class="br">${r.slice(0, 3)}</span>${days.map(d => {
      const l = OCC.filter(o => iso(o.date) === iso(d) && part(o.h) === r);
      const open = l.filter(o => !o.full && !o.mine).length;
      const mine = l.some(o => o.mine);
      const past = d < TODAY;
      return `<button class="bc${mine ? " mine" : open >= 3 ? " lots" : open ? " some" : l.length ? " full" : " none"}${past ? " past" : ""}">${mine ? ic("check") : open ? open : l.length ? "–" : ""}</button>`;
    }).join("")}`).join("")}
  </div><div class="board-key"><span><i class="k lots"></i>3+ open</span><span><i class="k some"></i>1–2 open</span><span><i class="k mine"></i>Yours</span><span><i class="k full"></i>Full</span></div>`;
}
function timeline() {
  const items = [];
  for (let i = 0; i < 7; i++) {
    const d = add(TODAY, i);
    const k = iso(d);
    const open = OPEN.filter(o => iso(o.date) === k);
    const mine = OCC.find(o => iso(o.date) === k && o.mine);
    const rows = [];
    if (i === 0) rows.push(`<div class="tl-item hw">${ic("target")}<div><b>Practice: Wall passes</b><span>2 of 3 this week · 6 min</span></div><span class="btn sm ghost">Start</span></div>`);
    if (mine) rows.push(`<div class="tl-item yours"><div class="tl-time">${t(mine.h)}</div><div><b>Your 1-on-1 with Coach Eddie</b><span>${NEXT.where} · Focus: ${NEXT.focus}</span><span class="tl-hw">${ic("check")} Homework before this: 3 of 6 practices</span></div></div>`);
    if (i === 2) rows.push(`<div class="tl-item report">${ic("ball")}<div><b>Session report is in</b><span>First touch · 2 skills moved up</span></div><span class="chev">${ic("chev")}</span></div>`);
    if (open.length) rows.push(`<button class="tl-open"><span>${open.length} open time${open.length > 1 ? "s" : ""}</span><span class="tl-open-times">${open.slice(0, 3).map(o => `<em>${tShort(o.h)}</em>`).join("")}${open.length > 3 ? `<em>+${open.length - 3}</em>` : ""}</span>${ic("chev")}</button>`);
    if (!rows.length) continue;
    items.push(`<div class="tl-day"><div class="tl-date"><span>${i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAYS[d.getDay()]}</span><b>${d.getDate()}</b></div><div class="tl-rows">${rows.join("")}</div></div>`);
  }
  return items.join("");
}
function sheetB() {
  const d = add(TODAY, 6);
  const l = OCC.filter(o => iso(o.date) === iso(d) && part(o.h) === "Evening");
  return `<div class="scrim"></div><div class="sheet"><span class="grab"></span>
    <div class="sheet-head"><div><span class="kick tan">Tuesday evening</span><h3>${dShort(d)}</h3></div><span class="x">${ic("x")}</span></div>
    ${l.map((o, i) => `<button class="srow${o.full ? " full" : ""}${i === 1 ? " on" : ""}"><b>${t(o.h)}</b><span>${o.full ? "Full" : o.type === "group" ? `${esc(o.label)} · ${o.left} of ${o.cap} spots left` : "1-on-1 · 60 min"}</span>${o.full ? "" : `<i class="radio"></i>`}</button>`).join("")}
    <label class="rep wide">${ic("repeat")} Make it every Tuesday <i class="tog"></i></label>
    <span class="btn wide">Request Tue 6:00 PM</span><p class="fine">Coach Eddie confirms it. You'll get an email.</p></div>`;
}
function viewB() {
  const ws = add(TODAY, -3); // Sun Oct 18 -> show Mon..Sun
  const wk = add(ws, 1);
  return `${topbar("Soccer")}<main class="pg optB">
    <div class="b-hero"><h1 class="hero-h">Your soccer week</h1><div class="b-stats"><span><b>1</b>session</span><span><b>3/6</b>homework</span><span><b>${OPEN.filter(o => o.date < add(wk, 7)).length}</b>open times</span></div></div>
    <div class="cols"><div class="col-main"><div class="sec-row"><h2 class="sec">This week</h2><span class="kick">Oct 19 – 25</span></div><div class="tl">${timeline()}</div></div>
    <div class="col-side"><section class="find"><div class="sec-row"><h2 class="sec">Find a time</h2><span class="wk">${ic("back")}<b>Oct 26 – Nov 1</b>${ic("chev")}</span></div>${board(add(TODAY, 5))}<p class="fine">Tap a box to see its times.</p></section>
    <section><div class="sec-row"><h2 class="sec">Homework</h2><span class="kick">3 active</span></div><div class="hwlist">${hwRows(HOMEWORK, { due: true })}</div></section></div></div>
  </main>${SHEET ? sheetB() : ""}${dock(DOCK_NEW, "Soccer")}`;
}

// ======================================================================
// C · BOOK AGAIN: most bookings are "my usual time". One tap for that,
// three soonest picks, and a searchable sheet for everything else.
// Homework hangs off each booked session.
// ======================================================================
function viewC() {
  const usual = OPEN.find(o => o.d === MY.d && o.h === MY.h) || OPEN[0];
  const soonest = OPEN.filter(o => o.type === "1on1").slice(0, 3);
  const grp = OPEN.find(o => o.type === "group");
  const sessions = `<section><div class="sec-row"><h2 class="sec">Coming up</h2><span class="kick">2 booked</span></div>
    <div class="up"><div class="up-date"><span>Thu</span><b>${NEXT.date.getDate()}</b></div><div class="up-main"><span class="kick tan">Tomorrow · ${t(NEXT.h)}</span><b>1-on-1 · ${NEXT.focus}</b><span class="mut">${ic("pin")} ${NEXT.where}</span>
      <div class="up-hw"><span class="kick">Do before this session</span>${HOMEWORK.filter(h => h.target).map((h, i) => `<div class="up-hw-row">${hwThumb(i)}<span><b>${esc(h.title)}</b><small>${h.done} of ${h.target}</small></span><span class="ticks">${Array.from({ length: h.target }, (_, k) => `<i class="${k < h.done ? "on" : ""}">${k < h.done ? ICON.check : ""}</i>`).join("")}</span></div>`).join("")}</div></div></div>
    <div class="up small"><div class="up-date"><span>Sat</span><b>24</b></div><div class="up-main"><span class="kick">Sat Oct 24 · 9:00 AM</span><b>Finishing group · waiting on Coach Eddie</b><span class="mut">Homework for this one comes after tomorrow's session.</span></div></div></section>`;
  const book = `<section class="bookc"><div class="sec-row"><h2 class="sec">Book</h2><span class="kick">${OPEN.length} open</span></div>
    <button class="usual"><span class="usual-ic">${ic("repeat")}</span><span><span class="kick tan">Your usual</span><b>Thursdays · ${t(usual.h)}</b><small>Next open ${dShort(usual.date)}. You've booked it 6 times.</small></span><span class="btn sm">Book</span></button>
    <div class="kick" style="margin:16px 2px 8px">Soonest open</div>
    <div class="soon">${soonest.map(o => `<button class="soon-c"><span>${rel(o.date)}</span><b>${t(o.h)}</b><small>1-on-1</small></button>`).join("")}</div>
    ${grp ? `<button class="grp-row"><span class="kick">Group</span><b>${esc(grp.label)}</b><span>${dShort(grp.date)} · ${t(grp.h)} · ${grp.left} spots left</span>${ic("chev")}</button>` : ""}
    <button class="all">${ic("cal")} See all ${OPEN.length} open times ${ic("chev")}</button></section>`;
  const hw = `<section><div class="sec-row"><h2 class="sec">Ongoing</h2></div><div class="hwlist">${hwRows(HOMEWORK.filter(h => !h.target), { thumb: true })}</div></section>`;
  return `${topbar("Soccer")}<main class="pg optC">
    <h1 class="hero-h">Soccer</h1><p class="sub">Book with Coach Eddie and do your homework in one place.</p>
    <div class="cols"><div class="col-main">${sessions}${hw}</div><div class="col-side">${book}</div></div>
  </main>${SHEET ? sheetC() : ""}${dock(DOCK_NEW, "Soccer")}`;
}
function sheetC() {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = add(TODAY, i);
    const l = OPEN.filter(o => iso(o.date) === iso(d) && part(o.h) === "Evening" && o.type === "1on1" && d.getDay() >= 1 && d.getDay() <= 5);
    if (l.length) days.push([d, l]);
  }
  return `<div class="scrim"></div><div class="sheet tall"><span class="grab"></span>
    <div class="sheet-head"><div><span class="kick tan">${OPEN.length} open · ${days.reduce((n, [, l]) => n + l.length, 0)} match</span><h3>All open times</h3></div><span class="x">${ic("x")}</span></div>
    <div class="fchips"><span class="kick">When</span><button>Morning</button><button>Afternoon</button><button class="on">Evening</button></div>
    <div class="fchips"><span class="kick">Days</span>${["M", "T", "W", "T", "F", "S", "S"].map((x, i) => `<button class="sq${i < 5 ? " on" : ""}">${x}</button>`).join("")}</div>
    <div class="fchips"><span class="kick">Type</span><button class="on">1-on-1</button><button>Groups</button></div>
    <div class="sheet-list">${days.map(([d, l]) => `<div class="sl-day"><span class="sl-h">${rel(d)}<small>${l.length}</small></span><div class="sl-chips">${l.map(o => `<button class="pill${o.type === "group" ? " grp" : ""}">${t(o.h)}${o.type === "group" ? `<small>${o.left} left</small>` : ""}</button>`).join("")}</div></div>`).join("")}</div>
  </div>`;
}

const VIEWS = { now: viewNow, a: viewA, b: viewB, c: viewC };
document.getElementById("app").innerHTML = (VIEWS[OPT] || viewA)();
document.body.classList.add(`opt-${OPT}`);
if (SHEET) document.body.classList.add("has-sheet");
