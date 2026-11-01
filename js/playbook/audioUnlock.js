// Makes Web Audio beeps work on iPhone Safari. iOS keeps an AudioContext silent until it is started
// from a tap, and mutes it while the ring/silent switch is on, unless the page also plays media
// (an <audio> element) or sets the audio session to "playback". Call from inside a tap handler.
// Returns { ctx, running }. Pure browser glue: it cannot be unit tested, so check it on a real phone.

function silentWavUrl() {
    const n = 800, bytes = new Uint8Array(44 + n * 2), v = new DataView(bytes.buffer);
    const s = (o, t) => { for (let i = 0; i < t.length; i++) bytes[o + i] = t.charCodeAt(i); };
    s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

let keeper = null;
export async function unlockAudio() {
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
    try {
        if (!keeper) { keeper = new Audio(silentWavUrl()); keeper.loop = true; keeper.setAttribute("playsinline", ""); }
        await keeper.play();
    } catch { /* blocked: the context may still run */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return { ctx: null, running: false };
    const ctx = new AC();
    try { await ctx.resume(); } catch {}
    try { // a one-sample buffer in the tap wakes iOS' audio output
        const src = ctx.createBufferSource(); src.buffer = ctx.createBuffer(1, 1, 22050); src.connect(ctx.destination); src.start(0);
    } catch {}
    return { ctx, running: ctx.state === "running" };
}
export function releaseAudio(ctx) {
    try { ctx && ctx.close(); } catch {}
    try { keeper && keeper.pause(); } catch {}
}
// One plain line about the audio setup, shown after Test sound so a phone problem can be read off the screen.
export function audioReport(u) {
    const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    let session = "n/a"; try { if (navigator.audioSession) session = navigator.audioSession.type; } catch {}
    return `Sound check (audio-v2) · context: ${u.ctx ? u.ctx.state : "none"} · session: ${session} · home-screen app: ${standalone ? "yes" : "no"} · silent switch can't be read by web pages`;
}
export const SOUND_HINT = "No sound? On iPhone, turn the silent switch off (orange showing means muted) and turn the volume up.";
