// Firestore security rules tests. Run with `npm run test:rules`, which
// starts the local Firestore emulator and runs this file against
// firestore.rules. Every attack from the security review has a test
// here, next to the legitimate flow it must not break.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
    initializeTestEnvironment, assertFails, assertSucceeds
} from "@firebase/rules-unit-testing";
import {
    doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch,
    collection, getDocs, query, where, serverTimestamp, Timestamp
} from "firebase/firestore";

let env;
const DAY = 24 * 60 * 60 * 1000;

before(async () => {
    env = await initializeTestEnvironment({
        projectId: "demo-eddie",
        firestore: { rules: readFileSync("firestore.rules", "utf8") }
    });
});

after(async () => {
    await env?.cleanup();
});

beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(doc(db, "userProfiles/coach"), { uid: "coach", role: "coach", isCoachApproved: true, status: "active", services: [] });
        await setDoc(doc(db, "userProfiles/client"), { uid: "client", role: "client", isCoachApproved: false, status: "active", services: ["online_coaching"], email: "client@example.com" });
        await setDoc(doc(db, "userProfiles/stranger"), { uid: "stranger", role: "client", isCoachApproved: false, status: "pending", services: [] });
        await setDoc(doc(db, "inviteCodes/GOOD01"), { clientUid: "client", clientName: "Cam", clientEmail: "client@example.com", createdAt: Timestamp.now() });
        await setDoc(doc(db, "inviteCodes/OLD001"), { clientUid: "client", clientName: "Cam", clientEmail: "client@example.com", createdAt: Timestamp.fromMillis(Date.now() - 8 * DAY) });
        await setDoc(doc(db, "inviteCodes/OTHER1"), { clientUid: "other", clientName: "Oz", clientEmail: "", createdAt: Timestamp.now() });
        await setDoc(doc(db, "sharedPlans/client"), { trainingPrograms: [] });
    });
});

const as = uid => env.authenticatedContext(uid).firestore();

function redeem(db, coachUid, clientUid, code) {
    const batch = writeBatch(db);
    batch.set(doc(db, `coachLinks/${coachUid}_${clientUid}`), {
        coachUid, clientUid, inviteCode: code, linkedAt: serverTimestamp()
    });
    batch.delete(doc(db, `inviteCodes/${code}`));
    return batch.commit();
}

async function seedLinkAndBooking() {
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(doc(db, "coachLinks/coach_client"), { coachUid: "coach", clientUid: "client", inviteCode: "USED01" });
        await setDoc(doc(db, "bookingRequests/b1"), {
            coachUid: "coach", clientUid: "client", status: "requested", coachNote: "",
            dates: ["2026-10-01"], startTime: "09:00", endTime: "10:00", slotId: "s1"
        });
        await setDoc(doc(db, "checkins/client_2026-09-21"), {
            clientUid: "client", coachUid: "coach", weekOf: "2026-09-21",
            rating: 4, notes: "good week", status: "submitted", coachFeedback: ""
        });
    });
}

// ---- Forged coach links (critical) ----

test("a stranger cannot create a coach link to someone without an invite code", async () => {
    await assertFails(setDoc(doc(as("stranger"), "coachLinks/stranger_client"), { coachUid: "stranger", clientUid: "client" }));
});

test("even an approved coach cannot create a link without burning a code", async () => {
    await assertFails(setDoc(doc(as("coach"), "coachLinks/coach_client"), { coachUid: "coach", clientUid: "client", inviteCode: "GOOD01" }));
});

test("an unapproved account cannot redeem a valid code", async () => {
    await assertFails(redeem(as("stranger"), "stranger", "client", "GOOD01"));
});

test("an approved coach redeems a valid code atomically, and only once", async () => {
    await assertSucceeds(redeem(as("coach"), "coach", "client", "GOOD01"));
    await assertSucceeds(getDoc(doc(as("coach"), "sharedPlans/client")));
    await env.withSecurityRulesDisabled(async ctx => {
        const code = await getDoc(doc(ctx.firestore(), "inviteCodes/GOOD01"));
        if (code.exists()) throw new Error("code should have been burned");
    });
    await assertFails(redeem(as("coach"), "coach", "client", "GOOD01"));
});

test("an expired code cannot be redeemed", async () => {
    await assertFails(redeem(as("coach"), "coach", "client", "OLD001"));
});

test("a code from one client cannot link a coach to a different client", async () => {
    await assertFails(redeem(as("coach"), "coach", "client", "OTHER1"));
});

test("without a link, nobody else can read a client's shared plans", async () => {
    await assertFails(getDoc(doc(as("stranger"), "sharedPlans/client")));
    await assertFails(getDoc(doc(as("coach"), "sharedPlans/client")));
    await assertSucceeds(getDoc(doc(as("client"), "sharedPlans/client")));
});

// ---- Profile privacy (critical) ----

