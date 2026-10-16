/* ==========================================
   Southbound — the Fueling page's drafts and athlete profile

   Glue between the calculator (js/fueling.js, which hands over an
   adapter: captureState / applyState / resetPage / ...) and storage:

   - Athlete profile ("fueling-profile", js/fuelProfile.js): filled into
     every new plan; the athlete's own answers on the calculator are saved
     to it as they change them (an empty box never wipes one). The
     Athlete Profile tab edits, clears and resets it.
   - Drafts ("fueling-draft-<id>", js/fuelDrafts.js): the page is saved
     as a draft a moment after each change the person makes, once it's
     worth keeping (a workout, products, a name). Reopening the page on
     this device picks the open draft back up; another device shows
     "Continue draft". Saving the plan retires the draft.
   - Status: one quiet line under the toolbar ("Saving…", "Saved ·
     synced", "Offline — saved on this phone"). "Synced" only after the
     account says so.

   Both live in the cloud-synced "fueling-" keys, so cloud sync carries
   them per account; js/syncMerge.js keeps both sides when the same
   draft or the profile changed on two devices. This device remembers
   which draft is open in "sb-fuel-active-draft" (device-only).
========================================== */

import {
    PROFILE_KEY, PROFILE_FIELDS, readProfile, setProfileFields, clearProfileField, profileValue, fieldStatus,
    sessionFromProfile, validateField, STATUS_WORDS, weightIn, weightFromDisplay, ASSUMED, FUEL_PREFERENCES
} from "./fuelProfile.js";
import { profileKnowsEssentials, detailsSummary, detailsBarText, startsFolded, tuneSummaries } from "./fuelDetails.js";
import {
    DRAFT_PREFIX, draftKey, newDraftId, createDraft, updateDraft, renameDraft, duplicateDraft, deletedMarker,
    parseDraft, listDrafts, draftSummary, draftTitle, STATUS_LABELS, agoText, isMeaningful, sameState
} from "./fuelDrafts.js";
import { icon } from "./icons.js";
import { toast, sbConfirm, sbPrompt } from "./ui.js";
import { adoptGuestFueling, stashFor, STASH_KEY, FUEL_PREFIX } from "./guestFuel.js";

// A guest (signed out) on the calculator, which is open to everyone (js/loadHeader.js GUEST_PAGES):
// their work stays in this browser, so the save line says so instead of "syncing".
const isGuest = () => document.documentElement.classList.contains("sb-guest");

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ACTIVE_KEY = "sb-fuel-active-draft";
const DEVICE_KEY = "sb-device-id";
const BANNER_HIDDEN_KEY = "sb-fuel-banner-hidden";
const DETAILS_KEY = "sb-fuel-details";   // "open" | "folded": what this device last chose (not synced)
const SAVE_DELAY = 600;
const PUSH_DELAY = 1500;

// Calculator inputs whose changes go to the profile (input id = profile key).
const AUTO_PROFILE = ["bodyWeight", "currentCarbIntake", "tolerance", "stomachSensitivity", "sweatRate", "sweatRateMeasured",
    "sweatSodium", "sweatSodiumMeasured", "typicalSodiumIntake", "caffeineWanted", "firstGelMin"];
// Where the calculator shows each answer's status (Measured / Your profile / Estimate).
const TAGGED = ["bodyWeight", "currentCarbIntake", "tolerance", "stomachSensitivity", "sweatRate", "sweatRateMeasured",
    "sweatSodium", "sweatSodiumMeasured", "typicalSodiumIntake", "temperature", "humidity"];

let A = null;               // the calculator's adapter
let active = null;          // the open draft, or null
let baseline = null;        // the page as loaded / restored: no draft until it changes
let linkQuery = "";
let saveTimer = null;
let pushTimer = null;
let profileTimer = null;
let pendingProfileKeys = new Set();
let statusKind = "";        // what the status line is about ("Draft" / "Profile")
let waitingForSync = false;

/* ---------- storage ---------- */

const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
function write(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (error) {
        console.warn("Fueling: couldn't save", key, error);
        setStatus("error", "Couldn't save on this phone (storage is full). Delete an old draft or plan and try again.");
        return false;
    }
}

function deviceId() {
    let id = read(DEVICE_KEY);
    if (!id) { id = `dev${Math.random().toString(36).slice(2, 10)}`; write(DEVICE_KEY, id); }
    return id;
}

export function currentProfile() {
    return readProfile(read(PROFILE_KEY));
}

function allDrafts() {
    const entries = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(DRAFT_PREFIX)) entries[k] = localStorage.getItem(k);
        }
    } catch { /* storage blocked */ }
    return listDrafts(entries);
}
const storedDraft = id => parseDraft(read(draftKey(id)));

/* ---------- status line ---------- */

function setStatus(state, text) {
    const el = $("fuelSaveStatus");
    if (!el) return;
    el.dataset.state = state;
    el.textContent = text;
}
const clock = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function setGuestStatus(kind) {
    const el = $("fuelSaveStatus");
    if (!el) return;
    el.dataset.state = "guest";
    el.innerHTML = `${kind} kept on this device. <button type="button" class="fuel-signin-link" data-fuel-signin>Sign in</button> to keep it everywhere.`;
}

