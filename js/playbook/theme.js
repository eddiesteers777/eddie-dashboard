// Southbound Playbook: the colours drawn on the pitch (SVG can't read CSS variables once exported).
export const C = Object.freeze({
    pitchA: "#3C7A55", pitchB: "#37714F", line: "rgba(255,255,255,.9)",
    home: "#0F2019", homeRing: "#D6B98E", homeText: "#F2EDE1",
    away: "#F2EDE1", awayRing: "#0F2019", awayText: "#0F2019",
    ball: "#fff", ballInk: "#0F2019",
    tan: "#D6B98E", tanLight: "#ECD6B0", forest: "#0F2019", white: "#fff",
    zoneFill: "rgba(214,185,142,.26)"
});
export const HEADS = Object.freeze({ white: C.white, tan: C.tanLight, forest: C.forest });
export const MARK_STYLE = Object.freeze({
    pass: { stroke: C.white, w: .6, head: "white" },
    run: { stroke: C.white, w: .6, dash: "1.6 1.1", head: "white" },
    dribble: { stroke: C.tanLight, w: .6, head: "tan" },
    arrow: { stroke: C.forest, w: .9, head: "forest" }
});