test("other users cannot read or list profiles", async () => {
    await assertFails(getDoc(doc(as("stranger"), "userProfiles/client")));
    await assertFails(getDocs(collection(as("stranger"), "userProfiles")));
    await assertFails(getDocs(query(collection(as("client"), "userProfiles"), where("status", "==", "pending"))));
});

test("owners read their own profile; approved coaches can list pending accounts", async () => {
    await assertSucceeds(getDoc(doc(as("client"), "userProfiles/client")));
    await assertSucceeds(getDoc(doc(as("brandnew"), "userProfiles/brandnew")));
    await assertSucceeds(getDocs(query(collection(as("coach"), "userProfiles"), where("status", "==", "pending"))));
});

test("a new profile can only start as a pending client with no services", async () => {
    const base = { uid: "brandnew", role: "client", isCoachApproved: false, status: "pending", services: [] };
    await assertSucceeds(setDoc(doc(as("brandnew"), "userProfiles/brandnew"), base));
    await assertFails(setDoc(doc(as("new2"), "userProfiles/new2"), { ...base, uid: "new2", services: ["online_coaching"] }));
    await assertFails(setDoc(doc(as("new3"), "userProfiles/new3"), { ...base, uid: "new3", role: "coach" }));
    await assertFails(setDoc(doc(as("new4"), "userProfiles/new4"), { ...base, uid: "new4", isCoachApproved: true }));
});

test("users can apply but cannot grant themselves access", async () => {
    const mine = doc(as("stranger"), "userProfiles/stranger");
    await assertSucceeds(updateDoc(mine, { requestedServices: ["soccer_1on1"], applicationMessage: "hi" }));
    await assertFails(updateDoc(mine, { services: ["online_coaching"] }));
    await assertFails(updateDoc(mine, { status: "active" }));
    await assertFails(updateDoc(mine, { isCoachApproved: true }));
    await assertFails(updateDoc(mine, { role: "coach" }));
});

test("an approved coach can approve a pending account", async () => {
    await assertSucceeds(updateDoc(doc(as("coach"), "userProfiles/stranger"), { status: "active", services: ["soccer_group"] }));
});

// ---- Invite codes (high) ----

test("invite codes cannot be listed, or read or deleted by strangers", async () => {
    await assertFails(getDocs(collection(as("stranger"), "inviteCodes")));
    await assertFails(getDoc(doc(as("stranger"), "inviteCodes/GOOD01")));
    await assertFails(deleteDoc(doc(as("stranger"), "inviteCodes/GOOD01")));
    await assertFails(deleteDoc(doc(as("coach"), "inviteCodes/GOOD01")));
});

