/* ==========================================
   Southbound AI helper (Cloudflare Worker)

   A small private relay between the site and Claude (Anthropic's API),
   so the API key never sits in the public site. Used by "Describe it"
   in the Client Hub (js/planDescribeClient.js): the coach's words go in,
   plan settings come out.

   Who may use it: only a signed-in Southbound account whose profile
   says isCoachApproved. The site sends the person's Firebase sign-in
   token; this worker reads userProfiles/{uid} from Firestore WITH that
   token, so Firestore itself checks the token and the security rules
   (a forged or expired token, or a non-coach, gets nothing).

   What it accepts: one request shape only -- a system prompt, one user
   message and one tool the reply must use -- with size limits. It picks
   the model and the output limit itself, so it can't be used as a
   general-purpose Claude endpoint.

   Settings (Cloudflare -> the worker -> Settings -> Variables and Secrets):
     ANTHROPIC_API_KEY  (Secret)  the key from console.anthropic.com
     FIREBASE_PROJECT   (Text)    eddie-s-dashboard
     ALLOWED_ORIGIN     (Text)    https://southboundcoaching.com
     MODEL              (Text, optional) a Claude model ID to pin; without
                        it the newest model of MODEL_FAMILY is used
     MODEL_FAMILY       (Text, optional) default "opus"
   Setup, click by click: docs/AI_HELPER_SETUP.md.
   Tested in tests/aiHelper.test.mjs.
========================================== */

const ANTHROPIC = "https://api.anthropic.com/v1";
const LIMITS = { system: 20000, message: 12000, schema: 20000, maxTokens: 2000 };

let modelCache = { id: "", at: 0 };

function cors(env) {
    return {
        "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "https://southboundcoaching.com",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
    };
}

function reply(env, body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(env) } });
}

// The uid inside a Firebase ID token (not trusted on its own: Firestore checks the token).
function tokenUid(token) {
    try {
        const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
        return typeof payload.sub === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(payload.sub) ? payload.sub : "";
    } catch {
        return "";
    }
}

// Is this token an approved coach's? Firestore verifies the token and applies the rules.
async function isCoach(env, token) {
    const uid = tokenUid(token);
    if (!uid || !env.FIREBASE_PROJECT) return false;
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT)}/databases/(default)/documents/userProfiles/${uid}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const doc = await res.json();
    return doc?.fields?.isCoachApproved?.booleanValue === true;
}

// MODEL if set, else the newest model of the family (Anthropic lists newest first).
async function pickModel(env) {
    if (env.MODEL) return env.MODEL;
    if (modelCache.id && Date.now() - modelCache.at < 86400000) return modelCache.id;
    const res = await fetch(`${ANTHROPIC}/models?limit=100`, {
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }
    });
    if (!res.ok) throw new Error(`models ${res.status}`);
    const list = (await res.json()).data || [];
    const family = String(env.MODEL_FAMILY || "opus").toLowerCase();
    const chosen = list.find(m => String(m.id).toLowerCase().includes(family)) || list[0];
    if (!chosen) throw new Error("no models");
    modelCache = { id: chosen.id, at: Date.now() };
    return chosen.id;
}

// The one request shape this relay passes on, or null.
function checkBody(body) {
    if (!body || typeof body !== "object") return null;
    const { system, messages, tools } = body;
    if (typeof system !== "string" || !system || system.length > LIMITS.system) return null;
    if (!Array.isArray(messages) || messages.length !== 1) return null;
    const [msg] = messages;
    if (msg?.role !== "user" || typeof msg.content !== "string" || !msg.content || msg.content.length > LIMITS.message) return null;
    if (!Array.isArray(tools) || tools.length !== 1) return null;
    const [tool] = tools;
    if (typeof tool?.name !== "string" || !/^[a-z_]{1,40}$/.test(tool.name)) return null;
    if (typeof tool.description !== "string" || tool.description.length > 500) return null;
    if (!tool.input_schema || typeof tool.input_schema !== "object" || JSON.stringify(tool.input_schema).length > LIMITS.schema) return null;
    return {
        system,
        messages: [{ role: "user", content: msg.content }],
        tools: [{ name: tool.name, description: tool.description, input_schema: tool.input_schema }],
        tool_choice: { type: "tool", name: tool.name }
    };
}

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
        if (request.method !== "POST") return reply(env, { error: "method" }, 405);
        if (!env.ANTHROPIC_API_KEY) return reply(env, { error: "not-set-up", message: "The AI key isn't set on the helper yet." }, 503);

        const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        let allowed = false;
        try { allowed = Boolean(token) && await isCoach(env, token); } catch { allowed = false; }
        if (!allowed) return reply(env, { error: "not-allowed", message: "Only a signed-in Southbound coach can use this." }, 403);

        let body;
        try { body = checkBody(await request.json()); } catch { body = null; }
        if (!body) return reply(env, { error: "bad-request", message: "That request isn't one this helper answers." }, 400);

        let model;
        try { model = await pickModel(env); } catch { return reply(env, { error: "ai-unavailable", message: "Couldn't reach the AI. Try again in a minute." }, 502); }

        const res = await fetch(`${ANTHROPIC}/messages`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model, max_tokens: LIMITS.maxTokens, ...body })
        });
        if (!res.ok) {
            const status = res.status === 429 || res.status === 529 ? 429 : 502;
            return reply(env, { error: status === 429 ? "busy" : "ai-error", message: status === 429 ? "The AI is busy. Try again in a minute." : "The AI couldn't answer that. Try again." }, status);
        }
        const data = await res.json();
        const use = (data.content || []).find(c => c.type === "tool_use" && c.name === body.tools[0].name);
        if (!use) return reply(env, { error: "no-answer", message: "The AI didn't fill anything in. Try describing it again." }, 502);
        return reply(env, { input: use.input, usage: data.usage || null });
    }
};
