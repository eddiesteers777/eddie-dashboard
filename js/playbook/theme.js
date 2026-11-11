// Southbound Playbook: the colours drawn on the pitch (SVG can't read CSS variables once exported).
export const C = Object.freeze({
    pitchA: "#2A4A52", pitchB: "#26444C", line: "rgba(255,255,255,.78)",
    home: "#D2AD62", homeRing: "#8A6E2F", homeText: "#1B1608",
    away: "#8FC3E8", awayRing: "#2C5D80", awayText: "#0E2433",
    ball: "#fff", ballInk: "#0F2019",
    tan: "#D6B98E", tanLight: "#ECD6B0", ice: "#C5E2F6", forest: "#0F2019", white: "#fff",
    zoneFill: "rgba(214,185,142,.26)"
});
export const HEADS = Object.freeze({ white: C.white, tan: C.tanLight, forest: C.forest, ice: C.ice });
export const MARK_STYLE = Object.freeze({
    pass: { stroke: C.white, w: .6, head: "white" },
    run: { stroke: C.white, w: .6, dash: "1.6 1.1", head: "white" },
    dribble: { stroke: C.tanLight, w: .6, head: "tan" },
    arrow: { stroke: C.ice, w: .9, head: "ice" }
});
