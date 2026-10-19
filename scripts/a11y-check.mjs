// Accessibility check with axe-core (Deque, MPL-2.0, a dev dependency used
// as is, never copied into the site). Opens every website page as a guest
// and every app page as a signed-in coach and a signed-in client, at a
// computer width and a phone width, and lists what axe finds.
//   python3 -m http.server 8934 &   then   npm run a11y [-- page.html ...]
// Firebase is faked in the browser (a signed-in user, empty data), so the
// real page code, CSS and header run without an account or network.
// Exits 1 when a serious or critical issue is found.
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8934";
const AXE = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const GUEST = ["home.html", "about.html", "packages.html", "coaching.html", "soccer.html", "apply.html",
    "contact.html", "install.html", "pace.html", "privacy.html", "fueling.html"];
const CLIENT = ["index.html", "train.html", "running.html", "strength.html", "cross-training.html", "nutrition.html",
    "fueling.html", "habits.html", "plan.html", "progress.html", "checkin.html", "schedule.html", "messages.html",
    "updates.html", "profile.html", "programs.html", "pace-calculator.html", "settings.html", "more.html"];
const COACH = ["coach.html", "clients.html", "client.html?uid=c1", "checkin.html?tab=review", "coach-messages.html",
    "schedule.html?tab=availability", "marathon.html", "75day.html", "planner.html", "analytics.html",
    "weekly-review.html", "planning.html", "gear.html", "index.html", "settings.html"];

const ALL_SERVICES = ["online_coaching", "running", "strength", "soccer_1on1", "soccer_group"];
const PROFILES = {
    coach: { role: "coach", isCoachApproved: true, status: "active", services: ALL_SERVICES, displayName: "Test Coach" },
    client: { role: "client", isCoachApproved: false, status: "active", services: ALL_SERVICES, displayName: "Test Client", coachUid: "coach1" }
};

// Fake Firebase SDK: the page's own modules import these instead of gstatic.
const fakeApp = `export const initializeApp = () => ({});`;
const fakeAuth = (user) => `
const user = ${JSON.stringify(user)};
const auth = { currentUser: user };
export const getAuth = () => auth;
export const setPersistence = async () => {};
export const browserLocalPersistence = {};
export class GoogleAuthProvider { setCustomParameters() {} }
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(user), 0); return () => {}; };
export const signInWithPopup = async () => ({ user });
export const signOut = async () => {};`;
const fakeFirestore = (docs) => `
const DOCS = ${JSON.stringify(docs)};
const ref = (path) => ({ path, id: path.split("/").pop() });
const join = (base, segs) => [base?.path, ...segs].filter(Boolean).join("/");
const snap = (path) => ({ id: path.split("/").pop(), ref: ref(path), exists: () => path in DOCS, data: () => DOCS[path] ? { ...DOCS[path] } : undefined, get: (k) => DOCS[path]?.[k] });
const empty = { docs: [], empty: true, size: 0, forEach() {}, docChanges: () => [] };
export const getFirestore = () => ({});
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentSingleTabManager = () => ({});
export const terminate = async () => {};
export const clearIndexedDbPersistence = async () => {};
export const doc = (base, ...segs) => ref(join(base?.path ? base : null, segs));
export const collection = (base, ...segs) => ref(join(base?.path ? base : null, segs));
export const query = (c) => c;
export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
export const getDoc = async (r) => snap(r.path);
export const getDocs = async () => empty;
export const onSnapshot = (r, next) => { const cb = typeof next === "function" ? next : next?.next; setTimeout(() => cb?.(r.path.split("/").length % 2 === 0 ? snap(r.path) : empty), 0); return () => {}; };
export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
export const addDoc = async (c) => ref(c.path + "/new");
export const serverTimestamp = () => new Date().toISOString();
export const deleteField = () => null; export const arrayUnion = (...a) => a;
export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
export const runTransaction = async (db, fn) => fn({ get: async (r) => snap(r.path), set() {}, update() {}, delete() {} });
export class Timestamp { static now() { return new Timestamp(); } toDate() { return new Date(); } toMillis() { return Date.now(); } }`;
const fakeFunctions = `export const getFunctions = () => ({});
export const httpsCallable = () => async () => { throw Object.assign(new Error("offline"), { code: "functions/unavailable" }); };`;

