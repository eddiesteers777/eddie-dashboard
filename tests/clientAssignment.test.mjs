import assert from "node:assert/strict";
import test from "node:test";
import { filterAssignableClients, normalizeClientSearch, displayNameForAssignment } from "../js/clientAssignmentModel.js";

test("normalizes client search text", () => {
    assert.equal(normalizeClientSearch("  Jane   Doe "), "jane doe");
    assert.equal(normalizeClientSearch(""), "");
});

test("finds assignable clients by name or email", () => {
    const clients = [
        { uid: "2", displayName: "Alex Runner", email: "alex@example.com" },
        { uid: "1", displayName: "Jane Doe", email: "jane@example.com" },
        { uid: "3", displayName: "Sam Soccer", email: "sam@example.com" }
    ];
    assert.deepEqual(filterAssignableClients(clients, "jane" ).map(c => c.uid), ["1"]);
    assert.deepEqual(filterAssignableClients(clients, "EXAMPLE.COM").map(c => c.uid), ["2", "1", "3"], "sorted by name");
    assert.deepEqual(filterAssignableClients(clients, "soccer").map(c => c.uid), ["3"]);
    assert.deepEqual(filterAssignableClients(clients, "").length, 0);
});

test("assignment display falls back to email when a name is missing", () => {
    assert.equal(displayNameForAssignment({ displayName: "", email: "alex@example.com" }), "alex@example.com");
    assert.equal(displayNameForAssignment({ displayName: "Jane Doe", email: "jane@example.com" }), "Jane Doe");
});