test("a client can create, read and withdraw their own code", async () => {
    const db = as("client");
    await assertSucceeds(setDoc(doc(db, "inviteCodes/NEW001"), { clientUid: "client", clientName: "Cam", clientEmail: "", createdAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(db, "inviteCodes/NEW001")));
    await assertSucceeds(deleteDoc(doc(db, "inviteCodes/NEW001")));
    await assertFails(setDoc(doc(db, "inviteCodes/NEW002"), { clientUid: "client", createdAt: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(doc(as("stranger"), "inviteCodes/NEW003"), { clientUid: "client", clientName: "", clientEmail: "", createdAt: serverTimestamp() }));
});

// ---- Booking requests (high) ----

test("a client cannot approve their own booking or change its details", async () => {
    await seedLinkAndBooking();
    const req = doc(as("client"), "bookingRequests/b1");
    await assertFails(updateDoc(req, { status: "approved" }));
    await assertFails(updateDoc(req, { status: "cancelled", dates: ["2026-12-25"] }));
    await assertFails(updateDoc(req, { coachNote: "approved by coach" }));
    await assertFails(deleteDoc(req));
    await assertSucceeds(updateDoc(req, { status: "cancelled", respondedAt: serverTimestamp() }));
});

test("the coach can approve or deny, but cannot rewrite the booking", async () => {
    await seedLinkAndBooking();
    const req = doc(as("coach"), "bookingRequests/b1");
    await assertFails(updateDoc(req, { status: "approved", startTime: "06:00" }));
    await assertSucceeds(updateDoc(req, { status: "approved", coachNote: "See you there", respondedAt: serverTimestamp() }));
});

test("booking requests must start as requested and need a coach link", async () => {
    await seedLinkAndBooking();
    const fresh = { coachUid: "coach", clientUid: "client", coachNote: "", dates: ["2026-10-02"] };
    await assertSucceeds(setDoc(doc(as("client"), "bookingRequests/b2"), { ...fresh, status: "requested" }));
    await assertFails(setDoc(doc(as("client"), "bookingRequests/b3"), { ...fresh, status: "approved" }));
    await assertFails(setDoc(doc(as("stranger"), "bookingRequests/b4"), { ...fresh, clientUid: "stranger", status: "requested" }));
});

// ---- Weekly check-ins ----

test("check-ins: the client can't self-review and the coach can't edit the client's answers", async () => {
    await seedLinkAndBooking();
    await assertFails(updateDoc(doc(as("client"), "checkins/client_2026-09-21"), { status: "reviewed" }));
    await assertFails(updateDoc(doc(as("coach"), "checkins/client_2026-09-21"), { status: "reviewed", rating: 5 }));
    await assertSucceeds(updateDoc(doc(as("coach"), "checkins/client_2026-09-21"), { status: "reviewed", coachFeedback: "Nice work", reviewedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as("client"), "checkins/client_2026-09-21"), { status: "submitted", rating: 3, notes: "tired" }));
});

test("check-ins: a linked client can send this week's first check-in, exactly as js/checkins.js writes it", async () => {
    await seedLinkAndBooking();
    const ref = doc(as("client"), "checkins/client_2026-09-28");
    // Reading a check-in that doesn't exist yet is refused (the read rule
    // needs resource.data), which is why submitCheckin treats
    // permission-denied as "new". This is the bug that blocked every
    // first check-in on the live site until 2026-09-25.
    await assertFails(getDoc(ref));
    const payload = {
        clientUid: "client", clientName: "Cam", clientEmail: "client@example.com",
        coachUid: "coach", coachName: "Eddie", weekOf: "2026-09-28",
        rating: 4, notes: "Legs heavy", status: "submitted", reviewedAt: null,
        submittedAt: serverTimestamp(), coachFeedback: ""
    };
    await assertSucceeds(setDoc(ref, payload, { merge: true }));
    // A resubmit (no coachFeedback key) still works.
    const { coachFeedback, ...resubmit } = payload;
    await assertSucceeds(setDoc(ref, { ...resubmit, rating: 5 }, { merge: true }));
    // Someone who isn't linked to that coach can't create one.
    await assertFails(setDoc(doc(as("stranger"), "checkins/stranger_2026-09-28"),
        { ...payload, clientUid: "stranger" }, { merge: true }));
});

// ---- Website questions (public Contact page, no sign-in) ----

const guest = () => env.unauthenticatedContext().firestore();

function inquiry(overrides = {}) {
    return {
        name: "Pat Parent", email: "pat@example.com", phone: "", interest: "soccer_1on1",
        who: "child", athleteAge: "12", message: "Do you train 12 year olds on Saturdays?",
        status: "new", createdAt: serverTimestamp(), ...overrides
    };
}

test("anyone can send a question without signing in, but can't read it back", async () => {
    await assertSucceeds(setDoc(doc(guest(), "inquiries/q1"), inquiry()));
    await assertSucceeds(setDoc(doc(guest(), "inquiries/q2"), inquiry({ email: "", phone: "555-0100", who: "self", athleteAge: "" })));
    await assertFails(getDoc(doc(guest(), "inquiries/q1")));
    await assertFails(getDocs(collection(guest(), "inquiries")));
    await assertFails(getDocs(collection(as("client"), "inquiries")));
});

test("questions must be well-formed: contact info, known values, sane sizes, new status", async () => {
    await assertFails(setDoc(doc(guest(), "inquiries/bad1"), inquiry({ email: "", phone: "" })));
    await assertFails(setDoc(doc(guest(), "inquiries/bad2"), inquiry({ email: "not-an-email" })));
    await assertFails(setDoc(doc(guest(), "inquiries/bad3"), inquiry({ status: "handled" })));
    await assertFails(setDoc(doc(guest(), "inquiries/bad4"), inquiry({ interest: "free_money" })));
    await assertFails(setDoc(doc(guest(), "inquiries/bad5"), inquiry({ message: "x".repeat(2001) })));
    await assertFails(setDoc(doc(guest(), "inquiries/bad6"), inquiry({ name: "" })));
    await assertFails(setDoc(doc(guest(), "inquiries/bad7"), inquiry({ isCoachApproved: true })));
    await assertFails(setDoc(doc(guest(), "inquiries/bad8"), inquiry({ createdAt: Timestamp.fromMillis(0) })));
});

test("a sent question can't be edited or deleted by its sender", async () => {
    await assertSucceeds(setDoc(doc(guest(), "inquiries/q1"), inquiry()));
    await assertFails(updateDoc(doc(guest(), "inquiries/q1"), { message: "changed" }));
    await assertFails(deleteDoc(doc(guest(), "inquiries/q1")));
    await assertFails(updateDoc(doc(as("client"), "inquiries/q1"), { status: "handled" }));
});

test("the coach can list questions and mark them handled, but not rewrite them", async () => {
    await assertSucceeds(setDoc(doc(guest(), "inquiries/q1"), inquiry()));
    await assertSucceeds(getDocs(collection(as("coach"), "inquiries")));
    await assertSucceeds(updateDoc(doc(as("coach"), "inquiries/q1"), { status: "handled", handledAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as("coach"), "inquiries/q1"), { status: "new", handledAt: null }));
    await assertFails(updateDoc(doc(as("coach"), "inquiries/q1"), { message: "rewritten" }));
    await assertFails(updateDoc(doc(as("coach"), "inquiries/q1"), { status: "deleted" }));
});

// ---- Applying leaves a standing invite; "Approve" links in one step ----
// (js/coachAccess.js ensureApplyCode + linkApplicant). No rules change:
// it's the same code-burning batch as a typed invite code.

test("an applicant's standing code lets an approved coach link them on approval, once", async () => {
    const applicant = as("stranger");
    const code = "APPLY-stranger";
    // The client can't read a code that doesn't exist yet (reads as denied)...
    await assertFails(getDoc(doc(applicant, `inviteCodes/${code}`)));
    // ...so it creates one, and can read, replace and withdraw its own.
    await assertSucceeds(setDoc(doc(applicant, `inviteCodes/${code}`), {
        clientUid: "stranger", clientName: "Sam", clientEmail: "", createdAt: serverTimestamp()
    }));
    await assertSucceeds(getDoc(doc(applicant, `inviteCodes/${code}`)));
    await assertFails(updateDoc(doc(applicant, `inviteCodes/${code}`), { createdAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(applicant, `inviteCodes/${code}`)));
    await assertSucceeds(setDoc(doc(applicant, `inviteCodes/${code}`), {
        clientUid: "stranger", clientName: "Sam", clientEmail: "", createdAt: serverTimestamp()
    }));
    // Nobody can plant a standing code for someone else.
    await assertFails(setDoc(doc(as("client"), "inviteCodes/APPLY-other"), {
        clientUid: "other", clientName: "Oz", clientEmail: "", createdAt: serverTimestamp()
    }));
    // Only an approved coach can use it, and only once.
    await assertFails(redeem(as("client"), "client", "stranger", code));
    await assertSucceeds(redeem(as("coach"), "coach", "stranger", code));
    await assertFails(redeem(as("coach"), "coach", "stranger", code));
});

// ---- Client profiles (clientRecords) ----

function profile(clientUid, by, extra = {}) {
    return {
        clientUid, whoTrains: "self", preferredName: "Cam", athleteName: "", birthYear: 1994,
        phone: "555-0100", primarySport: "running", teamOrLevel: "", currentTraining: "3 runs a week",
        weeklyMileage: 18.5, strengthExperience: "some", availabilityDays: ["tue", "thu", "sat"],
        availabilityNotes: "Mornings", primaryGoal: "Sub-45 10K", secondaryGoals: "", targetEvent: "Fall 10K",
        targetDate: "2026-10-11", coachingWants: "", workedBefore: "", notWorked: "", injuries: "Old ankle sprain",
        intakeComplete: true, updatedAt: serverTimestamp(), updatedBy: by, ...extra
    };
}

test("client profiles: the client fills theirs in and their linked coach can read and edit it", async () => {
    await seedLinkAndBooking();
    const mine = doc(as("client"), "clientRecords/client");
    await assertSucceeds(getDoc(mine)); // reading before it exists is fine
    await assertSucceeds(setDoc(mine, profile("client", "client", { intakeCompletedAt: serverTimestamp() })));
    await assertSucceeds(getDoc(doc(as("coach"), "clientRecords/client")));
    await assertSucceeds(setDoc(doc(as("coach"), "clientRecords/client"),
        { primaryGoal: "Sub-44 10K", clientUid: "client", updatedAt: serverTimestamp(), updatedBy: "coach" }, { merge: true }));
});

test("client profiles: nobody else can read or write them", async () => {
    await seedLinkAndBooking();
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), "userProfiles/coach2"), { uid: "coach2", role: "coach", isCoachApproved: true, status: "active", services: [] });
        await setDoc(doc(ctx.firestore(), "clientRecords/client"), profile("client", "client", { updatedAt: Timestamp.now() }));
    });
    // An approved coach who isn't linked, and a random account.
    await assertFails(getDoc(doc(as("coach2"), "clientRecords/client")));
    await assertFails(getDoc(doc(as("stranger"), "clientRecords/client")));
    await assertFails(setDoc(doc(as("stranger"), "clientRecords/client"), profile("client", "stranger")));
    // A client can't write someone else's.
    await assertFails(setDoc(doc(as("client"), "clientRecords/stranger"), profile("stranger", "client")));
    // Nobody deletes it.
    await assertFails(deleteDoc(doc(as("client"), "clientRecords/client")));
    await assertFails(deleteDoc(doc(as("coach"), "clientRecords/client")));
    // Once the client removes the coach, the coach loses access.
    await assertSucceeds(deleteDoc(doc(as("client"), "coachLinks/coach_client")));
    await assertFails(getDoc(doc(as("coach"), "clientRecords/client")));
});

