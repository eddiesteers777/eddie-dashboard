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
