// Tests for the AI helper relay (cloudflare-worker/ai-helper.js), with
// Firestore and Anthropic stood in by a fake fetch. Run: npm run test:static
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare-worker/ai-helper.js";
import { describeRequest, DESCRIBE_TOOL } from "../js/planDescribe.js";

const ENV = { ANTHROPIC_API_KEY: "sk-test", FIREBASE_PROJECT: "eddie-s-dashboard", ALLOWED_ORIGIN: "https://southboundcoaching.com" };
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
const token = sub => `${b64({ alg: "RS256" })}.${b64({ sub, aud: "eddie-s-dashboard" })}.sig`;
const PROFILES = { coach1: true, client1: false };
const MODELS = [{ id: "family-x-new" }, { id: "opus-newest" }, { id: "opus-older" }];

let calls, realFetch, anthropicReply;
beforeEach(() => {
    calls = [];
    anthropicReply = { status: 200, body: { content: [{ type: "tool_use", name: DESCRIBE_TOOL, input: { settings: { currentMiles: 25 }, understood: ["Runs 25 a week"], notes: [] } }], usage: { input_tokens: 900, output_tokens: 120 } } };
    realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.startsWith("https://firestore.googleapis.com/")) {
            const uid = u.split("/").pop();
            const auth = init.headers?.Authorization || "";
            // Firestore verifies the token: only the real token for that uid reads the profile.
            if (auth !== `Bearer ${token(uid)}` || !(uid in PROFILES)) return new Response("{}", { status: 403 });
            return Response.json({ fields: { isCoachApproved: { booleanValue: PROFILES[uid] } } });
        }
        if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: MODELS });
        if (u === "https://api.anthropic.com/v1/messages") return Response.json(anthropicReply.body, { status: anthropicReply.status });
        throw new Error("unexpected fetch " + u);
    };
});
afterEach(() => { globalThis.fetch = realFetch; });

const body = () => describeRequest({ description: "Sam runs 25 a week", settings: { currentMiles: 15 }, today: "2026-09-27" });
const post = (tok, payload = body(), env = ENV) => worker.fetch(new Request("https://helper.example/", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
}), env);

test("an approved coach gets the tool's answer back", async () => {
    const res = await post(token("coach1"));
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.deepEqual(out.input.understood, ["Runs 25 a week"]);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://southboundcoaching.com");
    const sent = JSON.parse(calls.find(c => c.url.endsWith("/messages")).init.body);
    assert.equal(calls.find(c => c.url.endsWith("/messages")).init.headers["x-api-key"], "sk-test");
    assert.equal(sent.model, "opus-newest", "the newest model of the family");
    assert.equal(sent.max_tokens, 2000);
    assert.deepEqual(sent.tool_choice, { type: "tool", name: DESCRIBE_TOOL }, "the answer has to use the tool");
});

test("nobody else: no token, a client, a stranger, a made-up token", async () => {
    assert.equal((await post(null)).status, 403);
    assert.equal((await post(token("client1"))).status, 403, "signed in but not a coach");
    assert.equal((await post(token("nobody"))).status, 403);
    // A token claiming to be the coach but not the real one: Firestore refuses it.
    assert.equal((await post(`${b64({ alg: "none" })}.${b64({ sub: "coach1" })}.`)).status, 403);
    assert.equal((await post("not-a-token")).status, 403);
    assert.equal(calls.filter(c => c.url.includes("anthropic")).length, 0, "the AI is never called for them");
});

test("only the one request shape, within limits", async () => {
    const coach = token("coach1");
    const b = body();
    assert.equal((await post(coach, "not json")).status, 400);
    assert.equal((await post(coach, { ...b, messages: [...b.messages, { role: "assistant", content: "x" }] })).status, 400);
    assert.equal((await post(coach, { ...b, messages: [{ role: "user", content: "x".repeat(12001) }] })).status, 400);
    assert.equal((await post(coach, { ...b, system: "x".repeat(20001) })).status, 400);
    assert.equal((await post(coach, { ...b, tools: [] })).status, 400);
    assert.equal((await post(coach, { ...b, tools: [{ ...b.tools[0], name: "Run Code!" }] })).status, 400);
    // Extra fields (a bigger output, another model, streaming) are dropped, not passed on.
    const res = await post(coach, { ...b, model: "cheap", max_tokens: 100000, stream: true, tool_choice: { type: "auto" } });
    assert.equal(res.status, 200);
    const sent = JSON.parse(calls.filter(c => c.url.endsWith("/messages")).at(-1).init.body);
    assert.deepEqual([sent.model, sent.max_tokens, sent.stream, sent.tool_choice.type], ["opus-newest", 2000, undefined, "tool"]);
});

test("setup and failures come back in plain words", async () => {
    const coach = token("coach1");
    assert.equal((await post(coach, body(), { ...ENV, ANTHROPIC_API_KEY: "" })).status, 503);
    const pinned = await post(coach, body(), { ...ENV, MODEL: "pinned-model" });
    assert.equal(JSON.parse(calls.filter(c => c.url.endsWith("/messages")).at(-1).init.body).model, "pinned-model");
    assert.equal(pinned.status, 200);
    anthropicReply = { status: 529, body: { error: { type: "overloaded_error" } } };
    const busy = await post(coach);
    assert.equal(busy.status, 429);
    assert.match((await busy.json()).message, /busy/);
    anthropicReply = { status: 200, body: { content: [{ type: "text", text: "Sure!" }] } };
    assert.equal((await post(coach)).status, 502);
    const pre = await worker.fetch(new Request("https://helper.example/", { method: "OPTIONS" }), ENV);
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get("Access-Control-Allow-Headers"), /Authorization/);
    assert.equal((await worker.fetch(new Request("https://helper.example/"), ENV)).status, 405);
});