test("client profiles: only known fields, sane values, honest who/when", async () => {
    await seedLinkAndBooking();
    const mine = doc(as("client"), "clientRecords/client");
    await assertFails(setDoc(mine, profile("client", "client", { isCoachApproved: true })));
    await assertFails(setDoc(mine, profile("client", "client", { primaryGoal: "x".repeat(501) })));
    await assertFails(setDoc(mine, profile("client", "client", { whoTrains: "coach" })));
    await assertFails(setDoc(mine, profile("client", "client", { availabilityDays: ["mon", "funday"] })));
    await assertFails(setDoc(mine, profile("client", "client", { targetDate: "next spring" })));
    await assertFails(setDoc(mine, profile("client", "client", { birthYear: "1994" })));
    await assertFails(setDoc(mine, profile("client", "client", { clientUid: "stranger" })));
    await assertFails(setDoc(mine, profile("client", "coach"))); // can't sign it as someone else
    await assertFails(setDoc(mine, profile("client", "client", { updatedAt: Timestamp.fromMillis(0) })));
    // The completion time is set once, by the server clock, and then kept.
    await assertSucceeds(setDoc(mine, profile("client", "client", { intakeCompletedAt: serverTimestamp() })));
    await assertFails(setDoc(mine, { intakeCompletedAt: Timestamp.fromMillis(0), clientUid: "client", updatedAt: serverTimestamp(), updatedBy: "client" }, { merge: true }));
    await assertSucceeds(setDoc(mine, { phone: "555-0199", clientUid: "client", updatedAt: serverTimestamp(), updatedBy: "client" }, { merge: true }));
});