function schedulePush(kind) {
    statusKind = kind;
    clearTimeout(pushTimer);
    if (isGuest()) { setGuestStatus(kind); return; }
    if (navigator.onLine === false) {
        setStatus("offline", `Offline — ${kind.toLowerCase()} saved on this phone. It syncs when you're back online.`);
        waitingForSync = true;
        return;
    }
    setStatus("saving", `${kind} saved on this phone · syncing…`);
    pushTimer = setTimeout(async () => {
        let ok = false;
        try {
            const { pushToCloud } = await import("./cloudSync.js");
            ok = await pushToCloud();
        } catch { ok = false; }
        if (ok) { waitingForSync = false; setStatus("synced", `${kind} saved · synced at ${clock()}`); }
        else if (isGuest()) { waitingForSync = false; setGuestStatus(kind); }
        else if (navigator.onLine === false) { waitingForSync = true; setStatus("offline", `Offline — ${kind.toLowerCase()} saved on this phone. It syncs when you're back online.`); }
        else { waitingForSync = true; setStatus("error", `${kind} saved on this phone. Couldn't reach your account yet; it'll try again.`); }
    }, PUSH_DELAY);
}

/* ---------- profile ---------- */

/**
 * Saves profile answers. values: { key: value in lb / oz }. Blank values
 * are skipped unless allowBlank (then a blank clears that answer).
 */
export function updateProfile(values, { allowBlank = false, quiet = false } = {}) {
    let profile = currentProfile();
    const now = Date.now();
    const blanks = allowBlank ? Object.entries(values).filter(([, v]) => v === "") : [];
    for (const [key] of blanks) profile = clearProfileField(profile, key, now);
    const rest = Object.fromEntries(Object.entries(values).filter(([k]) => !blanks.some(([b]) => b === k)));
    const r = setProfileFields(profile, rest, now);
    if (r.saved.length || blanks.length) {
        if (!write(PROFILE_KEY, JSON.stringify(r.profile))) return r;
        if (!quiet) schedulePush("Profile");
        refreshTags();
        if (!$("fuelProfilePane")?.hidden) renderProfilePane();
    }
    return r;
}

function onProfileInput(key) {
    pendingProfileKeys.add(key);
    clearTimeout(profileTimer);
    profileTimer = setTimeout(flushProfile, 800);
    refreshTags();
}
function flushProfile() {
    clearTimeout(profileTimer);
    if (!pendingProfileKeys.size || !A) return;
    const page = A.athleteValuesOnPage();
    const values = {};
    const profile = currentProfile();
    for (const key of pendingProfileKeys) {
        const v = key === "fuelPreferences" ? page.fuelPreferences : page[key];
        const saved = profileValue(profile, key);
        // The same number read back in another unit (71.7 kg is 158 lb):
        // not a change, so 158 doesn't drift to 158.1.
        if (key === "bodyWeight" && saved != null && v !== "" && weightIn(saved, A.weightUnit()) === weightIn(v, A.weightUnit())) continue;
        if (key === "sweatRateMeasured" && saved != null && v !== "" && A.toFluid(saved) === A.toFluid(v)) continue;
        values[key] = v;
    }
    pendingProfileKeys = new Set();
    updateProfile(values);
}

// The status of each answer, next to its label on the calculator.
function pageValue(key) {
    const el = $(key);
    if (!el) return "";
    if (key === "bodyWeight") return el.value === "" ? "" : weightFromDisplay(el.value, A.weightUnit());
    if (key === "sweatRateMeasured") return el.value === "" ? "" : A.fromFluid(el.value);
    return el.value;
}
function tagFor(key, profile) {
    const v = pageValue(key);
    const pv = profileValue(profile, key);
    const empty = v === "" || v == null;
    if (!empty) {
        const check = validateField(key, v);
        if (!check.ok) return { cls: "is-bad", text: "Check this", title: check.problem };
    }
    // Numbers read back from kg or ml land a little off the stored lb / oz.
    const slack = key === "bodyWeight" ? 0.25 : key === "sweatRateMeasured" ? 0.05 : 0.06;
    const equal = (a, b) => (typeof b === "number" ? Math.abs(Number(a) - b) < slack : String(a) === String(b));
    if (pv == null) {
        if (empty) return { cls: "is-unset", text: "Not set", title: "Not in your profile yet. Leave it blank or add it." };
        if (key in ASSUMED && equal(v, ASSUMED[key])) return { cls: "is-estimate", text: STATUS_WORDS.estimate, title: "A starting assumption. Change it to your own number." };
        if (pendingProfileKeys.has(key)) return { cls: "is-estimate", text: "Saving…", title: "" };
        return { cls: "is-plan", text: "This plan only", title: PROFILE_FIELDS[key]?.kind === "default" ? "Used for this plan. Set your usual one in Athlete Profile." : "Used for this plan. Change it here to save it to your profile." };
    }
    if (empty) return { cls: "is-plan", text: "Not used here", title: "Your profile has a number; this plan leaves it out." };
    if (equal(v, pv)) {
        const status = fieldStatus(profile, key);
        return { cls: `is-${status}`, text: STATUS_WORDS[status], title: status === "measured" ? "A measured number from your profile." : "From your athlete profile." };
    }
    return { cls: "is-plan", text: "This plan only", title: "This plan uses its own number. Your profile is unchanged." };
}
export function profileTags() { refreshTags(); }
function refreshTags() {
    if (!A) return;
    const profile = currentProfile();
    for (const key of TAGGED) {
        const el = $(key);
        const label = el?.closest("label")?.querySelector("span");
        if (!label) continue;
        let tag = label.querySelector(".fuel-pf-tag");
        if (!tag) {
            tag = document.createElement("em");
            tag.className = "fuel-pf-tag";
            label.appendChild(tag);
        }
        const t = tagFor(key, profile);
        tag.className = `fuel-pf-tag ${t.cls}`;
        tag.textContent = t.text;
        tag.title = t.title;
    }
    if (detailsShown) paintDetailsBar();
    paintTuneRows();
}

