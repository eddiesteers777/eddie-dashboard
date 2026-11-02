/* ==========================================
   Habit scenes: the picture each habit plays inside the check disc
   when you tick it (the quick pop in js/celebrate.js).

   Pure data, no DOM. Eddie picked each one from mock-ups on
   2026-11-02. A habit gets a scene from its drawn icon
   (habitIconId); any habit without one keeps the plain pop.
   Styles: css/habitScenes.css (every rule scoped under
   .sc-<name>). "ckAt" is when the scene is over and the check
   draws in, so the check never shows early.
========================================== */

export const HABIT_SCENES = {
    water: { icons: ["water"], kicker: "Water goal hit", ckAt: 1.9, html: "<div class=\"sc_fill\"><i class=\"sc_w\"></i><i class=\"sc_w sc_w2\"></i></div> <i class=\"sc_drop\" style=\"--x:20%;--h:80px;--i:0\"></i><i class=\"sc_drop\" style=\"--x:42%;--h:90px;--i:1\"></i><i class=\"sc_drop\" style=\"--x:62%;--h:78px;--i:2\"></i><i class=\"sc_drop\" style=\"--x:78%;--h:84px;--i:3\"></i><i class=\"sc_drop\" style=\"--x:50%;--h:92px;--i:4\"></i>" },
    candle: { icons: ["pray"], kicker: "Prayer done", ckAt: 2.0, html: "<i class=\"sc_halo\"></i> <i class=\"sc_wick\"></i><svg class=\"sc_flame\" viewBox=\"0 0 34 56\"><path d=\"M17 2C24 16 32 26 32 38a15 15 0 0 1-30 0C2 26 10 18 17 2z\"/><path class=\"sc_in\" d=\"M17 28c4 6 7 10 7 15a7 7 0 0 1-14 0c0-5 3-9 7-15z\"/></svg> <i class=\"sc_ember\" style=\"--x:35%;--dx:-14px;--i:0\"></i><i class=\"sc_ember\" style=\"--x:52%;--dx:10px;--i:1\"></i><i class=\"sc_ember\" style=\"--x:62%;--dx:18px;--i:2\"></i><i class=\"sc_ember\" style=\"--x:44%;--dx:-6px;--i:3\"></i>" },
    ribbon: { icons: ["bible"], kicker: "Bible done", ckAt: 2.0, html: "<span class=\"sc_bk\"><i class=\"sc_sp\"></i><b class=\"sc_pg sc_l\"><i style=\"--i:0\"></i><i style=\"--i:1\"></i><i style=\"--i:2\"></i><i style=\"--i:3\"></i></b><b class=\"sc_pg sc_r\"><i style=\"--i:4\"></i><i style=\"--i:5\"></i><i style=\"--i:6\"></i><i style=\"--i:7\"></i></b></span><i class=\"sc_rib\"></i><span class=\"sc_mini\"><svg viewBox=\"0 0 24 24\"><polyline points=\"5 12.5 10 17.5 19 7.5\"/></svg></span>" },
    lap: { icons: ["run", "steps", "bike", "swim"], kicker: "Training complete", ckAt: 1.9, html: "<svg class=\"sc_lap\" viewBox=\"0 0 160 160\"><circle pathLength=\"100\" cx=\"80\" cy=\"80\" r=\"77\"/></svg><span class=\"sc_orb2\"><i></i></span>" },
    plates: { icons: ["strength", "workout", "core"], kicker: "Strength done", ckAt: 2.0, html: "<i class=\"sc_pole\"></i><i class=\"sc_pl\" style=\"--w:70px;--y:22px;--c:#EAF3FB;--i:0\"></i><i class=\"sc_pl\" style=\"--w:56px;--y:8px;--c:#9ec3e3;--i:1\"></i><i class=\"sc_pl\" style=\"--w:42px;--y:-6px;--c:#6FA3D2;--i:2\"></i><i class=\"sc_pl\" style=\"--w:28px;--y:-20px;--c:#fff;--i:3\"></i>" },
    flower: { icons: ["stretch"], kicker: "Mobility done", ckAt: 2.0, html: "<div class=\"sc_fl\"><i class=\"sc_pt\" style=\"--a:0deg;--i:0\"></i><i class=\"sc_pt\" style=\"--a:45deg;--i:1\"></i><i class=\"sc_pt\" style=\"--a:90deg;--i:2\"></i><i class=\"sc_pt\" style=\"--a:135deg;--i:3\"></i><i class=\"sc_pt\" style=\"--a:180deg;--i:4\"></i><i class=\"sc_pt\" style=\"--a:225deg;--i:5\"></i><i class=\"sc_pt\" style=\"--a:270deg;--i:6\"></i><i class=\"sc_pt\" style=\"--a:315deg;--i:7\"></i></div><i class=\"sc_cen\"></i>" },
    gauge: { icons: ["protein"], kicker: "Protein goal hit", ckAt: 2.1, html: "<div class=\"sc_gaug\"><svg viewBox=\"0 0 100 62\"><path class=\"sc_arc\" d=\"M10 52A40 40 0 0 1 90 52\"/><path class=\"sc_tick\" d=\"M10 52h8M90 52h-8M50 12v8M22 24l6 5M78 24l-6 5\"/><path class=\"sc_nd\" d=\"M50 52L50 18\"/><circle cx=\"50\" cy=\"52\" r=\"5\" fill=\"#fff\"/></svg></div>" },
    moon: { icons: ["sleep"], kicker: "Sleep goal hit", ckAt: 2.1, html: "<div class=\"sc_moon\"></div><div class=\"sc_stars\"><i style=\"left:18px;top:30px;--i:0\"></i><i style=\"left:100px;top:24px;--i:1\"></i><i style=\"left:108px;top:86px;--i:2\"></i><i style=\"left:24px;top:92px;--i:3\"></i><i style=\"left:70px;top:12px;--i:4\"></i></div><i class=\"sc_sh\"></i>" },
    pages: { icons: ["read"], kicker: "Reading done", ckAt: 2.0, html: "<div class=\"sc_flip\"><i class=\"sc_base\"></i><i class=\"sc_base sc_r\"></i><i class=\"sc_pgf\" style=\"--i:0\"></i><i class=\"sc_pgf\" style=\"--i:1\"></i><i class=\"sc_pgf\" style=\"--i:2\"></i><i class=\"sc_pgf\" style=\"--i:3\"></i><i class=\"sc_pgf\" style=\"--i:4\"></i><i class=\"sc_pgf\" style=\"--i:5\"></i><i class=\"sc_pgf\" style=\"--i:6\"></i><i class=\"sc_pgf\" style=\"--i:7\"></i></div>" },
    hearts: { icons: ["love"], kicker: "Time together", ckAt: 2.3, html: "<i class=\"sc_ht sc_h1\" style=\"--w:44px;--c:#9ec3e3\"><svg viewBox=\"0 0 24 24\"><path d=\"M12 21C5 15.5 2 12 2 8.5A5 5 0 0 1 12 6a5 5 0 0 1 10 2.5C22 12 19 15.5 12 21Z\"/></svg></i><i class=\"sc_ht sc_h2\" style=\"--w:44px;--c:#EAF3FB\"><svg viewBox=\"0 0 24 24\"><path d=\"M12 21C5 15.5 2 12 2 8.5A5 5 0 0 1 12 6a5 5 0 0 1 10 2.5C22 12 19 15.5 12 21Z\"/></svg></i><i class=\"sc_ht sc_hbig\" style=\"--w:70px;--c:#fff;opacity:0\"><svg viewBox=\"0 0 24 24\"><path d=\"M12 21C5 15.5 2 12 2 8.5A5 5 0 0 1 12 6a5 5 0 0 1 10 2.5C22 12 19 15.5 12 21Z\"/></svg></i>" },
};

const BY_ICON = new Map();
for (const [name, s] of Object.entries(HABIT_SCENES)) for (const id of s.icons) BY_ICON.set(id, name);

// The scene for a drawn icon id ("water", "pray"...), or null.
export function sceneForIcon(iconId) {
    const name = BY_ICON.get(String(iconId || ""));
    return name ? { name, ...HABIT_SCENES[name] } : null;
}