// ---- Private coach notes + client updates ----

const note = (coachUid, clientUid, extra = {}) => ({
    coachUid, clientUid, text: "Be conservative with mileage; left Achilles.", pinned: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra
});
const update = (coachUid, clientUid, extra = {}) => ({
    coachUid, coachName: "Eddie", clientUid, text: "Great week. Same structure next week.",
    createdAt: serverTimestamp(), readAt: null, ...extra
});

test("private notes: only the coach who wrote them can ever read them -- never the client", async () => {
    await seedLinkAndBooking();
    await assertSucceeds(setDoc(doc(as("coach"), "coachNotes/n1"), note("coach", "client")));
    await assertSucceeds(getDoc(doc(as("coach"), "coachNotes/n1")));
    await assertSucceeds(getDocs(query(collection(as("coach"), "coachNotes"), where("coachUid", "==", "coach"), where("clientUid", "==", "client"))));
    // The client the note is about can't read it, get it or list it.
    await assertFails(getDoc(doc(as("client"), "coachNotes/n1")));
    await assertFails(getDocs(query(collection(as("client"), "coachNotes"), where("clientUid", "==", "client"))));
    await assertFails(getDoc(doc(as("stranger"), "coachNotes/n1")));
    // The client can't plant, edit or delete one either.
    await assertFails(setDoc(doc(as("client"), "coachNotes/n2"), note("client", "client")));
    await assertFails(updateDoc(doc(as("client"), "coachNotes/n1"), { text: "hi", pinned: false, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as("client"), "coachNotes/n1")));
});

