// Unit tests for the service registry and capabilities (js/services.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
    SERVICES, SERVICE_IDS, TRAINING_SERVICES, SOCCER_SERVICES, CAPABILITIES,
    serviceLabel, serviceLabels, cleanServices, hasTrainingService, hasSoccerService,
    capabilitiesFor, failOpenCapabilities
} from "../js/services.js";
import { PACKAGE_CATALOG } from "../js/packageCatalog.js";
import { SERVICE_OPTIONS } from "../js/applicationForm.js";

const caps = input => [...capabilitiesFor(input)].sort();
const active = services => ({ services, status: "active" });
const TRAINING_ALL = ["checkins", "crossTraining", "fueling", "habits", "nutrition", "package", "plan", "profile", "progress", "readiness", "running", "strength", "updates"];

test("the five service ids, in order, never renamed", () => {
    assert.deepEqual(SERVICE_IDS, ["online_coaching", "running", "strength", "soccer_1on1", "soccer_group"]);
    assert.deepEqual(TRAINING_SERVICES, ["online_coaching", "running", "strength"]);
    assert.deepEqual(SOCCER_SERVICES, ["soccer_1on1", "soccer_group"]);
    assert.ok(Object.isFrozen(SERVICES) && Object.isFrozen(SERVICES[0]));
});

test("one set of labels, long and short", () => {
    assert.equal(serviceLabel("running"), "Running Coaching");
    assert.equal(serviceLabel("running", { short: true }), "Running");
    assert.equal(serviceLabel("soccer_group"), "Group Soccer");
    assert.equal(serviceLabel("mystery"), "mystery", "unknown ids pass through");
    assert.deepEqual(serviceLabels(["online_coaching", "soccer_1on1"]), ["Online Coaching", "1-on-1 Soccer"]);
    assert.deepEqual(serviceLabels(["strength"], { short: false }), ["Strength Coaching"]);
    // The Apply form's choices are the registry's.
    assert.deepEqual(SERVICE_OPTIONS, SERVICES.map(({ value, label }) => ({ value, label })));
});

test("cleanServices keeps known ids once, in order", () => {
    assert.deepEqual(cleanServices(["soccer_group", "x", "running", "running"]), ["running", "soccer_group"]);
    assert.deepEqual(cleanServices(null), []);
    assert.equal(hasTrainingService(["soccer_1on1", "strength"]), true);
    assert.equal(hasSoccerService(["online_coaching"]), false);
});

test("training clients: online, running and strength all get the same pages", () => {
    for (const s of TRAINING_SERVICES) assert.deepEqual(caps(active([s])), TRAINING_ALL, s);
    assert.ok(!capabilitiesFor(active(["running"])).has("sessions"), "no in-person booking for training-only");
    assert.ok(!capabilitiesFor(active(["running"])).has("coach"));
});

test("soccer clients: sessions, habits, progress; plan + check-in only with a coach plan", () => {
    for (const s of SOCCER_SERVICES) {
        assert.deepEqual(caps(active([s])), ["habits", "package", "profile", "progress", "sessions", "updates"], s);
        assert.deepEqual(caps({ ...active([s]), hasCoachPlan: true }),
            ["checkins", "habits", "package", "plan", "profile", "progress", "sessions", "updates"], s);
    }
    const soccer = capabilitiesFor({ ...active(["soccer_1on1"]), hasCoachPlan: true });
    for (const no of ["nutrition", "fueling", "running", "strength", "crossTraining", "readiness"]) assert.ok(!soccer.has(no), no);
});

test("hybrid clients get both", () => {
    assert.deepEqual(caps(active(["running", "soccer_group"])), [...TRAINING_ALL, "sessions"].sort());
});

test("pending, archived, no services, unknown services", () => {
    assert.deepEqual(caps({ services: ["running"], status: "pending" }), ["profile"]);
    assert.deepEqual(caps({ services: ["running"], status: "archived" }), []);
    assert.deepEqual(caps({}), [], "no profile = nothing");
    assert.deepEqual(caps(active([])), ["profile", "updates"]);
    assert.deepEqual(caps(active(["made_up"])), ["profile", "updates"]);
});

test("only isCoachApproved gives coach; the coach sees everything", () => {
    assert.deepEqual(caps({ isCoachApproved: true }), [...CAPABILITIES].sort());
    assert.ok(!capabilitiesFor({ isCoachApproved: "true", status: "active", services: SERVICE_IDS }).has("coach"), "only a real true");
    assert.ok(!capabilitiesFor({ role: "coach", status: "active" }).has("coach"), "role alone grants nothing");
    const open = failOpenCapabilities();
    assert.ok(!open.has("coach") && open.has("plan") && open.has("sessions"), "failing open never gives coach");
});

test("the rules' service lists match the registry", () => {
    const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    const listIn = re => JSON.parse(`[${rules.match(re)[1]}]`);
    // applications: every service someone can apply for.
    assert.deepEqual(listIn(/d\.services\.hasOnly\(\[([^\]]+)\]\)/), SERVICE_IDS);
    // userProfiles: what a coach may give (Phase 11 step 6).
    assert.deepEqual(listIn(/request\.resource\.data\.get\("services", \[\]\)\.hasOnly\(\[([^\]]+)\]\)/), SERVICE_IDS);
    // bookingRequests: only soccer clients ask for in-person sessions.
    assert.deepEqual(listIn(/data\.get\("services", \[\]\)\.hasAny\(\[([^\]]+)\]\)/), SOCCER_SERVICES);
    // clientPackages: every service in the package catalog, all known.
    const pkgServices = [...rules.matchAll(/d\.get\("service", ""\) == "([a-z0-9_]+)"/g)].map(m => m[1]);
    assert.deepEqual([...new Set(pkgServices)].sort(), [...new Set(PACKAGE_CATALOG.map(p => p.service))].sort());
    for (const s of pkgServices) assert.ok(SERVICE_IDS.includes(s), s);
});

// The service list used to be typed out in 8+ files with different labels.
// An array or object literal naming two or more service ids is a list of
// its own: use js/services.js. "running" and "strength" are also sports and
// plan types, so only lists that also name a soccer or online id count.
// (packageCatalog lists packages; inquiries lists contact-form topics.)
test("no other file keeps its own service list", () => {
    const allowed = new Set(["services.js", "packageCatalog.js", "inquiries.js"]);
    const dir = new URL("../js/", import.meta.url);
    // An array of id strings, or an object keyed by ids (a label map).
    const strings = src => SERVICE_IDS.filter(id => src.includes(`"${id}"`) || src.includes(`'${id}'`));
    const keys = src => SERVICE_IDS.filter(id => new RegExp(`(^|[{,\\s])${id}\\s*:`).test(src));
    const listy = ids => ids.length >= 2 && ids.some(id => id === "online_coaching" || id.startsWith("soccer"));
    const isList = src => src.startsWith("[") ? listy(strings(src)) : listy(keys(src));
    const offenders = readdirSync(dir).filter(f => f.endsWith(".js") && !allowed.has(f)).filter(f =>
        [...readFileSync(new URL(f, dir), "utf8").matchAll(/\[[^\[\]]*\]|\{[^{}]*\}/g)].some(m => isList(m[0])));
    assert.deepEqual(offenders, []);
    assert.ok(isList('["online_coaching", "running"]') && isList('{ soccer_1on1: "a", soccer_group: "b" }')
        && !isList('["running", "strength"]') && !isList('{ online: c => c.includes("online_coaching"), running: 1 }'), "the check itself works");
});