/* ---------- your details (folded cards) ---------- */

let detailsFolded = false;
let detailsShown = false;       // the bar is only for an athlete whose profile has the basics

function selectText(id) {
    const el = $(id);
    return el?.tagName === "SELECT" ? el.value : "";
}
// What the plan is using right now (the page's own fields), in the shape js/fuelDetails.js reads.
function detailsInput() {
    const prefs = [...document.querySelectorAll("#fuelPreferences input[type=checkbox]:checked")].map(c => c.parentElement?.textContent.trim().toLowerCase()).filter(Boolean);
    return {
        weight: $("bodyWeight")?.value, weightUnit: A?.weightUnit?.(),
        currentCarbIntake: $("currentCarbIntake")?.value,
        tolerance: selectText("tolerance"), stomach: selectText("stomachSensitivity"),
        temperature: $("temperature")?.value, humidity: $("humidity")?.value,
        sweatRate: selectText("sweatRate"), sweatRateMeasured: $("sweatRateMeasured")?.value, fluidUnit: A?.fluidUnit?.(),
        sweatSodium: selectText("sweatSodium"), sweatSodiumMeasured: $("sweatSodiumMeasured")?.value,
        typicalSodiumIntake: $("typicalSodiumIntake")?.value,
        preferences: prefs, caffeine: Boolean($("caffeineWanted")?.checked)
    };
}
// The words under "Your details".
function detailsWords() { return detailsSummary(detailsInput()); }
// What the phone's review reads (js/fuelSteps.js): the same fields the Tune it rows summarise.
export function currentDetailsInput() { return detailsInput(); }
// The one line under each Tune it row (the answer-first page): what the plan is using right now.
function paintTuneRows() {
    const words = tuneSummaries(detailsInput());
    for (const [id, text] of [["fuelSumYou", words.you], ["fuelSumConditions", words.conditions], ["fuelSumSodium", words.sodium], ["fuelSumCarry", words.carry]]) {
        const el = $(id);
        if (el) el.textContent = text;
    }
}
function paintDetailsBar() {
    const bar = $("fuelDetailsBar");
    if (!bar) return;
    bar.hidden = !detailsShown;
    $("fuelInputGrid")?.classList.toggle("is-details-folded", detailsShown && detailsFolded);
    if (!detailsShown) return;
    const text = detailsBarText(detailsFolded, detailsWords());
    $("fuelDetailsSummary").textContent = text.lead;
    const button = $("fuelDetailsToggle");
    button.textContent = text.button;
    button.setAttribute("aria-expanded", String(text.expanded));
}
// Decided once when the page opens: an athlete who is mid-edit never has the cards fold away under them.
function initDetailsBar() {
    const profile = currentProfile();
    const known = profileKnowsEssentials(profile);
    let choice = null;
    try { choice = localStorage.getItem(DETAILS_KEY); } catch { /* fine */ }
    const hasProblem = TAGGED.some(key => tagFor(key, profile).cls === "is-bad");
    detailsShown = known;
    detailsFolded = startsFolded({ known, choice, hasProblem });
    paintDetailsBar();
}
function toggleDetails() {
    detailsFolded = !detailsFolded;
    try { localStorage.setItem(DETAILS_KEY, detailsFolded ? "folded" : "open"); } catch { /* fine */ }
    paintDetailsBar();
}

/* ---------- drafts ---------- */

function setActive(draft) {
    active = draft;
    try { draft ? localStorage.setItem(ACTIVE_KEY, draft.id) : localStorage.removeItem(ACTIVE_KEY); } catch { /* fine */ }
}

function markBaseline() {
    baseline = A.captureState();
}

// A user change on the calculator.
export function noteUserEdit() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(autosave, SAVE_DELAY);
}

