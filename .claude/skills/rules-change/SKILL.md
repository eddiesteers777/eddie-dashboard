---
name: rules-change
description: Checklist for any change to firestore.rules or to what a Firestore collection may hold (new collection, new field, profile schema change), ending with click-by-click publish steps for Eddie.
---

# Firestore rules change

The rules are the security boundary (nav hiding is UX only), and they are not deployed automatically.

1. **Profile fields:** if `js/clientRecordSchema.js` changed, run `node scripts/build-profile-rules.mjs` (never hand-edit between the BEGIN/END markers).
2. **Tests:** add to `tests/rules.test.mjs` both the legitimate flow and the attack (wrong user, wrong fields, oversized values, someone else's doc). For a big document, add a test that saves the fullest possible version (Firestore stops at 1,000 checks per request).
3. **Create path:** test the real first write, not an admin-seeded doc: reading your own not-yet-created doc is permission-denied.
4. **Run** `npm run test:rules` from the repo folder (elsewhere the emulator runs with no rules and privacy tests falsely fail), then `npm run test:static`.
5. **Privacy page:** if what's collected or who can see it changed, update `privacy.html`.
6. **Tell Eddie**, in these words, once the change is on main:
   1. Open https://console.firebase.google.com and pick the project **eddie-s-dashboard**.
   2. Left menu: **Firestore Database**, then the **Rules** tab.
   3. Select everything in the editor and delete it.
   4. Open `firestore.rules` on GitHub (eddiesteers777/eddie-dashboard, main branch), click **Raw**, select all, copy.
   5. Paste into the editor and click **Publish**.
   Until he does, say exactly which feature fails (it shows permission-denied) and that everything else keeps working.