test("private notes: a coach can only write about linked clients, and can't re-point a note", async () => {
    await seedLinkAndBooking();
    await assertFails(setDoc(doc(as("coach"), "coachNotes/n3"), note("coach", "stranger")));
    await assertFails(setDoc(doc(as("coach"), "coachNotes/n4"), note("client", "client"))); // can't write as someone else
    await assertFails(setDoc(doc(as("coach"), "coachNotes/n5"), note("coach", "client", { text: "" })));
    await assertFails(setDoc(doc(as("coach"), "coachNotes/n6"), note("coach", "client", { shareWithClient: true })));
    await assertSucceeds(setDoc(doc(as("coach"), "coachNotes/n1"), note("coach", "client")));
    await assertSucceeds(updateDoc(doc(as("coach"), "coachNotes/n1"), { text: "Updated", pinned: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("coach"), "coachNotes/n1"), { clientUid: "stranger", updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(as("coach"), "coachNotes/n1")));
});

test("client updates: the linked coach sends, the client reads and can only mark read", async () => {
    await seedLinkAndBooking();
    await assertSucceeds(setDoc(doc(as("coach"), "clientUpdates/u1"), update("coach", "client")));
    await assertSucceeds(getDocs(query(collection(as("client"), "clientUpdates"), where("clientUid", "==", "client"))));
    await assertSucceeds(updateDoc(doc(as("client"), "clientUpdates/u1"), { readAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("client"), "clientUpdates/u1"), { text: "I rewrote this" }));
    await assertFails(deleteDoc(doc(as("client"), "clientUpdates/u1")));
    await assertFails(getDoc(doc(as("stranger"), "clientUpdates/u1")));
    // Only a linked coach can send, as themselves, a well-formed update.
    await assertFails(setDoc(doc(as("client"), "clientUpdates/u2"), update("client", "client")));
    await assertFails(setDoc(doc(as("coach"), "clientUpdates/u3"), update("coach", "stranger")));
    await assertFails(setDoc(doc(as("coach"), "clientUpdates/u4"), update("coach", "client", { readAt: serverTimestamp() })));
    await assertFails(setDoc(doc(as("coach"), "clientUpdates/u5"), update("coach", "client", { text: "x".repeat(2001) })));
    await assertSucceeds(deleteDoc(doc(as("coach"), "clientUpdates/u1")));
});

// ---- Coaching plans: the coach owns the prescription ----

const PLAN = { weeks: [{ week: 1, startDate: "2026-09-28", days: [{ date: "2026-09-28", day: "MON", type: "easy", miles: 5, session: "" }] }] };

function header(extra = {}) {
    return {
        coachUid: "coach", coachName: "Eddie", clientUid: "client", name: "Fall 10K", kind: "race", status: "active",
        version: 1, publishedAt: serverTimestamp(), coachNote: "", changes: [], startDate: "2026-09-28", endDate: "2026-10-04",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        viewedVersion: 0, viewedAt: null, ackVersion: 0, ackAt: null, ...extra
    };
}
function version(n, extra = {}) {
    return {
        coachUid: "coach", clientUid: "client", planId: "p1", version: n, name: "Fall 10K", kind: "race",
        plan: PLAN, changes: [], coachNote: "", publishedAt: serverTimestamp(), ...extra
    };
}
function firstPublish(db, { head = {}, ver = {} } = {}) {
    const batch = writeBatch(db);
    batch.set(doc(db, "coachingPlans/p1"), header(head));
    batch.set(doc(db, "coachingPlans/p1/versions/1"), version(1, ver));
    return batch.commit();
}
function publishNext(db, n, { head = {}, ver = {} } = {}) {
    const batch = writeBatch(db);
    batch.update(doc(db, "coachingPlans/p1"), { version: n, publishedAt: serverTimestamp(), updatedAt: serverTimestamp(), changes: ["Tue: 5 mi Easy → 6 mi Workout"], ...head });
    batch.set(doc(db, `coachingPlans/p1/versions/${n}`), version(n, ver));
    return batch.commit();
}

test("coaching plans: a linked coach publishes; the client reads it; strangers can't", async () => {
    await seedLinkAndBooking();
    await assertSucceeds(firstPublish(as("coach"), { head: { adoptedFrom: { store: "running", id: "rp1" } } }));
    await assertSucceeds(getDoc(doc(as("client"), "coachingPlans/p1")));
    await assertSucceeds(getDoc(doc(as("client"), "coachingPlans/p1/versions/1")));
    await assertSucceeds(getDocs(query(collection(as("client"), "coachingPlans"), where("clientUid", "==", "client"))));
    await assertSucceeds(getDocs(query(collection(as("coach"), "coachingPlans"), where("coachUid", "==", "coach"), where("clientUid", "==", "client"))));
    await assertFails(getDoc(doc(as("stranger"), "coachingPlans/p1")));
    await assertFails(getDoc(doc(as("stranger"), "coachingPlans/p1/versions/1")));
    // Next version: header and version doc together.
    await assertSucceeds(publishNext(as("coach"), 2));
    await assertSucceeds(getDoc(doc(as("client"), "coachingPlans/p1/versions/2")));
    // Archive, then restore.
    await assertSucceeds(updateDoc(doc(as("coach"), "coachingPlans/p1"), { status: "archived", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as("coach"), "coachingPlans/p1"), { status: "active", updatedAt: serverTimestamp() }));
});

test("coaching plans: publishing can't be faked, skipped, rewound or re-pointed", async () => {
    await seedLinkAndBooking();
    // Not linked to that client.
    await assertFails(firstPublish(as("coach"), { head: { clientUid: "stranger" }, ver: { clientUid: "stranger" } }));
    // A header with no version doc behind it.
    await assertFails(setDoc(doc(as("coach"), "coachingPlans/p1"), header()));
    // Starting at version 5, or pre-acknowledged.
    await assertFails(firstPublish(as("coach"), { head: { version: 5 } }));
    await assertFails(firstPublish(as("coach"), { head: { ackVersion: 1 } }));
    await assertFails(firstPublish(as("coach"), { head: { adoptedFrom: { store: "nutrition", id: "x" } } }));
    await assertFails(firstPublish(as("coach"), { head: { adoptedFrom: { store: "running", id: "x", wipe: true } } }));
    // A client can't publish a plan to themselves.
    await assertFails(firstPublish(as("client"), { head: { coachUid: "client" }, ver: { coachUid: "client" } }));
    await assertSucceeds(firstPublish(as("coach")));
    // Skipping a number, going backwards, or bumping without a version doc.
    await assertFails(publishNext(as("coach"), 3));
    await assertFails(updateDoc(doc(as("coach"), "coachingPlans/p1"), { version: 2, publishedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("coach"), "coachingPlans/p1"), { version: 0, updatedAt: serverTimestamp() }));
    // A version doc that doesn't match the header.
    await assertFails(setDoc(doc(as("coach"), "coachingPlans/p1/versions/2"), version(2)));
    // Re-pointing to another client, or deleting the record.
    await assertFails(updateDoc(doc(as("coach"), "coachingPlans/p1"), { clientUid: "stranger", updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as("coach"), "coachingPlans/p1")));
    // Published versions are permanent.
    await assertFails(updateDoc(doc(as("coach"), "coachingPlans/p1/versions/1"), { name: "Changed history" }));
    await assertFails(deleteDoc(doc(as("coach"), "coachingPlans/p1/versions/1")));
    // The coach can't mark it seen on the client's behalf.
    await assertFails(updateDoc(doc(as("coach"), "coachingPlans/p1"), { ackVersion: 1, ackAt: serverTimestamp() }));
});

test("coaching plans: the client can only say they saw it / got it", async () => {
    await seedLinkAndBooking();
    await assertSucceeds(firstPublish(as("coach")));
    await assertSucceeds(publishNext(as("coach"), 2));
    await assertSucceeds(updateDoc(doc(as("client"), "coachingPlans/p1"), { viewedVersion: 2, viewedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as("client"), "coachingPlans/p1"), { ackVersion: 2, ackAt: serverTimestamp() }));
    // Not a version that doesn't exist yet, not backwards, not a made-up time.
    await assertFails(updateDoc(doc(as("client"), "coachingPlans/p1"), { ackVersion: 3, ackAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("client"), "coachingPlans/p1"), { viewedVersion: 3, viewedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("client"), "coachingPlans/p1"), { viewedVersion: 1, viewedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("client"), "coachingPlans/p1"), { viewedVersion: 2, viewedAt: Timestamp.fromMillis(Date.now() - DAY) }));
    // Never the plan itself.
    await assertFails(updateDoc(doc(as("client"), "coachingPlans/p1"), { name: "My plan now" }));
    await assertFails(updateDoc(doc(as("client"), "coachingPlans/p1"), { status: "archived" }));
    await assertFails(setDoc(doc(as("client"), "coachingPlans/p1/versions/3"), version(3, { coachUid: "client" })));
    await assertFails(updateDoc(doc(as("client"), "coachingPlans/p1/versions/2"), { plan: {} }));
});

test("plan drafts: coach only -- the client never sees an unpublished plan", async () => {
    await seedLinkAndBooking();
    const draft = extra => ({ coachUid: "coach", clientUid: "client", name: "Winter base", kind: "training", plan: PLAN, basedOnVersion: 0, adoptedFrom: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra });
    await assertSucceeds(setDoc(doc(as("coach"), "coachingPlanDrafts/d1"), draft()));
    await assertSucceeds(getDoc(doc(as("coach"), "coachingPlanDrafts/d1")));
    await assertSucceeds(setDoc(doc(as("coach"), "coachingPlanDrafts/d1"), draft({ name: "Winter base v2" })));
    await assertFails(getDoc(doc(as("client"), "coachingPlanDrafts/d1")));
    await assertFails(getDocs(query(collection(as("client"), "coachingPlanDrafts"), where("clientUid", "==", "client"))));
    await assertFails(setDoc(doc(as("client"), "coachingPlanDrafts/d2"), draft({ coachUid: "client" })));
    await assertFails(setDoc(doc(as("coach"), "coachingPlanDrafts/d3"), draft({ clientUid: "stranger" })));
    await assertFails(setDoc(doc(as("coach"), "coachingPlanDrafts/d1"), draft({ clientUid: "stranger" })));
    await assertFails(setDoc(doc(as("coach"), "coachingPlanDrafts/d4"), draft({ secret: true })));
    await assertSucceeds(deleteDoc(doc(as("coach"), "coachingPlanDrafts/d1")));
});

// ---- Workout results: the client owns what they did ----

async function seedPublishedPlan() {
    await seedLinkAndBooking();
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(doc(db, "coachingPlans/p1"), { coachUid: "coach", clientUid: "client", name: "Fall 10K", version: 2, status: "active" });
        await setDoc(doc(db, "coachingPlans/pX"), { coachUid: "coach", clientUid: "stranger", name: "Someone else's", version: 1, status: "active" });
    });
}
const result = (extra = {}) => ({
    clientUid: "client", coachUid: "coach", planId: "p1", planVersion: 2, date: "2026-09-29", title: "Workout",
    plannedMiles: 6, status: "completed", distance: 6.2, durationSec: 3050, rpe: 8, pain: false, painNote: "", note: "Last rep was tough.",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), coachComment: "", coachCommentAt: null, ...extra
});