function autosave() {
    clearTimeout(saveTimer);
    if (!A) return;
    const state = A.captureState();
    const now = Date.now();
    const device = deviceId();
    if (active) {
        const stored = storedDraft(active.id);
        // Changed on another device while open here: keep theirs, and this
        // page's work as its own draft. Nothing is dropped.
        if (stored && !stored.deleted && stored.rev !== active.rev && !sameState(stored.state, active.state)) {
            const copy = { ...createDraft({ id: newDraftId(now), state, device, now }), name: `${draftTitle(active)} (this device)`, named: true };
            copy.state = { ...state, fields: { ...state.fields, planName: copy.name } };
            if (write(draftKey(copy.id), JSON.stringify(copy))) {
                setActive(copy);
                toast(`“${draftTitle(active)}” changed on another device. Your changes are kept as their own draft.`, { type: "info", duration: 7000 });
                schedulePush("Draft");
                renderAll();
            }
            return;
        }
        const next = updateDraft(active, state, { device, now });
        if (next === active && stored && !stored.deleted) return;
        if (write(draftKey(next.id), JSON.stringify(next))) { setActive(next); schedulePush("Draft"); renderAll(); }
        return;
    }
    if (!isMeaningful(state) || (baseline && sameState(state, baseline))) return;
    const draft = createDraft({ id: newDraftId(now), state: { ...state, sourceQuery: linkQuery || undefined }, device, now });
    if (write(draftKey(draft.id), JSON.stringify(draft))) {
        setActive(draft);
        schedulePush("Draft");
        renderAll();
    }
}

function flushNow() {
    if (saveTimer) autosave();
    if (pendingProfileKeys.size) flushProfile();
}

function detach() {
    flushNow();
    setActive(null);
}

