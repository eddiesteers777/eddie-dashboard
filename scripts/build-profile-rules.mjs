// Writes the client profile rule (validClientRecord in firestore.rules)
// from the profile schema (js/clientRecordSchema.js), so the two can't
// drift apart. Run after changing a field or a choice:
//
//     node scripts/build-profile-rules.mjs
//
// Why generated: the profile has ~50 fields, and Firestore stops at 1,000
// checks per save. One check per field (and every item of every choice
// list counted separately) went over, so every choice, list and date is
// joined into one string and checked by one pattern, and text fields get
// the cheapest length check. tests/clientRecordSchema.test.mjs fails when
// firestore.rules doesn't hold exactly what this writes.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FIELDS, META_KEYS } from "../js/clientRecordSchema.js";

const BEGIN = "    // BEGIN generated profile rule (scripts/build-profile-rules.mjs)";
const END = "    // END generated profile rule";

const esc = v => v.replace(/[.+*?()[\]{}|^$\\]/g, m => "\\\\" + m);
const alt = field => field.options.map(o => esc(o.value)).join("|");
const DAY_VALUES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// One segment of the joined string per field: [expression, pattern].
function segment(field) {
    const k = field.key;
    switch (field.type) {
        case "choice":
        case "select":
            return [`d.get("${k}", "")`, `(${alt(field)})?`];
        case "multi":
        case "health":
            return [`d.get("${k}", []).join(",")`, `((${alt(field)})(,(${alt(field)}))*)?`];
        case "days":
            return [`d.get("${k}", []).join(",")`, `((${DAY_VALUES.join("|")})(,(${DAY_VALUES.join("|")}))*)?`];
        case "date":
            return [`d.get("${k}", "")`, "([0-9]{4}-[0-9]{2}-[0-9]{2})?"];
        default:
            return null;
    }
}

// Numbers: null, or a number of the right type in range.
function numberCheck(field) {
    const v = `d.get("${field.key}", null)`;
    if (field.type === "year") return `(${v} == null || (${v} is int && ${v} >= 1920 && ${v} <= 2100))`;
    if (field.type === "count") return `(${v} == null || (${v} is int && ${v} >= 0 && ${v} <= ${field.max}))`;
    if (field.type === "miles") return `(${v} == null || (${v} is number && ${v} >= 0 && ${v} <= ${field.cap || 500}))`;
    return null;
}

const TEXT_TYPES = ["text", "textarea", "tel"];

export function profileRule() {
    const keys = [...FIELDS.map(f => f.key), ...META_KEYS];
    const segments = FIELDS.map(segment).filter(Boolean);
    const joined = segments.map(([expr]) => expr).join(` + ";"\n          + `);
    const pattern = segments.map(([, p]) => p).join(";");
    const numbers = FIELDS.map(numberCheck).filter(Boolean);
    const texts = FIELDS.filter(f => TEXT_TYPES.includes(f.type)).map(f => `(d.get("${f.key}", "") + "").size() <= ${f.max}`);
    const pairs = (list, n) => {
        const out = [];
        for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n).join(" && "));
        return out.map(line => `        && ${line}`).join("\n");
    };
    return `${BEGIN}
    // The client profile (clientRecords): only its own keys; every choice,
    // list and date joined into one string and checked by one pattern;
    // numbers typed and in range; text within its length; honest who/when.
    function validClientRecord(d, clientUid) {
      return d.keys().join(",").matches('^((${keys.join("|")})(,|$))*$')
        && d.clientUid == clientUid
        && d.updatedBy == request.auth.uid
        && d.updatedAt == request.time
        && (${joined}).matches(
          '^${pattern}$')
${numbers.map(n => `        && ${n}`).join("\n")}
${pairs(texts, 2)}
        && (!("intakeComplete" in d) || d.intakeComplete is bool)
        && (!("confirmedAt" in d) || confirmedAtOk(d.confirmedAt))
        && (!("askedAt" in d) || askedAtOk(d.askedAt))
        && (!("healthCheckedAt" in d) || (d.healthCheckedAt is int && d.healthCheckedAt > 0
            && d.healthCheckedAt < request.time.toMillis() + 31536000000))
        && (!("intakeCompletedAt" in d) || d.intakeCompletedAt == request.time
            || (resource != null && "intakeCompletedAt" in resource.data
                && d.intakeCompletedAt == resource.data.intakeCompletedAt));
    }
${END}`;
}

export const RULES_PATH = fileURLToPath(new URL("../firestore.rules", import.meta.url));

export function currentProfileRule(rules) {
    const a = rules.indexOf(BEGIN);
    const b = rules.indexOf(END);
    return a < 0 || b < 0 ? "" : rules.slice(a, b + END.length);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const rules = readFileSync(RULES_PATH, "utf8");
    const current = currentProfileRule(rules);
    if (!current) throw new Error(`firestore.rules has no "${BEGIN.trim()}" block`);
    writeFileSync(RULES_PATH, rules.replace(current, () => profileRule()));   // a function: "$'" in the rule is text, not a replacement code
    console.log("firestore.rules: profile rule updated");
}
