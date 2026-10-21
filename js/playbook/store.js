// Southbound Playbook: where everything is kept (this browser; also the account's private
// sync doc when signed in, see cloud.js).
export const KEYS = Object.freeze({
    board: "sb-playbook-board",
    boardId: "sb-playbook-board-id",
    library: "sb-playbook-boards",
    drills: "sb-playbook-drills",
    practice: "sb-playbook-practice",
    practiceId: "sb-playbook-practice-id",
    practices: "sb-playbook-practices",
    roster: "sb-playbook-roster",
    team: "sb-playbook-team",
    theme: "sb-playbook-theme"
});

// The first version lived under other names. Copy anything found to the new names once.
const OLD = {
    "calera-board-current": KEYS.board, "calera-board-current-id": KEYS.boardId, "calera-board-library": KEYS.library,
    "calera-board-drills": KEYS.drills, "calera-board-practice-current": KEYS.practice, "calera-board-practice-id": KEYS.practiceId,
    "calera-board-practices": KEYS.practices, "calera-board-roster": KEYS.roster
};
export function migrateOldKeys() {
    try {
        for (const [from, to] of Object.entries(OLD)) {
            const v = localStorage.getItem(from);
            if (v == null) continue;
            if (localStorage.getItem(to) == null) localStorage.setItem(to, v);
            localStorage.removeItem(from);
        }
    } catch { /* storage unavailable: the tool still works for this visit */ }
}

// Light or dark, remembered on this device. Dark is the Southbound default.
export function applyTheme() {
    let t = "dark";
    try { t = localStorage.getItem(KEYS.theme) === "light" ? "light" : "dark"; } catch {}
    document.documentElement.classList.toggle("pb-light", t === "light");
    return t;
}
export function toggleTheme() {
    const next = document.documentElement.classList.contains("pb-light") ? "dark" : "light";
    try { localStorage.setItem(KEYS.theme, next); } catch {}
    return applyTheme();
}

// Every key the Playbook keeps, for "Clear everything on this device".
export function clearAll() {
    try { for (const k of Object.values(KEYS)) if (k !== KEYS.theme) localStorage.removeItem(k); } catch {}
}