function resumeDraft(id, { scroll = true } = {}) {
    flushNow();
    const d = storedDraft(id);
    if (!d || d.deleted) { toast("That draft isn't there any more.", { type: "info" }); renderAll(); return; }
    A.applyState(d.state);
    setActive(d);
    baseline = A.captureState();
    try { sessionStorage.setItem(BANNER_HIDDEN_KEY, "1"); } catch { /* fine */ }
    refreshTags();
    renderAll();
    setStatus("synced", `Picked up “${draftTitle(d)}”, last saved ${agoText(d.updatedAt)}.`);
    if (scroll) document.querySelector(".fuel-toolbar")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function startFresh() {
    A.resetPage();
    fillFromProfile();
}

function fillFromProfile() {
    const profile = currentProfile();
    A.applyProfileValues(sessionFromProfile(profile).values);
    const recipe = profileValue(profile, "preferredRecipe");
    if (recipe) A.useRecipe(recipe, { quiet: true });
    refreshTags();
}

async function deleteDraftById(id) {
    const d = storedDraft(id);
    if (!d || d.deleted) return;
    if (!(await sbConfirm("Everything in it goes: the workout, products and drink. Saved plans aren't touched.", {
        title: `Delete “${draftTitle(d)}”?`, confirmLabel: "Delete draft", danger: true
    }))) return;
    const before = read(draftKey(id));
    const wasActive = active?.id === id;
    write(draftKey(id), JSON.stringify(deletedMarker(d)));
    if (wasActive) { setActive(null); startFresh(); markBaseline(); }
    renderAll();
    schedulePush("Draft");
    toast("Draft deleted.", {
        action: {
            label: "Undo", onClick: () => {
                const back = { ...parseDraft(before), updatedAt: Date.now() };
                write(draftKey(id), JSON.stringify(back));
                if (wasActive) resumeDraft(id, { scroll: false });
                renderAll();
                schedulePush("Draft");
            }
        }
    });
}

async function renameDraftById(id) {
    const d = storedDraft(id);
    if (!d || d.deleted) return;
    const name = await sbPrompt("", { title: "Name this draft", defaultValue: draftTitle(d), maxLength: 80, confirmLabel: "Save name" });
    if (name === null) return;
    const next = renameDraft(d, name);
    write(draftKey(id), JSON.stringify(next));
    if (active?.id === id) {
        setActive(next);
        const box = $("planName");
        if (box) box.value = next.state.fields.planName || "";
        baseline = A.captureState();
    }
    renderAll();
    schedulePush("Draft");
}

function duplicateDraftById(id) {
    flushNow();
    const d = storedDraft(id);
    if (!d || d.deleted) return;
    const copy = duplicateDraft(d, { id: newDraftId(), device: deviceId(), taken: allDrafts().map(draftTitle) });
    write(draftKey(copy.id), JSON.stringify(copy));
    renderAll();
    schedulePush("Draft");
    toast(`Copied as “${copy.name}”.`);
}

function saveDraftAsPlan(id) {
    if (active?.id !== id) resumeDraft(id, { scroll: false });
    A.savePlan();
}

/* ---------- drawing ---------- */

function renderAll() {
    renderBanner();
    renderDraftList();
    const drafts = allDrafts();
    const count = $("fuelDraftCount");
    if (count) count.textContent = drafts.length ? `(${drafts.length})` : "";
    const saved = $("fuelSavedCount");
    if (saved) saved.textContent = A?.plans()?.length ? `(${A.plans().length})` : "";
    const link = $("fuelMyPlansLink");
    if (link) {
        link.textContent = drafts.length ? `My fueling plans · ${drafts.length} draft${drafts.length === 1 ? "" : "s"}` : "My fueling plans";
        // Follows the link to the drafts when there are some.
        link.dataset.openTab = drafts.length ? "drafts" : "saved";
    }
}

function renderBanner() {
    const el = $("fuelDraftBanner");
    if (!el) return;
    let hidden = false;
    try { hidden = sessionStorage.getItem(BANNER_HIDDEN_KEY) === "1"; } catch { /* fine */ }
    const waiting = allDrafts().filter(d => d.id !== active?.id);
    if (!waiting.length || hidden) { el.hidden = true; el.innerHTML = ""; return; }
    const d = draftSummary(waiting[0]);
    el.hidden = false;
    el.innerHTML = `
        <div class="fuel-draft-banner-text">
            <span class="fuel-draft-banner-kicker">${icon("clock")} Unfinished plan</span>
            <strong id="fuelDraftBannerTitle">${esc(d.title)}</strong>
            <span>${esc(d.title !== d.detail ? `${d.detail} · ` : "")}saved ${esc(agoText(d.updatedAt))}${waiting.length > 1 ? ` · ${waiting.length - 1} more` : ""}</span>
        </div>
        <div class="fuel-draft-banner-actions">
            <button type="button" class="fuel-btn primary" data-draft-continue="${esc(d.id)}">Continue draft</button>
            ${waiting.length > 1 ? `<a class="fuel-btn secondary" href="#myFuelingPlans" data-open-tab="drafts">All drafts</a>` : ""}
            <button type="button" class="fuel-btn secondary" data-banner-hide>Not now</button>
        </div>`;
}

function renderDraftList() {
    const el = $("fuelDraftList");
    if (!el) return;
    const drafts = allDrafts();
    const head = `
        <div class="fuel-drafts-head">
            <p class="fuel-note">Unfinished plans save themselves as you work, on this phone and your account. Pick one up any time.</p>
            <button type="button" class="fuel-btn secondary" data-draft-new>${icon("plus")} New plan</button>
        </div>`;
    if (!drafts.length) {
        el.innerHTML = `${head}<p class="fuel-empty-state">No drafts. Start entering a workout above and it's kept here until you save it.</p>`;
        return;
    }
    el.innerHTML = head + `<ul class="fuel-draft-list">${drafts.map(d => {
        const s = draftSummary(d);
        const open = active?.id === d.id;
        return `
            <li class="fuel-draft${open ? " is-open" : ""}${s.status === "conflict" ? " is-conflict" : ""}">
                <div class="fuel-draft-main">
                    <strong>${esc(s.title)}</strong>
                    <span class="fuel-draft-meta">
                        <span class="fuel-draft-status is-${s.status}">${esc(STATUS_LABELS[s.status])}</span>
                        ${s.title !== s.detail ? `<span>${esc(s.detail)}</span>` : ""}
                        ${s.products ? `<span>${s.products} product${s.products === 1 ? "" : "s"}</span>` : ""}
                        <span>Saved ${esc(agoText(s.updatedAt))}</span>
                        ${open ? `<span class="fuel-draft-open">Open now</span>` : ""}
                    </span>
                </div>
                <div class="fuel-draft-actions">
                    ${open ? "" : `<button type="button" class="fuel-btn primary small" data-draft-continue="${esc(d.id)}">Continue</button>`}
                    <button type="button" class="fuel-btn secondary small" data-draft-save="${esc(d.id)}">Save as plan</button>
                    <button type="button" class="fuel-btn secondary small" data-draft-rename="${esc(d.id)}">Rename</button>
                    <button type="button" class="fuel-btn secondary small" data-draft-dup="${esc(d.id)}">Duplicate</button>
                    <button type="button" class="fuel-btn danger small" data-draft-delete="${esc(d.id)}" aria-label="Delete ${esc(s.title)}">Delete</button>
                </div>
            </li>`;
    }).join("")}</ul>`;
}

/* ---------- Athlete Profile tab ---------- */

const PROFILE_GROUPS = [
    ["About you", ["bodyWeight", "currentCarbIntake", "tolerance", "stomachSensitivity"]],
    ["Sweat and sodium", ["sweatRate", "sweatRateMeasured", "sweatSodium", "sweatSodiumMeasured", "typicalSodiumIntake"]],
    ["Defaults for new plans", ["temperature", "humidity", "firstGelMin", "caffeineWanted", "fuelPreferences"]]
];
const CHOICES = {
    tolerance: [["low", "Low — new to fueling"], ["moderate", "Moderate — some experience"], ["high", "High — well trained gut"]],
    stomachSensitivity: [["sensitive", "Sensitive"], ["normal", "Normal"], ["iron", "Iron stomach"]],
    sweatRate: [["low", "Low"], ["moderate", "Moderate"], ["high", "High"]],
    sweatSodium: [["unknown", "Not sure"], ["light", "Light"], ["average", "Average"], ["heavy", "Heavy (salty)"]]
};
const PREF_WORDS = { gels: "Gels", drinkmix: "Drink mix", chews: "Chews", bars: "Bars", homemade: "Homemade", combination: "Combination" };

function profileUnit(key) {
    if (key === "bodyWeight") return A.weightUnit();
    if (key === "sweatRateMeasured") return `${A.fluidUnit()}/hr`;
    return PROFILE_FIELDS[key].unit || "";
}
function shownValue(key, v) {
    if (v == null || v === "") return "";
    if (key === "bodyWeight") return weightIn(v, A.weightUnit());
    if (key === "sweatRateMeasured") return A.toFluid(v);
    return v;
}

function renderProfilePane() {
    const el = $("fuelProfilePane");
    if (!el || !A) return;
    const profile = currentProfile();
    const known = Object.values(profile.fields).filter(f => f?.v != null).length;
    const row = key => {
        const def = PROFILE_FIELDS[key];
        const v = profileValue(profile, key);
        const status = fieldStatus(profile, key);
        const id = `pf-${key}`;
        let input;
        if (CHOICES[key]) {
            input = `<select id="${id}" data-pf="${key}"><option value="">Not set</option>${CHOICES[key].map(([val, label]) => `<option value="${val}"${v === val ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
        } else if (key === "caffeineWanted") {
            input = `<label class="fuel-checkbox"><input type="checkbox" id="${id}" data-pf="${key}"${v ? " checked" : ""}><span>Include caffeine</span></label>`;
        } else if (key === "fuelPreferences") {
            const list = Array.isArray(v) ? v : [];
            input = `<div class="fuel-pf-prefs" role="group" aria-label="${esc(def.label)}">${FUEL_PREFERENCES.map(p => `<label class="fuel-checkbox"><input type="checkbox" data-pf-pref="${p}"${list.includes(p) ? " checked" : ""}><span>${PREF_WORDS[p]}</span></label>`).join("")}</div>`;
        } else {
            input = `<input type="number" id="${id}" data-pf="${key}" inputmode="decimal" step="any" value="${esc(shownValue(key, v))}" placeholder="${key in ASSUMED ? `assumed ${esc(shownValue(key, ASSUMED[key]))}` : "not set"}">`;
        }
        const unit = profileUnit(key);
        const canClear = v != null && key !== "caffeineWanted";
        return `
            <div class="fuel-pf-row">
                <label class="fuel-pf-label" ${CHOICES[key] || !["caffeineWanted", "fuelPreferences"].includes(key) ? `for="${id}"` : ""}>${esc(def.label)}${unit ? ` <small>(${esc(unit)})</small>` : ""}</label>
                <div class="fuel-pf-input">${input}</div>
                <span class="fuel-pf-tag is-${v == null ? "unset" : status}">${v == null ? (key in ASSUMED ? "Estimate" : "Not set") : STATUS_WORDS[status]}</span>
                ${canClear ? `<button type="button" class="fuel-pf-clear" data-pf-clear="${key}" aria-label="Clear ${esc(def.label)}">Clear</button>` : `<span></span>`}
                <p class="fuel-pf-problem" data-pf-problem="${key}" hidden></p>
            </div>`;
    };
    const lib = A.library();
    const preferred = (profileValue(profile, "preferredItems") || []).map(String);
    const usual = lib.filter(i => preferred.includes(String(i.id)));
    el.innerHTML = `
        <p class="fuel-note">Your usual answers. Every new plan starts from them, and anything you change on the calculator above is saved here too. <strong>Measured</strong> means from a sweat test; <strong>Estimate</strong> means Southbound is assuming until you add your own.</p>
        <p class="fuel-pf-count">${known ? `${known} answer${known === 1 ? "" : "s"} saved.` : "Nothing saved yet."}</p>
        ${PROFILE_GROUPS.map(([title, keys]) => `<fieldset class="fuel-pf-group"><legend>${esc(title)}</legend>${keys.map(row).join("")}</fieldset>`).join("")}
        <fieldset class="fuel-pf-group"><legend>Your usual products</legend>
            ${usual.length ? `<ul class="fuel-pf-usual">${usual.map(i => `<li>${esc(i.name)}</li>`).join("")}</ul>` : `<p class="fuel-note">Tap <strong>Usual</strong> on a product in the Fueling Library or on a saved drink recipe and it's listed first.</p>`}
        </fieldset>
        <div class="fuel-form-actions">
            <button type="button" class="fuel-btn secondary" data-pf-fill>Use my profile in this plan</button>
            <button type="button" class="fuel-btn danger" data-pf-reset>Reset profile</button>
        </div>`;
}

function onProfilePaneInput(event) {
    const t = event.target;
    const key = t.dataset.pf;
    if (t.dataset.pfPref != null) {
        const list = [...$("fuelProfilePane").querySelectorAll("[data-pf-pref]:checked")].map(x => x.dataset.pfPref);
        updateProfile({ fuelPreferences: list });
        return;
    }
    if (!key) return;
    let value = t.type === "checkbox" ? t.checked : t.value;
    if (value === "" && t.tagName === "SELECT") { updateProfile({ [key]: "" }, { allowBlank: true }); return; }
    if (value === "") return;
    if (key === "bodyWeight") value = weightFromDisplay(value, A.weightUnit());
    if (key === "sweatRateMeasured") value = A.fromFluid(value);
    const r = updateProfile({ [key]: value });
    const problem = $("fuelProfilePane").querySelector(`[data-pf-problem="${key}"]`);
    if (problem) { problem.hidden = !r.problems[key]; problem.textContent = r.problems[key] || ""; }
}

/* ---------- tabs ---------- */

function selectTab(name, { focus = false } = {}) {
    document.querySelectorAll("[data-fuel-tab]").forEach(tab => {
        const on = tab.dataset.fuelTab === name;
        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
        if (on && focus) tab.focus();
    });
    $("fuelDraftsPane").hidden = name !== "drafts";
    $("fuelSavedPane").hidden = name !== "saved";
    $("fuelProfilePane").hidden = name !== "profile";
    if (name === "profile") renderProfilePane();
    if (name === "drafts") renderDraftList();
    if (name === "saved") A.showSaved();
}

/* ---------- start ---------- */

export function initFuelingPlans(adapter, { linkQuery: query = "" } = {}) {
    A = adapter;
    linkQuery = query;
    let restored = false;
    const pointer = read(ACTIVE_KEY);
    const d = pointer ? storedDraft(pointer) : null;
    if (d && !d.deleted && (!query || d.state?.sourceQuery === query)) {
        A.applyState(d.state);
        active = d;
        restored = true;
        setStatus("synced", `Picked up where you left off: “${draftTitle(d)}”, saved ${agoText(d.updatedAt)}.`);
    } else {
        if (pointer) setActive(null);
        fillFromProfile();
    }
    // After the calculator's own start (a workout link fills in right after this).
    setTimeout(() => {
        markBaseline(); initDetailsBar(); refreshTags(); renderAll();
        // Drafts first when there are some, else the saved plans.
        selectTab(allDrafts().some(x => x.id !== active?.id) ? "drafts" : "saved");
    }, 0);
    wire();
    return { restored };
}

/* ---------- a guest's work, after they sign in (js/guestFuel.js) ---------- */

// js/auth.js set the guest's "fueling-" keys aside when they signed in (so the usual clear of a new
// account's device didn't wipe them). Asked once: Yes merges them into what the account has (nothing
// either side made is lost, the account's own settings win where there is nothing to merge); No drops them.
async function offerGuestWork() {
    if (isGuest()) return;
    let raw = null;
    try { raw = localStorage.getItem(STASH_KEY); } catch { return; }
    if (!raw) return;
    let user = null;
    try { user = await (await import("./auth.js")).waitForUser(); } catch { return; }
    if (!user) return;
    const stash = stashFor(raw, user.uid);
    if (!stash) { try { localStorage.removeItem(STASH_KEY); } catch { /* fine */ } return; }
    const yes = await sbConfirm("Before you signed in, you worked on fueling on this device. Add those answers, drafts and saved plans to your account? Anything your account already has stays.", {
        title: "Keep what you made?", confirmLabel: "Add to my account", cancelLabel: "No thanks"
    });
    try { localStorage.removeItem(STASH_KEY); } catch { /* fine */ }
    if (!yes) { toast("Left out. Your account is as it was."); return; }
    const current = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(FUEL_PREFIX)) current[key] = localStorage.getItem(key);
    }
    const { set, added, merged } = adoptGuestFueling(stash.keys, current);
    for (const [key, value] of Object.entries(set)) { try { localStorage.setItem(key, value); } catch { /* fine */ } }
    if (!added && !merged) { toast("Your account already had all of it."); return; }
    try { const { pushToCloud } = await import("./cloudSync.js"); await pushToCloud(); } catch { /* it syncs on the next change */ }
    toast("Added to your account.");
    setTimeout(() => window.location.reload(), 700);
}

let wired = false;
function wire() {
    if (wired) return;
    wired = true;
    const main = document.querySelector("main");
    const outside = t => t.closest("#myFuelingPlans, #fuelDraftBanner, #fuelPlanSheet, #libraryForm, #fuelDetailsBar, .sb-dialog, [data-fuel-signin], .fx-guest-offer");
    // Input and change events only come from the person (the calculator sets
    // values without firing them), so any of them is a real edit.
    const onEdit = event => {
        if (!A) return;
        const t = event.target;
        if (!(t instanceof Element) || outside(t)) return;
        if (AUTO_PROFILE.includes(t.id)) onProfileInput(t.id);
        else if (t.closest("#fuelPreferences")) onProfileInput("fuelPreferences");
        else if (TAGGED.includes(t.id)) refreshTags();
        if (t.closest("#fuelTunePanel")) paintTuneRows();
        noteUserEdit();
    };
    main.addEventListener("input", onEdit, true);
    main.addEventListener("change", onEdit, true);
    // Products added / removed, mode, buttons: anything tapped may change the plan.
    main.addEventListener("click", event => {
        if (!event.isTrusted || !(event.target instanceof Element)) return;
        if (event.target.closest("button, [role=button], input[type=checkbox]") && !outside(event.target)) noteUserEdit();
    });

    $("fuelDetailsToggle")?.addEventListener("click", toggleDetails);
    paintTuneRows();

    // "Sign in" on the save line and the guest offer: the header's own Google sign-in.
    document.addEventListener("click", event => {
        if (!(event.target instanceof Element) || !event.target.closest("[data-fuel-signin]")) return;
        document.getElementById("loginBtn")?.click();
    });
    // Signed in after working as a guest: offer once to add that work to the account.
    setTimeout(() => { offerGuestWork().catch(error => console.warn("Southbound: couldn't offer the guest's fueling work.", error)); }, 1200);

    // Draft and banner actions.
    document.addEventListener("click", async event => {
        const t = event.target instanceof Element ? event.target : null;
        if (!t) return;
        const b = t.closest("[data-draft-continue],[data-draft-delete],[data-draft-rename],[data-draft-dup],[data-draft-save],[data-draft-new],[data-banner-hide],[data-open-tab],[data-pf-clear],[data-pf-fill],[data-pf-reset],[data-fuel-tab]");
        if (!b) return;
        if (b.dataset.fuelTab) { selectTab(b.dataset.fuelTab); return; }
        if (b.dataset.draftContinue) { resumeDraft(b.dataset.draftContinue); return; }
        if (b.dataset.draftDelete) { deleteDraftById(b.dataset.draftDelete); return; }
        if (b.dataset.draftRename) { renameDraftById(b.dataset.draftRename); return; }
        if (b.dataset.draftDup) { duplicateDraftById(b.dataset.draftDup); return; }
        if (b.dataset.draftSave) { saveDraftAsPlan(b.dataset.draftSave); return; }
        if (b.hasAttribute("data-draft-new")) {
            detach();
            startFresh();
            markBaseline();
            renderAll();
            document.querySelector(".fuel-toolbar")?.scrollIntoView({ behavior: "auto" });
            toast("New plan. Your drafts stay in My Fueling Plans.");
            return;
        }
        if (b.hasAttribute("data-banner-hide")) {
            try { sessionStorage.setItem(BANNER_HIDDEN_KEY, "1"); } catch { /* fine */ }
            renderBanner();
            return;
        }
        if (b.dataset.openTab) { selectTab(b.dataset.openTab); return; }
        if (b.dataset.pfClear) {
            const key = b.dataset.pfClear;
            updateProfile({ [key]: "" }, { allowBlank: true });
            renderProfilePane();
            toast(`${PROFILE_FIELDS[key].label} cleared from your profile.`);
            return;
        }
        if (b.hasAttribute("data-pf-fill")) {
            fillFromProfile();
            noteUserEdit();
            toast("Your profile is filled into this plan.");
            return;
        }
        if (b.hasAttribute("data-pf-reset")) {
            if (!(await sbConfirm("Every saved answer goes back to Southbound's starting assumptions. Your plans and drafts aren't changed.", {
                title: "Reset your athlete profile?", confirmLabel: "Reset profile", danger: true
            }))) return;
            const profile = currentProfile();
            const blanks = {};
            for (const key of Object.keys(profile.fields)) if (profile.fields[key]?.v != null) blanks[key] = "";
            updateProfile(blanks, { allowBlank: true });
            renderProfilePane();
            toast("Profile reset.");
        }
    });

    // Tabs by keyboard.
    $("myFuelingPlans")?.querySelector("[role=tablist]")?.addEventListener("keydown", event => {
        const tabs = [...document.querySelectorAll("[data-fuel-tab]")];
        const i = tabs.indexOf(document.activeElement);
        if (i < 0) return;
        const next = event.key === "ArrowRight" ? (i + 1) % tabs.length : event.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        selectTab(tabs[next].dataset.fuelTab, { focus: true });
    });

    $("fuelProfilePane")?.addEventListener("change", onProfilePaneInput);
    // Saved plans added, copied or deleted: the counts follow.
    const grid = $("savedPlansGrid");
    if (grid) new MutationObserver(() => renderAll()).observe(grid, { childList: true });

    // The calculator saved the plan: the draft it came from is done.
    window.addEventListener("sb:fuel-plan-saved", event => {
        flushNow();
        if (active) {
            write(draftKey(active.id), JSON.stringify(deletedMarker(active, { reason: "saved", planId: event.detail?.planId })));
            setActive(null);
        }
        baseline = A.captureState();
        renderAll();
        selectTab("saved");
        schedulePush("Plan");
    });
    // Start a new plan: the open draft stays a draft.
    window.addEventListener("sb:fuel-new-plan", () => {
        const had = active;
        detach();
        fillFromProfile();
        markBaseline();
        renderAll();
        if (had) toast(`“${draftTitle(had)}” is kept in My Fueling Plans → Drafts.`);
    });
    // A saved plan opened for viewing: not a draft until it changes.
    window.addEventListener("sb:fuel-loaded", () => {
        detach();
        setTimeout(() => { markBaseline(); refreshTags(); renderAll(); }, 0);
    });

    // Leaving: whatever's waiting is written now.
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", () => { if (document.hidden) flushNow(); });
    window.addEventListener("online", () => { if (waitingForSync) schedulePush(statusKind || "Draft"); });
    window.addEventListener("offline", () => { if (statusKind) setStatus("offline", `Offline — ${statusKind.toLowerCase()} saved on this phone. It syncs when you're back online.`); });
    window.addEventListener("sb:sync-status", event => {
        if (waitingForSync && event.detail?.state === "synced") {
            waitingForSync = false;
            setStatus("synced", `${statusKind || "Draft"} saved · synced at ${clock()}`);
        }
    });
    // Another tab (or a pull) changed drafts.
    window.addEventListener("storage", event => {
        if (!event.key || event.key.startsWith(DRAFT_PREFIX) || event.key === PROFILE_KEY) { renderAll(); refreshTags(); }
    });
}
