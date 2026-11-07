// Southbound Playbook hub: the "Continue" card for a practice you started (pure; tests/playbookContinue.test.mjs).
import { parsePractice, planTotal } from "./practiceModel.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateText(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return "";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? "" : `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// raw: the saved current practice (text or object). null when there is nothing worth continuing.
export function continueCard(raw) {
    let obj = raw;
    if (typeof raw === "string") { try { obj = JSON.parse(raw); } catch { return null; } }
    const pr = parsePractice(obj);
    if (!pr || !pr.items.length) return null;
    const n = pr.items.length;
    const parts = [`${planTotal(pr.items)} min`, `${n} drill${n === 1 ? "" : "s"}`];
    const when = dateText(pr.date);
    if (when) parts.push(when);
    return { title: pr.title, meta: parts.join(" · "), href: "playbook-practice.html" };
}