test("workout results: the client logs their own; their coach reads and comments", async () => {
    await seedPublishedPlan();
    const id = "workoutResults/client_p1_2026-09-29";
    await assertSucceeds(setDoc(doc(as("client"), id), result()));
    await assertSucceeds(getDocs(query(collection(as("client"), "workoutResults"), where("clientUid", "==", "client"))));
    await assertSucceeds(getDocs(query(collection(as("coach"), "workoutResults"), where("coachUid", "==", "coach"), where("clientUid", "==", "client"))));
    await assertFails(getDoc(doc(as("stranger"), id)));
    // The client edits what they did.
    await assertSucceeds(updateDoc(doc(as("client"), id), { distance: 6.4, rpe: 7, updatedAt: serverTimestamp() }));
    // The coach comments -- and nothing else.
    await assertSucceeds(updateDoc(doc(as("coach"), id), { coachComment: "Good control on the last rep.", coachCommentAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("coach"), id), { rpe: 3 }));
    await assertFails(updateDoc(doc(as("client"), id), { coachComment: "Great job, me.", coachCommentAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("client"), id), { clientUid: "stranger", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("client"), id), { date: "2026-09-30", updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(as("client"), id)));
});

test("workout results: only for a plan the coach published to them, with sane values", async () => {
    await seedPublishedPlan();
    const make = (id, extra) => setDoc(doc(as("client"), `workoutResults/${id}`), result(extra));
    // Wrong id shape, someone else's plan, a made-up coach.
    await assertFails(make("client_p1_2026-09-30"));
    await assertFails(make("client_pX_2026-09-29", { planId: "pX" }));
    await assertFails(make("client_p1_2026-09-29", { coachUid: "stranger" }));
    // Writing as someone else, or pre-filling the coach's comment.
    await assertFails(setDoc(doc(as("stranger"), "workoutResults/client_p1_2026-09-29"), result()));
    await assertFails(make("client_p1_2026-09-29", { coachComment: "Perfect!" }));
    // Out-of-range values.
    await assertFails(make("client_p1_2026-09-29", { rpe: 11 }));
    await assertFails(make("client_p1_2026-09-29", { distance: -1 }));
    await assertFails(make("client_p1_2026-09-29", { status: "crushed-it" }));
    await assertFails(make("client_p1_2026-09-29", { note: "x".repeat(1001) }));
    await assertFails(make("client_p1_2026-09-29", { extra: true }));
    // A skipped workout with nothing filled in is fine.
    await assertSucceeds(make("client_p1_2026-09-29", { status: "skipped", distance: null, durationSec: null, rpe: null }));
});

test("strength logs: their own id next to the run's, with the sets lifted", async () => {
    await seedPublishedPlan();
    const lift = extra => result({
        kind: "strength", title: "Lower Strength", plannedMiles: 0, distance: null,
        exercises: [{ name: "Trap Bar Deadlift", sets: [{ weight: 185, reps: 5 }, { weight: 195, reps: 5 }] }],
        ...extra
    });
    const id = "workoutResults/client_p1_2026-09-29_strength";
    // A run and a strength session on the same day don't collide.
    await assertSucceeds(setDoc(doc(as("client"), "workoutResults/client_p1_2026-09-29"), result()));
    await assertSucceeds(setDoc(doc(as("client"), id), lift()));
    await assertSucceeds(getDoc(doc(as("coach"), id)));
    await assertSucceeds(updateDoc(doc(as("client"), id), { exercises: [{ name: "Trap Bar Deadlift", sets: [] }], updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as("coach"), id), { coachComment: "Nice jump to 195.", coachCommentAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("coach"), id), { exercises: [] }));
    await assertFails(updateDoc(doc(as("client"), id), { kind: "run", updatedAt: serverTimestamp() }));
    await deleteDoc(doc(as("client"), id));
    // The id has to match the kind; exercises only on a strength log; a sane size.
    await assertFails(setDoc(doc(as("client"), "workoutResults/client_p1_2026-09-30"), lift({ date: "2026-09-30" })));
    await assertFails(setDoc(doc(as("client"), "workoutResults/client_p1_2026-09-30_strength"), result({ date: "2026-09-30" })));
    await assertFails(setDoc(doc(as("client"), "workoutResults/client_p1_2026-09-30_strength"), result({ date: "2026-09-30", kind: "strength", exercises: "lots" })));
    await assertFails(setDoc(doc(as("client"), "workoutResults/client_p1_2026-09-30"), result({ date: "2026-09-30", exercises: [] })));
    await assertFails(setDoc(doc(as("client"), "workoutResults/client_p1_2026-09-30_strength"), lift({ date: "2026-09-30", kind: "cardio" })));
    await assertFails(setDoc(doc(as("client"), id), lift({ exercises: Array.from({ length: 21 }, (_, i) => ({ name: `Ex ${i}`, sets: [] })) })));
    await assertFails(setDoc(doc(as("stranger"), id), lift()));
});
