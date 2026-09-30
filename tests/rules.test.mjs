// Firestore security rules tests. Run with `npm run test:rules`, which
// starts the local Firestore emulator and runs this file against
// firestore.rules. Every attack from the security review has a test
// here, next to the legitimate flow it must not break.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
    initializeTestEnvironment, assertFails, assertSucceeds
} from "@firebase/rules-unit-testing";
import {
    doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch,
    collection, getDocs, query, where, serverTimestamp, Timestamp, deleteField
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

// ---- Wearable sharing consent (Phase 7) ----

test("wearable sharing: only a linked client can create and control their consent", async () => {
    await seedLinkAndBooking();
    const id = "coach_client";
    const base = {
        version: 1,
        coachUid: "coach",
        clientUid: "client",
        status: "active",
        permissions: { activity: true, performance: true, recovery: false },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    const ref = doc(as("client"), "wearableShares/" + id);
    await assertSucceeds(setDoc(ref, base));
    await assertSucceeds(getDoc(doc(as("coach"), "wearableShares/" + id)));
    await assertSucceeds(getDoc(doc(as("client"), "wearableShares/" + id)));

    await assertSucceeds(updateDoc(ref, {
        permissions: { activity: true, performance: false, recovery: true },
        status: "active",
        updatedAt: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(ref, {
        permissions: { activity: false, performance: false, recovery: false },
        status: "revoked",
        updatedAt: serverTimestamp()
    }));

    const coachRef = doc(as("coach"), "wearableShares/" + id);
    await assertFails(updateDoc(coachRef, { permissions: { activity: true, performance: true, recovery: true }, updatedAt: serverTimestamp(), status: "active" }));
    await assertFails(deleteDoc(coachRef));

    await assertFails(getDoc(doc(as("stranger"), "wearableShares/" + id)));
    await assertFails(setDoc(doc(as("stranger"), "wearableShares/" + id), { ...base, clientUid: "stranger" }));

    await assertFails(setDoc(doc(as("client"), "wearableShares/other_client"), { ...base, coachUid: "coach2", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { coachUid: "coach2", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));

    await assertFails(setDoc(doc(as("client"), "wearableShares/bad1"), { ...base, permissions: { activity: true, performance: false, recovery: false, extra: true }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as("client"), "wearableShares/bad2"), { ...base, status: "active", permissions: { activity: false, performance: false, recovery: false }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as("client"), "wearableShares/bad3"), { ...base, status: "revoked", permissions: { activity: true, performance: false, recovery: false }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
});

test("shared COROS activity: coach access follows Training activity consent", async () => {
    await seedLinkAndBooking();
    const shareRef = doc(as("client"), "wearableShares/coach_client");
    const activityRef = doc(as("client"), "sharedWearableActivity/coach_client");
    const consent = {
        version: 1,
        coachUid: "coach",
        clientUid: "client",
        status: "active",
        permissions: { activity: true, performance: false, recovery: false },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    await assertSucceeds(setDoc(shareRef, consent));

    const activity = {
        version: 1,
        source: "coros",
        coachUid: "coach",
        clientUid: "client",
        windowFrom: "2026-09-03",
        windowTo: "2026-09-30",
        summary: { runCount: 4, distanceMiles: 24.2, durationSeconds: 12900 },
        recentRuns: [
            { date: "2026-09-29", startTime: "", distanceMiles: 6.1, durationSeconds: 3300 }
        ],
        updatedAt: serverTimestamp()
    };
    await assertSucceeds(setDoc(activityRef, activity));
    await assertSucceeds(getDoc(doc(as("coach"), "sharedWearableActivity/coach_client")));
    await assertSucceeds(getDoc(activityRef));
    await assertFails(getDoc(doc(as("stranger"), "sharedWearableActivity/coach_client")));
    await assertFails(updateDoc(doc(as("coach"), "sharedWearableActivity/coach_client"), {
        summary: { runCount: 99, distanceMiles: 999, durationSeconds: 1 }, updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(activityRef, {
        recentRuns: [{ date: "2026-09-29", startTime: "", distanceMiles: 6, durationSeconds: 3000, secret: "nope" }],
        updatedAt: serverTimestamp()
    }));

    // Performance-only consent must not expose an activity projection.
    await assertSucceeds(updateDoc(shareRef, {
        status: "active",
        permissions: { activity: false, performance: true, recovery: false },
        updatedAt: serverTimestamp()
    }));
    await assertFails(getDoc(doc(as("coach"), "sharedWearableActivity/coach_client")));
    await assertFails(setDoc(activityRef, activity));

    // Re-enabling Training activity restores the coach's read/write path.
    await assertSucceeds(updateDoc(shareRef, {
        status: "active",
        permissions: { activity: true, performance: true, recovery: false },
        updatedAt: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(activityRef, {
        summary: { runCount: 5, distanceMiles: 29.2, durationSeconds: 15900 },
        recentRuns: [],
        updatedAt: serverTimestamp()
    }));
    await assertSucceeds(getDoc(doc(as("coach"), "sharedWearableActivity/coach_client")));

    // Revoking all wearable sharing removes the coach's read path.
    await assertSucceeds(updateDoc(shareRef, {
        status: "revoked",
        permissions: { activity: false, performance: false, recovery: false },
        updatedAt: serverTimestamp()
    }));
    await assertFails(getDoc(doc(as("coach"), "sharedWearableActivity/coach_client")));
    await assertSucceeds(deleteDoc(activityRef));
    await assertFails(getDoc(activityRef));
});

test("shared COROS performance: coach access follows Performance consent", async () => {
    await seedLinkAndBooking();
    const shareRef = doc(as("client"), "wearableShares/coach_client");
    const performanceRef = doc(as("client"), "sharedWearablePerformance/coach_client");

    await assertSucceeds(setDoc(shareRef, {
        version: 1,
        coachUid: "coach",
        clientUid: "client",
        status: "active",
        permissions: { activity: false, performance: true, recovery: false },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }));

    const performance = {
        version: 1,
        source: "coros",
        coachUid: "coach",
        clientUid: "client",
        windowFrom: "2026-09-03",
        windowTo: "2026-09-30",
        summary: {
            runCount: 5,
            averagePaceSecondsPerMile: 522,
            averageHeartRate: 151,
            bestPaceSecondsPerMile: 475,
            bestPaceDistanceMiles: 5.1,
            vo2Max: 55.2,
            thresholdPaceSecondsPerMile: 450,
            marathonPrediction: "3:10:00",
            trainingLoadRatio: 1.12,
            shortTermLoad: 410,
            longTermLoad: 385
        },
        recentRuns: [
            {
                date: "2026-09-29",
                startTime: "",
                distanceMiles: 6.1,
                durationSeconds: 3180,
                paceSecondsPerMile: 521,
                avgHeartRate: 154
            }
        ],
        updatedAt: serverTimestamp()
    };

    await assertSucceeds(setDoc(performanceRef, performance));
    await assertSucceeds(getDoc(doc(as("client"), "sharedWearablePerformance/coach_client")));
    await assertSucceeds(getDoc(doc(as("coach"), "sharedWearablePerformance/coach_client")));
    await assertFails(getDoc(doc(as("stranger"), "sharedWearablePerformance/coach_client")));
    await assertFails(updateDoc(performanceRef, { secret: "nope", updatedAt: serverTimestamp() }));

    // Activity-only consent must not expose Performance.
    await assertSucceeds(updateDoc(shareRef, {
        status: "active",
        permissions: { activity: true, performance: false, recovery: false },
        updatedAt: serverTimestamp()
    }));
    await assertFails(getDoc(doc(as("coach"), "sharedWearablePerformance/coach_client")));
    await assertFails(setDoc(performanceRef, performance));

    // Re-enabling Performance restores the coach read/write boundary.
    await assertSucceeds(updateDoc(shareRef, {
        status: "active",
        permissions: { activity: true, performance: true, recovery: false },
        updatedAt: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(performanceRef, {
        summary: { ...performance.summary, runCount: 6 },
        updatedAt: serverTimestamp()
    }));
    await assertSucceeds(getDoc(doc(as("coach"), "sharedWearablePerformance/coach_client")));

    // Revoking wearable sharing removes the coach's read path.
    await assertSucceeds(updateDoc(shareRef, {
        status: "revoked",
        permissions: { activity: false, performance: false, recovery: false },
        updatedAt: serverTimestamp()
    }));
    await assertFails(getDoc(doc(as("coach"), "sharedWearablePerformance/coach_client")));
    await assertSucceeds(deleteDoc(performanceRef));
    await assertFails(getDoc(performanceRef));
});

test("shared COROS recovery: coach access follows Recovery consent", async () => {
    await seedLinkAndBooking();
    const shareRef = doc(as("client"), "wearableShares/coach_client");
    const recoveryRef = doc(as("client"), "sharedWearableRecovery/coach_client");

    await assertSucceeds(setDoc(shareRef, {
        version: 1,
        coachUid: "coach",
        clientUid: "client",
        status: "active",
        permissions: { activity: false, performance: false, recovery: true },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }));

    const recovery = {
        version: 1,
        source: "coros",
        coachUid: "coach",
        clientUid: "client",
        windowFrom: "2026-09-03",
        windowTo: "2026-09-30",
        summary: {
            daysWithData: 2,
            averageSleepScore: 85,
            averageAsleepMinutes: 435,
            averageHrv: 77,
            averageRestingHeartRate: 49,
            averageStress: 28,
            averageRecoveryPercent: 76,
            latestSleepScore: 88,
            latestAsleepMinutes: 450,
            latestHrv: 81,
            latestRestingHeartRate: 48,
            latestRecoveryPercent: 76,
            latestRecoveryStatus: "Moderate training recommended",
            latestRecoveryHours: 34
        },
        recentDays: [{
            date: "2026-09-29",
            sleepScore: 88,
            asleepMinutes: 450,
            hrvAvg: 81,
            hrvStatus: "Normal",
            restingHeartRate: 48,
            stressAvg: 25,
            stressLevel: "Relaxed",
            recoveryPercent: 76,
            recoveryStatus: "Moderate training recommended",
            recoveryHours: 34
        }],
        updatedAt: serverTimestamp()
    };

    await assertSucceeds(setDoc(recoveryRef, recovery));
    await assertSucceeds(getDoc(doc(as("client"), "sharedWearableRecovery/coach_client")));
    await assertSucceeds(getDoc(doc(as("coach"), "sharedWearableRecovery/coach_client")));
    await assertFails(getDoc(doc(as("stranger"), "sharedWearableRecovery/coach_client")));
    await assertFails(updateDoc(recoveryRef, {
        recentDays: [{ ...recovery.recentDays[0], secret: "nope" }],
        updatedAt: serverTimestamp()
    }));

    // Activity + Performance consent without Recovery must not expose Recovery.
    await assertSucceeds(updateDoc(shareRef, {
        status: "active",
        permissions: { activity: true, performance: true, recovery: false },
        updatedAt: serverTimestamp()
    }));
    await assertFails(getDoc(doc(as("coach"), "sharedWearableRecovery/coach_client")));
    await assertFails(setDoc(recoveryRef, recovery));

    // Re-enabling Recovery restores the coach read/write boundary.
    await assertSucceeds(updateDoc(shareRef, {
        status: "active",
        permissions: { activity: true, performance: true, recovery: true },
        updatedAt: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(recoveryRef, {
        summary: { ...recovery.summary, daysWithData: 3 },
        updatedAt: serverTimestamp()
    }));
    await assertSucceeds(getDoc(doc(as("coach"), "sharedWearableRecovery/coach_client")));

    // Revoking wearable sharing removes the coach read path.
    await assertSucceeds(updateDoc(shareRef, {
        status: "revoked",
        permissions: { activity: false, performance: false, recovery: false },
        updatedAt: serverTimestamp()
    }));
    await assertFails(getDoc(doc(as("coach"), "sharedWearableRecovery/coach_client")));
    await assertSucceeds(deleteDoc(recoveryRef));
    await assertFails(getDoc(recoveryRef));
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

// ---- Applications without an account (apply.html) ----

function application(overrides = {}) {
    return {
        name: "Pat Parent", email: "pat@example.com", phone: "555-0100", who: "child", athleteName: "Jamie",
        ageRange: "10-13", services: ["soccer_1on1"], goal: "Make the team", startWhen: "month",
        coachedBefore: "never", heardFrom: "friend", heardDetail: "Sam", contactBy: ["text"], contactTime: ["evening"],
        message: "", status: "new", createdAt: serverTimestamp(), ...overrides
    };
}

test("applications: anyone can apply without an account, only the coach reads them", async () => {
    await assertSucceeds(setDoc(doc(guest(), "applications/a1"), application()));
    await assertSucceeds(setDoc(doc(guest(), "applications/a2"), application({ email: "", who: "self", athleteName: "", services: ["running", "strength"] })));
    // Someone signed in may attach their own uid, never someone else's.
    await assertSucceeds(setDoc(doc(as("stranger"), "applications/a3"), application({ uid: "stranger" })));
    await assertFails(setDoc(doc(as("stranger"), "applications/a4"), application({ uid: "client" })));
    await assertFails(setDoc(doc(guest(), "applications/a5"), application({ uid: "client" })));
    await assertFails(getDoc(doc(guest(), "applications/a1")));
    await assertFails(getDocs(collection(guest(), "applications")));
    await assertFails(getDocs(collection(as("client"), "applications")));
    await assertSucceeds(getDocs(collection(as("coach"), "applications")));
});

test("applications: every answer must be one of the choices, with contact info", async () => {
    const bad = [
        { email: "", phone: "" }, { email: "nope" }, { name: "" }, { who: "coach" }, { ageRange: "12" },
        { services: [] }, { services: ["free_money"] }, { goal: "" }, { goal: "x".repeat(301) },
        { startWhen: "yesterday" }, { coachedBefore: "maybe" }, { heardFrom: "radio" }, { contactBy: ["pigeon"] },
        { contactTime: ["midnight"] }, { message: "x".repeat(1001) }, { status: "handled" },
        { createdAt: Timestamp.fromMillis(0) }, { isCoachApproved: true }
    ];
    for (const [i, change] of bad.entries()) {
        await assertFails(setDoc(doc(guest(), `applications/bad${i}`), application(change)));
    }
    const { goal, ...missing } = application();
    await assertFails(setDoc(doc(guest(), "applications/missing"), missing));
});

test("applications: the coach marks them handled and matches them to an account; nobody rewrites them", async () => {
    await assertSucceeds(setDoc(doc(guest(), "applications/a1"), application()));
    await assertFails(updateDoc(doc(guest(), "applications/a1"), { goal: "changed" }));
    await assertFails(deleteDoc(doc(guest(), "applications/a1")));
    await assertFails(updateDoc(doc(as("client"), "applications/a1"), { matchedUid: "client" }));
    await assertSucceeds(updateDoc(doc(as("coach"), "applications/a1"), { status: "handled", handledAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as("coach"), "applications/a1"), { matchedUid: "client", matchedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as("coach"), "applications/a1"), { matchedUid: null, matchedAt: null }));
    await assertFails(updateDoc(doc(as("coach"), "applications/a1"), { goal: "rewritten" }));
    await assertFails(updateDoc(doc(as("coach"), "applications/a1"), { status: "deleted" }));
    await assertSucceeds(deleteDoc(doc(as("coach"), "applications/a1")));
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

test("client profiles: 'still right?' confirmations are ms times for known answers only", async () => {
    await seedLinkAndBooking();
    const mine = doc(as("client"), "clientRecords/client");
    const now = Date.now();
    const confirm = confirmedAt => ({ clientUid: "client", confirmedAt, updatedAt: serverTimestamp(), updatedBy: "client" });
    await assertSucceeds(setDoc(mine, profile("client", "client", { intakeCompletedAt: serverTimestamp(), confirmedAt: { weeklyMileage: now, injuries: now } })));
    // "Yes, still right" on one answer merges into the map.
    await assertSucceeds(setDoc(mine, confirm({ availabilityDays: now }), { merge: true }));
    // The linked coach editing the profile stamps what changed.
    await assertSucceeds(setDoc(doc(as("coach"), "clientRecords/client"),
        { primaryGoal: "Sub-44 10K", confirmedAt: { primaryGoal: now }, clientUid: "client", updatedAt: serverTimestamp(), updatedBy: "coach" }, { merge: true }));
    // Only the tracked answers, only numbers, not years ahead.
    await assertFails(setDoc(mine, confirm({ isCoachApproved: now }), { merge: true }));
    await assertFails(setDoc(mine, confirm({ injuries: "yesterday" }), { merge: true }));
    await assertSucceeds(setDoc(mine, confirm({ injuries: now + 3 * 86400000 }), { merge: true })); // a phone clock a few days off still saves
    await assertFails(setDoc(mine, confirm({ injuries: now + 400 * 86400000 }), { merge: true }));
    await assertFails(setDoc(mine, confirm("today"), { merge: true }));
    // Someone who isn't linked can't confirm anything.
    await assertFails(setDoc(doc(as("stranger"), "clientRecords/client"), { ...confirm({ injuries: now }), updatedBy: "stranger" }, { merge: true }));
});

test("client profiles: the linked coach can ask for an update, and the client clears it", async () => {
    await seedLinkAndBooking();
    const now = Date.now();
    await assertSucceeds(setDoc(doc(as("client"), "clientRecords/client"), profile("client", "client", { intakeCompletedAt: serverTimestamp() })));
    const ask = (who, askedAt) => ({ clientUid: "client", askedAt, updatedAt: serverTimestamp(), updatedBy: who });
    await assertSucceeds(setDoc(doc(as("coach"), "clientRecords/client"), ask("coach", { level: now, limits: now }), { merge: true }));
    // Answering deletes that ask.
    await assertSucceeds(setDoc(doc(as("client"), "clientRecords/client"),
        { ...ask("client", { level: deleteField() }), confirmedAt: { weeklyMileage: now } }, { merge: true }));
    const left = (await getDoc(doc(as("client"), "clientRecords/client"))).data().askedAt;
    assert.deepEqual(Object.keys(left), ["limits"]);
    // Only the known questions, as times; strangers can't ask.
    await assertFails(setDoc(doc(as("coach"), "clientRecords/client"), ask("coach", { phone: now }), { merge: true }));
    await assertFails(setDoc(doc(as("coach"), "clientRecords/client"), ask("coach", { level: "please" }), { merge: true }));
    await assertFails(setDoc(doc(as("stranger"), "clientRecords/client"), ask("stranger", { level: now }), { merge: true }));
});

test("client profiles: the tap answers, contacts and health check take only their choices", async () => {
    await seedLinkAndBooking();
    const mine = doc(as("client"), "clientRecords/client");
    const taps = {
        emergencyName: "Pat Client", emergencyPhone: "555-0111", emergencyRelation: "Partner",
        guardianName: "", guardianPhone: "", runsPerWeek: 4, longestRun: 8.5, yearsRunning: "3-5", runStart: "running",
        timeOfDay: ["early", "evening"], sessionLength: "60", trainWhere: ["outside", "gym"], equipment: ["dumbbells", "bands"],
        soccerPosition: "", soccerLevel: "", strongFoot: "", yearsPlaying: "", eventType: "10k",
        feedbackStyle: "direct", obstacle: "time", injuryAreas: ["ankle"], injuryStatus: "past",
        healthFlags: ["joints"], healthNote: "Old ankle sprain", healthCheckedAt: Date.now()
    };
    await assertSucceeds(setDoc(mine, profile("client", "client", { intakeCompletedAt: serverTimestamp(), ...taps })));
    // The coach can correct them too.
    await assertSucceeds(setDoc(doc(as("coach"), "clientRecords/client"),
        { soccerPosition: "midfield", clientUid: "client", updatedAt: serverTimestamp(), updatedBy: "coach" }, { merge: true }));
    const bad = extra => setDoc(mine, { clientUid: "client", updatedAt: serverTimestamp(), updatedBy: "client", ...extra }, { merge: true });
    await assertFails(bad({ runsPerWeek: 9 }));
    await assertFails(bad({ runsPerWeek: 3.5 }));
    await assertFails(bad({ longestRun: 250 }));
    await assertFails(bad({ eventType: "ironman" }));
    await assertFails(bad({ sessionLength: 60 }));
    await assertFails(bad({ equipment: ["dumbbells", "yacht"] }));
    await assertFails(bad({ injuryAreas: "knee" }));
    await assertFails(bad({ healthFlags: ["heart", "nosy"] }));
    await assertFails(bad({ healthCheckedAt: "today" }));
    await assertFails(bad({ healthCheckedAt: Date.now() + 400 * 86400000 }));
    await assertFails(bad({ emergencyPhone: "5".repeat(31) }));
    await assertSucceeds(bad({ healthFlags: [], healthCheckedAt: Date.now() })); // "none of these"
    await assertSucceeds(bad({ runsPerWeek: null, longestRun: null }));
    // Everything answered at once, with every confirmation and ask: still
    // within Firestore's 1,000-check limit per save.
    const now = Date.now();
    const all = { primaryGoal: now, targetEvent: now, availabilityDays: now, weeklyMileage: now, strengthExperience: now, injuries: now };
    await assertSucceeds(setDoc(doc(as("coach"), "clientRecords/client"), profile("client", "coach", {
        ...taps, guardianName: "Jo Parent", guardianPhone: "555-0199", soccerPosition: "gk", soccerLevel: "academy",
        strongFoot: "both", yearsPlaying: "10+", availabilityDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        timeOfDay: ["early", "morning", "midday", "afternoon", "evening"], trainWhere: ["gym", "home", "outside", "trails", "track", "field"],
        equipment: ["bodyweight", "bands", "dumbbells", "kettlebells", "barbell", "machines", "treadmill"],
        injuryAreas: ["neck", "shoulder", "back", "hip", "hamstring", "quad", "knee", "shin", "calf", "ankle", "foot", "other"],
        healthFlags: ["heart", "chest", "dizzy", "chronic", "meds", "joints", "supervised"],
        confirmedAt: all, askedAt: { goal: now, days: now, level: now, limits: now }, intakeCompletedAt: serverTimestamp()
    }), { merge: true }));
    // Still private: an approved coach who isn't linked can't read the health answers.
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), "userProfiles/coach2"), { uid: "coach2", role: "coach", isCoachApproved: true, status: "active", services: [] });
    });
    await assertFails(getDoc(doc(as("coach2"), "clientRecords/client")));
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

// ---- Client package entitlements ----

const clientPackage = (extra = {}) => ({
    coachUid: "coach", clientUid: "client", packageId: "soccer_1on1_10",
    packageName: "1-on-1 Soccer — 10 Sessions", service: "soccer_1on1",
    billingModel: "session_pack", cadence: "one_time", sessionAllowance: 10,
    status: "active", startsAt: "2026-10-01", endsAt: null, coachNote: "",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra
});

test("client packages: linked coach can assign, client can read, identity cannot change", async () => {
    await seedLinkAndBooking();
    const ref = doc(as("coach"), "clientPackages/p1");
    await assertSucceeds(setDoc(ref, clientPackage()));
    await assertSucceeds(getDoc(doc(as("client"), "clientPackages/p1")));
    await assertSucceeds(getDocs(query(collection(as("client"), "clientPackages"), where("clientUid", "==", "client"))));
    await assertSucceeds(updateDoc(ref, { status: "paused", coachNote: "Pause until October 15.", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { packageId: "soccer_1on1_5", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { clientUid: "stranger", updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(as("client"), "clientPackages/p2"), clientPackage()));
    await assertFails(getDoc(doc(as("stranger"), "clientPackages/p1")));
});

test("client packages: only valid catalog shapes are accepted", async () => {
    await seedLinkAndBooking();
    const bad = (id, extra) => setDoc(doc(as("coach"), `clientPackages/${id}`), clientPackage(extra));
    await assertSucceeds(bad("good", {}));
    await assertFails(bad("unknown-package", { packageId: "free_coaching" }));
    await assertFails(bad("bad-status", { status: "expired" }));
    await assertFails(bad("bad-count", { sessionAllowance: 0 }));
    await assertFails(bad("bad-date", { startsAt: "next month" }));
    await assertFails(bad("bad-field", { extra: true }));
    await assertFails(bad("bad-price", { priceCents: 10000 }));
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

// ---- Rolling plans: the client sees this week and next ----

const master = extra => ({ coachUid: "coach", clientUid: "client", plan: PLAN, version: 1, updatedAt: serverTimestamp(), ...extra });

test("rolling plans: the coach's whole plan is coach-only; publishing writes it with the window", async () => {
    await seedLinkAndBooking();
    // As js/coachingPlans.js publishes: header + window version + the whole plan, one batch.
    const coachDb = as("coach");
    const batch = writeBatch(coachDb);
    batch.set(doc(coachDb, "coachingPlans/p1"), header({ noticeVersion: 1, releasedThrough: "2026-10-11", showAll: false }));
    batch.set(doc(coachDb, "coachingPlans/p1/versions/1"), version(1, { releasedThrough: "2026-10-11", auto: false }));
    batch.set(doc(coachDb, "coachingPlanMasters/p1"), master());
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(as("coach"), "coachingPlanMasters/p1")));
    // The client (and anyone else) can never read ahead.
    await assertFails(getDoc(doc(as("client"), "coachingPlanMasters/p1")));
    await assertFails(getDocs(query(collection(as("client"), "coachingPlanMasters"), where("clientUid", "==", "client"))));
    await assertFails(getDoc(doc(as("stranger"), "coachingPlanMasters/p1")));
    await assertSucceeds(getDoc(doc(as("client"), "coachingPlans/p1/versions/1")));
    // Only the linked coach writes it, only known fields, never re-pointed or deleted.
    await assertFails(setDoc(doc(as("client"), "coachingPlanMasters/p2"), master({ coachUid: "client" })));
    await assertFails(setDoc(doc(as("coach"), "coachingPlanMasters/p3"), master({ clientUid: "stranger" })));
    await assertFails(setDoc(doc(as("coach"), "coachingPlanMasters/p1"), master({ clientUid: "stranger" })));
    await assertFails(setDoc(doc(as("coach"), "coachingPlanMasters/p1"), master({ secret: true })));
    await assertFails(setDoc(doc(as("coach"), "coachingPlanMasters/p1"), master({ version: 0 })));
    await assertSucceeds(setDoc(doc(as("coach"), "coachingPlanMasters/p1"), master({ version: 2 })));
    await assertFails(deleteDoc(doc(as("coach"), "coachingPlanMasters/p1")));
});

test("rolling plans: opening the next week keeps the publish date and the notice; the client can't move the window", async () => {
    await seedLinkAndBooking();
    await assertSucceeds(firstPublish(as("coach"), { head: { noticeVersion: 1, releasedThrough: "2026-10-11", showAll: false }, ver: { releasedThrough: "2026-10-11", auto: false } }));
    // The coach's app finds its plans and opens the next week: a new version, same publishedAt.
    await assertSucceeds(getDocs(query(collection(as("coach"), "coachingPlans"), where("coachUid", "==", "coach"))));
    const coachDb = as("coach");
    const release = writeBatch(coachDb);
    release.update(doc(coachDb, "coachingPlans/p1"), { version: 2, releasedThrough: "2026-10-18", updatedAt: serverTimestamp() });
    release.set(doc(coachDb, "coachingPlans/p1/versions/2"), version(2, { releasedThrough: "2026-10-18", auto: true, publishedAt: serverTimestamp() }));
    await assertSucceeds(release.commit());
    // Got it on the newest version is still fine.
    await assertSucceeds(updateDoc(doc(as("client"), "coachingPlans/p1"), { ackVersion: 2, ackAt: serverTimestamp() }));
    // Bad values.
    await assertFails(updateDoc(doc(as("coach"), "coachingPlans/p1"), { noticeVersion: 3, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("coach"), "coachingPlans/p1"), { releasedThrough: "next week", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("coach"), "coachingPlans/p1"), { showAll: "yes", updatedAt: serverTimestamp() }));
    await assertFails(publishNext(as("coach"), 3, { ver: { auto: "yes" } }));
    await assertFails(publishNext(as("coach"), 3, { ver: { releasedThrough: "soon" } }));
    // A publish with a made-up date is still refused.
    await assertFails(publishNext(as("coach"), 3, { head: { publishedAt: Timestamp.fromMillis(Date.now() - DAY) } }));
    await assertSucceeds(updateDoc(doc(as("coach"), "coachingPlans/p1"), { showAll: true, releasedThrough: "2026-10-04", updatedAt: serverTimestamp() }));
    // The client can't open weeks, show the whole plan or silence the notice themselves.
    await assertFails(updateDoc(doc(as("client"), "coachingPlans/p1"), { releasedThrough: "2026-12-31" }));
    await assertFails(updateDoc(doc(as("client"), "coachingPlans/p1"), { showAll: false }));
    await assertFails(updateDoc(doc(as("client"), "coachingPlans/p1"), { noticeVersion: 2 }));
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

// ---- Coaching Phase F: the feedback loop ----

test("check-ins: the richer check-in with the week's snapshot; no extra or oversized fields", async () => {
    await seedLinkAndBooking();
    const ref = doc(as("client"), "checkins/client_2026-09-28");
    const payload = {
        clientUid: "client", clientName: "Cam", clientEmail: "client@example.com",
        coachUid: "coach", coachName: "Eddie", weekOf: "2026-09-28",
        rating: 4, notes: "", status: "submitted", reviewedAt: null,
        submittedAt: serverTimestamp(), coachFeedback: "",
        energy: 4, recovery: 2, motivation: null, pain: true, painNote: "left knee",
        wentWell: "Long run", change: "Tuesdays are hard",
        week: { planned: 6, done: 5, miles: 30, milesDone: 26, longRun: "done", avgRpe: 6.8 }
    };
    await assertSucceeds(setDoc(ref, payload, { merge: true }));
    const { coachFeedback, ...resubmit } = payload;
    await assertSucceeds(setDoc(ref, { ...resubmit, recovery: 3 }, { merge: true }));
    // The coach still just replies.
    await assertSucceeds(updateDoc(doc(as("coach"), "checkins/client_2026-09-28"), { status: "reviewed", coachFeedback: "Easy Tuesday this week.", reviewedAt: serverTimestamp() }));
    // Attacks on a new week's check-in.
    const next = doc(as("client"), "checkins/client_2026-10-05");
    const fresh = { ...payload, weekOf: "2026-10-05" };
    await assertFails(setDoc(next, { ...fresh, isVip: true }));
    await assertFails(setDoc(next, { ...fresh, energy: 7 }));
    await assertFails(setDoc(next, { ...fresh, pain: "yes" }));
    await assertFails(setDoc(next, { ...fresh, change: "x".repeat(1001) }));
    await assertFails(setDoc(next, { ...fresh, week: "lots" }));
    await assertFails(setDoc(next, { ...fresh, week: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i])) }));
    await assertFails(setDoc(next, { ...fresh, coachFeedback: "Great week, me" }));
    await assertSucceeds(setDoc(next, fresh));
});

test("change requests: a linked client asks, the coach answers and resolves", async () => {
    await seedLinkAndBooking();
    const ask = extra => ({
        clientUid: "client", clientName: "Cam", coachUid: "coach", planId: "p1", date: "2026-10-06",
        reason: "work", message: "Can Tuesday move to Wednesday?", status: "open", coachReply: "",
        createdAt: serverTimestamp(), resolvedAt: null, ...extra
    });
    const ref = doc(as("client"), "changeRequests/r1");
    await assertSucceeds(setDoc(ref, ask()));
    await assertSucceeds(getDocs(query(collection(as("client"), "changeRequests"), where("clientUid", "==", "client"))));
    await assertSucceeds(getDocs(query(collection(as("coach"), "changeRequests"), where("coachUid", "==", "coach"))));
    await assertFails(getDoc(doc(as("stranger"), "changeRequests/r1")));
    // The client can't answer their own request or edit it after sending.
    await assertFails(updateDoc(ref, { status: "resolved", resolvedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { message: "never mind" }));
    // The coach answers -- only the answer.
    const coachRef = doc(as("coach"), "changeRequests/r1");
    await assertFails(updateDoc(coachRef, { message: "edited", coachReply: "ok", status: "resolved", resolvedAt: serverTimestamp() }));
    await assertFails(updateDoc(coachRef, { coachReply: "ok", status: "resolved", resolvedAt: null }));
    await assertSucceeds(updateDoc(coachRef, { coachReply: "Moved it to Wednesday.", status: "resolved", resolvedAt: serverTimestamp() }));
    // Answered: the client can no longer delete it.
    await assertFails(deleteDoc(ref));
    // A fresh one can be withdrawn.
    await assertSucceeds(setDoc(doc(as("client"), "changeRequests/r2"), ask({ date: null, planId: null })));
    await assertSucceeds(deleteDoc(doc(as("client"), "changeRequests/r2")));
    // Attacks on create.
    const bad = (id, extra, who = "client") => setDoc(doc(as(who), `changeRequests/${id}`), ask(extra));
    await assertFails(bad("r3", { reason: "because" }));
    await assertFails(bad("r3", { message: "" }));
    await assertFails(bad("r3", { status: "resolved" }));
    await assertFails(bad("r3", { coachReply: "Approved!" }));
    await assertFails(bad("r3", { date: "next tuesday" }));
    await assertFails(bad("r3", { extra: 1 }));
    await assertFails(bad("r3", { clientUid: "stranger" }, "stranger"));
    await assertFails(bad("r3", { coachUid: "coach2" }));
});

test("last seen: a user stamps only their own lastSeenAt, only with the server clock", async () => {
    await seedLinkAndBooking();
    await assertSucceeds(updateDoc(doc(as("client"), "userProfiles/client"), { lastSeenAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("client"), "userProfiles/client"), { lastSeenAt: new Date("2030-01-01") }));
    await assertFails(updateDoc(doc(as("client"), "userProfiles/client"), { lastSeenAt: serverTimestamp(), status: "active", services: ["running"] }));
    await assertFails(updateDoc(doc(as("stranger"), "userProfiles/client"), { lastSeenAt: serverTimestamp() }));
});

test("session logs: the coach logs a session of an approved booking; the client reads it; nobody else", async () => {
    await seedLinkAndBooking();
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(doc(db, "bookingRequests/b2"), {
            coachUid: "coach", clientUid: "client", status: "approved", coachNote: "", sessionType: "soccer",
            dates: ["2026-09-01", "2026-09-08", "2026-09-22", "2026-10-08", "2026-10-22", "2099-01-15"], startTime: "09:00", endTime: "10:00", slotId: "s1"
        });
        await setDoc(doc(db, "userProfiles/coach2"), { uid: "coach2", role: "coach", isCoachApproved: true, status: "active", services: [] });
        await setDoc(doc(db, "clientPackages/p1"), {
            coachUid: "coach", clientUid: "client",
            packageId: "soccer_1on1_10", packageName: "1-on-1 Soccer — 10 Sessions",
            service: "soccer_1on1", billingModel: "session_pack", cadence: "one_time",
            sessionAllowance: 10, status: "active", startsAt: "2026-09-01", endsAt: null,
            coachNote: "", createdAt: Timestamp.now(), updatedAt: Timestamp.now()
        });
        await setDoc(doc(db, "clientPackages/p2"), {
            coachUid: "coach2", clientUid: "client",
            packageId: "soccer_1on1_5", packageName: "1-on-1 Soccer — 5 Sessions",
            service: "soccer_1on1", billingModel: "session_pack", cadence: "one_time",
            sessionAllowance: 5, status: "active", startsAt: "2026-09-01", endsAt: null,
            coachNote: "", createdAt: Timestamp.now(), updatedAt: Timestamp.now()
        });
        await setDoc(doc(db, "clientPackages/p3"), {
            coachUid: "coach", clientUid: "stranger",
            packageId: "soccer_1on1_single", packageName: "1-on-1 Soccer — Single Session",
            service: "soccer_1on1", billingModel: "single", cadence: "one_time",
            sessionAllowance: 1, status: "active", startsAt: "2026-09-01", endsAt: null,
            coachNote: "", createdAt: Timestamp.now(), updatedAt: Timestamp.now()
        });
    });
    const log = (extra = {}) => ({
        coachUid: "coach", clientUid: "client", bookingId: "b2", date: "2026-09-01", status: "completed",
        workedOn: "First touch and weak-foot passing", nextTime: "Wall passes 10 min a day",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra
    });
    const ref = doc(as("coach"), "sessionLogs/b2_2026-09-01");
    await assertSucceeds(setDoc(ref, log({ packageAssignmentId: "p1" })));
    // The client can read a linked package-backed session just like any other session log.
    await assertSucceeds(getDoc(doc(as("client"), "sessionLogs/b2_2026-09-01")));
    // A package link is valid only for the same coach/client and a completed soccer session.
    await assertFails(setDoc(doc(as("coach"), "sessionLogs/b2_2026-09-08"), log({
        date: "2026-09-08", packageAssignmentId: "p2"
    })));
    await assertFails(setDoc(doc(as("coach"), "sessionLogs/b2_2026-09-22"), log({
        date: "2026-09-22", packageAssignmentId: "p3"
    })));
    await assertFails(updateDoc(ref, {
        status: "no-show", workedOn: "", nextTime: "", packageAssignmentId: "p1", updatedAt: serverTimestamp()
    }));
    // Both of them can read it and list their own.
    await assertSucceeds(getDoc(doc(as("client"), "sessionLogs/b2_2026-09-01")));
    await assertSucceeds(getDocs(query(collection(as("client"), "sessionLogs"), where("clientUid", "==", "client"))));
    await assertSucceeds(getDocs(query(collection(as("coach"), "sessionLogs"), where("coachUid", "==", "coach"))));
    await assertFails(getDoc(doc(as("stranger"), "sessionLogs/b2_2026-09-01")));
    await assertFails(getDocs(query(collection(as("stranger"), "sessionLogs"), where("clientUid", "==", "client"))));
    // The coach changes it (no-show), keeping who / which / when.
    await assertSucceeds(updateDoc(ref, { status: "no-show", workedOn: "", nextTime: "", packageAssignmentId: null, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { date: "2026-10-08", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: "great", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    // A future date of the series can be cancelled in advance.
    await assertSucceeds(setDoc(doc(as("coach"), "sessionLogs/b2_2026-10-08"), log({ date: "2026-10-08", status: "cancelled", workedOn: "", nextTime: "" })));
    // But a future outcome cannot be forged before the occurrence happens.
    await assertFails(setDoc(doc(as("coach"), "sessionLogs/b2_2099-01-15"), log({ date: "2099-01-15" })));
    await assertFails(setDoc(doc(as("coach"), "sessionLogs/b2_2099-01-15"), log({ date: "2099-01-15", status: "no-show", workedOn: "", nextTime: "" })));
    await assertSucceeds(setDoc(doc(as("coach"), "sessionLogs/b2_2099-01-15"), log({ date: "2099-01-15", status: "late-cancel", workedOn: "", nextTime: "" })));
    // The client can't write or change a log; another coach can't either.
    await assertFails(setDoc(doc(as("client"), "sessionLogs/b2_2026-09-01"), log({ coachUid: "client" })));
    await assertFails(updateDoc(doc(as("client"), "sessionLogs/b2_2026-09-01"), { status: "completed", updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as("client"), "sessionLogs/b2_2026-09-01")));
    await assertFails(setDoc(doc(as("coach2"), "sessionLogs/b2_2026-10-15"), log({ coachUid: "coach2", date: "2026-10-15" })));
    // Attacks on create: a date not in the booking, a request not yet approved, a wrong id,
    // a different client, unknown fields, oversized words, a forged time.
    const bad = (id, extra) => setDoc(doc(as("coach"), `sessionLogs/${id}`), log(extra));
    await assertFails(bad("b2_2026-10-15", { date: "2026-10-15" }));
    await assertFails(bad("b1_2026-10-01", { bookingId: "b1" }));
    await assertFails(bad("x_2026-10-08", { date: "2026-10-08" }));
    await assertFails(bad("b2_2026-10-22", { date: "2026-10-22", clientUid: "stranger" }));
    await assertFails(bad("b2_2026-10-22", { date: "2026-10-22", rating: 5 }));
    await assertFails(bad("b2_2026-10-22", { date: "2026-10-22", workedOn: "x".repeat(1001) }));
    await assertFails(bad("b2_2026-10-22", { date: "2026-10-22", createdAt: new Date("2020-01-01") }));
    await assertFails(bad("b2_2026-10-22", { date: "2026-10-22" }));
    // Undo: the coach deletes it.
    await assertSucceeds(deleteDoc(ref));
});
