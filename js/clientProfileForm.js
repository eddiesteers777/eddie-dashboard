/* ==========================================
   Southbound — Client profile form

   One form for both sides of clientRecords/{uid}:
     mode "client"  profile.html -- the client's own intake, phrased to them
     mode "coach"   Client Hub -> Profile -- the coach viewing/correcting it
   Fields come from js/clientRecordSchema.js; saving goes through
   js/clientRecords.js (firestore.rules checks the rest).

   mountProfileForm(container, { clientUid, record, mode, prefill, onSaved })
========================================== */

import { SECTIONS, DAYS } from "./clientRecordSchema.js";
import { saveClientRecord } from "./clientRecords.js";
import { toast } from "./ui.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fieldHtml(field, value, mode, whoTrains) {
    const label = mode === "client"
        ? (whoTrains === "child" && field.askChild ? field.askChild : field.ask)
        : field.label;
    const id = `cp-${field.key}`;
    const hint = field.hint && mode === "client" ? `<span class="cp-hint">${esc(field.hint)}</span>` : "";
    const required = field.required ? ` <span class="cp-required">required</span>` : "";
    const hidden = field.when && field.when !== whoTrains ? " hidden" : "";
    let control;

    switch (field.type) {
        case "choice":
            control = `<div class="cp-choice" role="radiogroup" aria-label="${esc(label)}">${field.options.map(o => `
                <label class="cp-choice-option"><input type="radio" name="${field.key}" value="${o.value}" ${value === o.value ? "checked" : ""}><span>${esc(o.label)}</span></label>`).join("")}
            </div>`;
            break;
        case "select":
            control = `<select id="${id}" name="${field.key}" class="cp-input">
                <option value="">Choose…</option>
                ${field.options.map(o => `<option value="${o.value}" ${value === o.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
            </select>`;
            break;
        case "days":
            control = `<div class="cp-days" role="group" aria-label="${esc(label)}">${DAYS.map(d => `
                <label class="cp-day"><input type="checkbox" name="${field.key}" value="${d.value}" ${(value || []).includes(d.value) ? "checked" : ""}><span>${d.label}</span></label>`).join("")}
            </div>`;
            break;
        case "textarea":
            control = `<textarea id="${id}" name="${field.key}" class="cp-input" rows="3" maxlength="${field.max}">${esc(value || "")}</textarea>`;
            break;
        case "year":
            control = `<input id="${id}" name="${field.key}" class="cp-input cp-short" type="number" inputmode="numeric" min="1920" max="${new Date().getFullYear()}" placeholder="e.g. 1994" value="${value ?? ""}">`;
            break;
        case "miles":
            control = `<input id="${id}" name="${field.key}" class="cp-input cp-short" type="number" inputmode="decimal" min="0" max="500" step="0.5" value="${value ?? ""}">`;
            break;
        case "date":
            control = `<input id="${id}" name="${field.key}" class="cp-input cp-short" type="date" value="${esc(value || "")}">`;
            break;
        case "tel":
            control = `<input id="${id}" name="${field.key}" class="cp-input" type="tel" autocomplete="tel" maxlength="${field.max}" value="${esc(value || "")}">`;
            break;
        default:
            control = `<input id="${id}" name="${field.key}" class="cp-input" type="text" maxlength="${field.max}" value="${esc(value || "")}">`;
    }

    const labelTag = ["choice", "days"].includes(field.type) ? "span" : `label for="${id}"`;
    return `
        <div class="cp-field" data-field="${field.key}" data-when="${field.when || ""}"${hidden}>
            <${labelTag} class="cp-label">${esc(label)}${required}</${labelTag.split(" ")[0]}>
            ${control}
            ${hint}
        </div>`;
}

function collect(form) {
    const values = {};
    const data = new FormData(form);
    for (const section of SECTIONS) {
        for (const field of section.fields) {
            values[field.key] = field.type === "days" ? data.getAll(field.key) : (data.get(field.key) ?? "");
        }
    }
    return values;
}

export function mountProfileForm(container, { clientUid, record = null, mode = "client", prefill = {}, onSaved } = {}) {
    let current = record;
    const start = { ...prefill, ...(record || {}) };
    const whoTrains = start.whoTrains === "child" ? "child" : "self";

    container.innerHTML = `
        <form class="cp-form" novalidate>
            ${SECTIONS.map(section => `
                <section class="cp-section">
                    <h2>${esc(mode === "coach" && section.title === "About you" ? "About them" : section.title)}</h2>
                    ${section.fields.map(field => fieldHtml(field, start[field.key], mode, whoTrains)).join("")}
                </section>`).join("")}
            <div class="cp-actions">
                <button type="submit" class="clients-btn-primary">${mode === "client" ? "Save" : "Save profile"}</button>
                <span class="clients-msg" role="status" hidden></span>
            </div>
        </form>`;

    const form = container.querySelector("form");
    const msg = form.querySelector(".clients-msg");

    // Show the name fields that fit "me" vs "my child", and reword the
    // birth-year question on the client's form.
    form.addEventListener("change", event => {
        if (event.target.name !== "whoTrains") return;
        const who = event.target.value;
        form.querySelectorAll("[data-when]").forEach(el => {
            el.hidden = Boolean(el.dataset.when) && el.dataset.when !== who;
        });
        if (mode === "client") {
            const field = SECTIONS[0].fields.find(f => f.key === "birthYear");
            form.querySelector('[data-field="birthYear"] .cp-label').textContent = who === "child" ? field.askChild : field.ask;
        }
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const values = collect(form);
        msg.hidden = true;
        if (!String(values.primaryGoal || "").trim()) {
            msg.textContent = "Add your main goal first -- it's the one thing that's required.";
            if (mode === "coach") msg.textContent = "Add a main goal first.";
            msg.className = "clients-msg clients-msg-error";
            msg.hidden = false;
            form.querySelector('[name="primaryGoal"]').focus();
            return;
        }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            current = await saveClientRecord(clientUid, values, current);
            toast(mode === "client" ? "Profile saved. Your coach can see it now." : "Profile saved.");
            onSaved?.(current);
        } catch (error) {
            console.error("Saving profile failed:", error);
            const denied = error?.code === "permission-denied";
            msg.textContent = denied
                ? "Couldn't save -- the profile isn't switched on yet. Try again later."
                : "Couldn't save that. Check your connection and try again.";
            msg.className = "clients-msg clients-msg-error";
            msg.hidden = false;
        } finally {
            btn.disabled = false;
        }
    });

    return { form };
}