async function newContext(browser, width, persona) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
    await ctx.route(/^https:\/\/(apis\.google|www\.googletagmanager|cdn\.emailjs)\./, r => r.abort());
    if (persona) {
        const user = { uid: persona + "1", displayName: PROFILES[persona].displayName, email: "test@example.com", photoURL: null };
        const docs = { [`userProfiles/${user.uid}`]: { uid: user.uid, ...PROFILES[persona] } };
        const body = { app: fakeApp, auth: fakeAuth(user), firestore: fakeFirestore(docs), functions: fakeFunctions };
        await ctx.route(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-(\w+)\.js/, (r) => {
            const which = r.request().url().match(/firebase-(\w+)\.js/)[1];
            r.fulfill({ contentType: "text/javascript", body: body[which] || "export {};" });
        });
        // This device already belongs to the test account (skips the account guard's reload).
        await ctx.addInitScript((uid) => { try { localStorage.setItem("sb-account-storage-owner", uid); } catch {} }, user.uid);
    } else {
        await ctx.route(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-auth\.js/, r => r.fulfill({ contentType: "text/javascript",
            body: fakeAuth(null) }));
        await ctx.route(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|firestore|functions)\.js/, (r) => {
            const u = r.request().url();
            r.fulfill({ contentType: "text/javascript", body: u.includes("-app") ? fakeApp : u.includes("functions") ? fakeFunctions : fakeFirestore({}) });
        });
    }
    return ctx;
}

async function check(ctx, path) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${BASE}/${path}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(700);
    const landed = page.url().replace(BASE + "/", "");
    await page.addScriptTag({ content: AXE });
    const violations = await page.evaluate(async (tags) => {
        // The round account button shows initials ("TC") and is named "Account: Test"; the
        // initials are decoration, so axe skips that one button.
        const r = await window.axe.run({ exclude: [[".account-btn"]] }, { runOnly: { type: "tag", values: tags } });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help,
            nodes: v.nodes.map(n => ({ target: n.target.join(" "), why: (n.any[0] || n.all[0] || n.none[0] || {}).message || "" })) }));
    }, TAGS);
    await page.close();
    return { landed, violations, errors };
}

const only = process.argv.slice(2);
const pick = (list) => only.length ? list.filter(p => only.includes(p.split("?")[0])) : list;
const runs = [["guest", pick(GUEST)], ["client", pick(CLIENT)], ["coach", pick(COACH)]];
const browser = await chromium.launch();
let serious = 0, total = 0;
for (const width of [1280, 390]) {
    for (const [persona, pages] of runs) {
        if (!pages.length) continue;
        const ctx = await newContext(browser, width, persona === "guest" ? null : persona);
        for (const path of pages) {
            const { landed, violations, errors } = await check(ctx, path);
            const moved = landed.split("#")[0] !== path ? `  (landed on ${landed})` : "";
            if (!violations.length && !moved) continue;
            console.log(`\n${persona} ${width}px ${path}${moved}`);
            for (const v of violations) {
                total++;
                if (v.impact === "serious" || v.impact === "critical") serious++;
                console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
                for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target}  ${n.why.slice(0, 120)}`);
            }
            if (errors.length && process.env.SHOW_ERRORS) console.log("  page errors:", errors.slice(0, 3).join(" | "));
        }
        await ctx.close();
    }
}
await browser.close();
console.log(`\naxe: ${total} issue types found, ${serious} serious or critical.`);
process.exit(serious ? 1 : 0);
