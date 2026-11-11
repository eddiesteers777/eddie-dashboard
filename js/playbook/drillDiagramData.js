// Starter drill diagrams, matched to the starter drills by name (see drillDiagramModel.js).
// Grid is 100 x 70. a = your team, d = defenders, k = keeper, n = neutral, c = cones, g = goals [x,y,w,h].
// Marks: ["pass"|"run"|"dribble"|"press", from, to] or [kind, from, control, to] for a curve.
import { normalizeDiagram } from "./drillDiagramModel.js";

const square = (x, y, w, h) => [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
const TOP = [38, 2, 24, 3], BOTTOM = [38, 65, 24, 3];

const RAW = {
    "dynamic ball warm-up": {
        z: [24, 8, 52, 54], c: square(24, 8, 52, 54), label: "30 x 30 yd",
        a: [[34, 20, 1], [58, 18, 2], [68, 36, 3], [40, 46, 4], [60, 52, 5], [30, 36, 6]],
        steps: [
            { say: "Everyone dribbles in the box, ball close, head up.", m: [["dribble", [34, 24], [30, 34]], ["dribble", [58, 22], [66, 28]], ["dribble", [60, 48], [50, 44]]] },
            { say: "Coach calls a move: turn, sole roll, toe tap.", m: [["dribble", [40, 42], [34, 30], [44, 24]], ["dribble", [68, 40], [62, 46], [72, 50]]] },
            { say: "Jog, then pass to a partner and find new space.", m: [["pass", [38, 20], [54, 18]], ["pass", [64, 36], [66, 48]]] }
        ]
    },
    "passing squares": {
        z: [36, 20, 28, 28], c: square(36, 20, 28, 28), label: "15 yd", ball: [50, 20],
        a: [[36, 20, 1], [64, 20, 2], [64, 48, 3], [36, 48, 4]],
        steps: [
            { say: "Pass across to the next corner and follow your pass.", m: [["pass", [41, 20], [59, 20]]] },
            { say: "Keep going round. Two touches, then one touch.", m: [["pass", [64, 25], [64, 43]]] },
            { say: "Switch direction every 90 seconds.", m: [["run", [32, 26], [28, 34], [32, 43]]] }
        ]
    },
    "triangle passing and moving": {
        c: [[28, 54], [72, 54], [50, 14]], label: "10 yd sides", ball: [28, 49],
        a: [[28, 54, 1], [72, 54, 2], [50, 14, 3]],
        steps: [
            { say: "Pass to a teammate.", m: [["pass", [34, 54], [66, 54]]] },
            { say: "Move to a new spot to receive. Check your shoulder first.", m: [["run", [24, 48], [16, 34], [26, 22]]] },
            { say: "Pass again. Rotate who starts each minute.", m: [["pass", [70, 48], [54, 20]]] }
        ]
    },
    "receiving gates": {
        c: [[28, 22], [38, 22], [60, 22], [70, 22], [44, 40], [54, 40]], z: [14, 8, 72, 54],
        a: [[33, 36, 1], [33, 10, 2], [65, 36, 3], [65, 10, 4]], ball: [33, 32],
        steps: [
            { say: "Pass through a gate to your partner.", m: [["pass", [33, 32], [33, 14]]] },
            { say: "Clean first touch, then dribble out of the gate.", m: [["dribble", [33, 13], [46, 9]]] },
            { say: "Swap roles after each rep. Use every gate.", m: [["pass", [65, 32], [65, 14]]] }
        ]
    },
    "wall pass 1-2 combos": {
        ball: [30, 52], g: [TOP],
        a: [[30, 56, 1], [62, 38, 2]], d: [[44, 40]],
        steps: [
            { say: "Pass to the wall player.", m: [["pass", [34, 53], [58, 41]]] },
            { say: "Run past the defender into space.", m: [["run", [30, 50], [32, 34], [46, 24]]] },
            { say: "Wall player returns the ball into your path. Finish.", m: [["pass", [58, 37], [48, 26]], ["dribble", [48, 22], [50, 8]]] }
        ]
    },
    "cone dribbling course": {
        c: [[26, 40], [38, 30], [50, 40], [62, 30], [74, 40]], label: "slalom", ball: [10, 35],
        a: [[8, 35, 1]],
        steps: [
            { say: "Weave through the cones. Close touches.", m: [["dribble", [12, 35], [32, 48], [44, 34]], ["dribble", [44, 34], [56, 24], [68, 34]]] },
            { say: "Come back using the outside of the foot.", m: [["dribble", [78, 44], [50, 56], [14, 44]]] },
            { say: "Sprint the last ten yards.", m: [["run", [76, 34], [90, 34]]] }
        ]
    },
    "1v1 to goal": {
        g: [TOP], ball: [50, 54], a: [[50, 58, 1]], d: [[50, 30]], n: [[26, 62, "S"]],
        steps: [
            { say: "Server plays the ball in. Attacker drives at the defender.", m: [["dribble", [50, 54], [50, 40]]] },
            { say: "Beat the defender on one side. Change speed.", m: [["dribble", [50, 38], [36, 32], [40, 20]]] },
            { say: "Finish before the defender recovers.", m: [["pass", [40, 18], [46, 7]]] }
        ]
    },
    "finishing circuit": {
        g: [TOP], c: [[34, 46], [44, 36]], ball: [24, 56],
        a: [[24, 58, 1], [76, 30, 2]], k: [[50, 7, "GK"]],
        steps: [
            { say: "Dribble through the two cones.", m: [["dribble", [24, 54], [36, 50], [44, 41]]] },
            { say: "Play to the server and run onto the return pass.", m: [["pass", [46, 36], [72, 31]], ["run", [46, 34], [56, 28], [58, 24]]] },
            { say: "Shoot first time.", m: [["pass", [76, 28], [60, 24]], ["pass", [58, 22], [52, 9]]] }
        ]
    },
    "crossing and finishing": {
        g: [TOP], ball: [88, 54], k: [[50, 7, "GK"]],
        a: [[88, 58, 1], [44, 30, 2], [58, 32, 3]],
        steps: [
            { say: "Winger dribbles down the touchline.", m: [["dribble", [88, 52], [88, 24]]] },
            { say: "Strikers split: one near post, one far post.", m: [["run", [44, 28], [42, 18], [46, 12]], ["run", [58, 30], [62, 22], [58, 13]]] },
            { say: "Cross early and finish first time.", m: [["pass", [86, 22], [70, 10], [60, 13]]] }
        ]
    },
    "1v1 defending channel": {
        z: [34, 8, 32, 54], c: square(34, 8, 32, 54), ball: [50, 46],
        a: [[50, 50, 1]], d: [[50, 14]], n: [[50, 64, "S"]],
        steps: [
            { say: "Server plays in. Defender closes down fast.", m: [["press", [50, 18], [50, 38]]] },
            { say: "Slow down, get side-on, and jockey.", m: [["press", [50, 40], [44, 46]]] },
            { say: "Force the attacker wide. Attacker tries to cross the end line.", m: [["dribble", [50, 44], [60, 36], [62, 12]]] }
        ]
    },
    "4v2 rondo": {
        z: [30, 16, 40, 38], c: square(30, 16, 40, 38), label: "12 x 12 yd", ball: [36, 16],
        a: [[30, 16, 1], [70, 16, 2], [70, 54, 3], [30, 54, 4]], d: [[46, 32], [54, 38]],
        steps: [
            { say: "Four outside players keep the ball.", m: [["pass", [35, 16], [65, 16]]] },
            { say: "Pass around, then across. Two touches.", m: [["pass", [70, 21], [70, 49]]] },
            { say: "Two in the middle win it, then swap in.", m: [["press", [48, 34], [40, 22]]] }
        ]
    },
    "possession 5v5 + 2 neutrals": {
        z: [20, 8, 60, 54], c: square(20, 8, 60, 54),
        a: [[34, 20, 1], [60, 18, 2], [66, 42, 3], [40, 48, 4], [52, 32, 5]],
        d: [[46, 24], [58, 30], [48, 42], [62, 52], [34, 36]], n: [[20, 35, "N"], [80, 35, "N"]], ball: [34, 25],
        steps: [
            { say: "Five v five. Keep the ball in the box.", m: [["pass", [38, 21], [56, 19]]] },
            { say: "Neutrals always play for the team with the ball.", m: [["pass", [62, 22], [76, 34]]] },
            { say: "Count passes. Eight in a row scores a point.", m: [["pass", [78, 38], [70, 44]]] }
        ]
    },
    "transition game (win it, go)": {
        g: [TOP, BOTTOM], z: [10, 8, 80, 54],
        a: [[38, 46, 1], [62, 42, 2], [50, 28, 3]], d: [[44, 20], [58, 16], [50, 36]], ball: [38, 41],
        steps: [
            { say: "Gold team attacks the top goal.", m: [["pass", [42, 44], [58, 43]], ["run", [50, 30], [52, 24]]] },
            { say: "Lose it? Everyone reacts the second it turns over.", m: [["press", [50, 34], [58, 40]]] },
            { say: "Ice team wins it and counters at the bottom goal.", m: [["run", [44, 22], [34, 40], [30, 58]]] }
        ]
    },
    "counter-attack 3v2 + recover": {
        g: [TOP], ball: [50, 46],
        a: [[30, 50, 1], [50, 52, 2], [70, 50, 3]], d: [[42, 24], [58, 24]], k: [[50, 7, "GK"]], n: [[84, 44, "R"]],
        steps: [
            { say: "Three attackers go at two defenders. Play quickly.", m: [["run", [30, 46], [30, 34]], ["run", [70, 46], [70, 34]], ["pass", [50, 47], [50, 32]]] },
            { say: "A third defender starts from halfway and sprints back.", m: [["press", [80, 42], [66, 30]]] },
            { say: "Finish before the recovering defender arrives.", m: [["pass", [32, 30], [46, 10]]] }
        ]
    },
    "build-up from the back": {
        g: [BOTTOM], z: [10, 6, 80, 58],
        k: [[50, 62, "GK"]], a: [[30, 50, 1], [70, 50, 2], [50, 36, 3], [18, 28, 4]],
        d: [[44, 42], [62, 40], [30, 36]], ball: [50, 57],
        steps: [
            { say: "Keeper plays out to a centre back.", m: [["pass", [47, 59], [33, 52]]] },
            { say: "Open up wide. The middle player shows for the ball.", m: [["run", [50, 34], [46, 32]], ["pass", [34, 49], [20, 31]]] },
            { say: "Play through or around the first line of pressure.", m: [["pass", [20, 28], [46, 34]]] }
        ]
    },
    "pressing triggers 6v6": {
        z: [8, 6, 84, 58], c: square(8, 6, 84, 58),
        a: [[30, 36, 1], [46, 50, 2]], d: [[64, 26], [78, 42], [62, 56]], ball: [36, 36],
        steps: [
            { say: "Trigger: a bad touch or a pass back.", m: [["pass", [34, 38], [43, 48]]] },
            { say: "Closest player presses. The rest squeeze together.", m: [["press", [62, 29], [52, 45]], ["press", [76, 44], [58, 48]], ["press", [60, 56], [53, 54]]] },
            { say: "Stay compact. Win it in their half.", m: [["pass", [44, 47], [34, 40]], ["press", [54, 46], [40, 42]]] }
        ]
    },
    "corner kick routines": {
        g: [[30, 2, 40, 3]], k: [[50, 9, "GK"]], ball: [94, 7],
        a: [[93, 9, 1], [36, 30, 2], [62, 32, 3], [50, 44, 4]], d: [[38, 18], [50, 21], [62, 18]],
        steps: [
            { say: "Near post run pulls a defender away.", m: [["run", [36, 27], [36, 20], [42, 13]]] },
            { say: "Far post run, and a late runner from the top of the box.", m: [["run", [62, 29], [68, 20], [60, 12]], ["run", [50, 41], [50, 34], [50, 27]]] },
            { say: "Whip it in. Everyone attacks the ball.", m: [["pass", [90, 8], [70, 4], [54, 12]]] }
        ]
    },
    "4v4 + goalkeepers": {
        g: [TOP, BOTTOM], k: [[50, 8, "GK"], [50, 62, "GK"]],
        a: [[50, 46, 1], [30, 38, 2], [70, 38, 3], [50, 32, 4]], d: [[50, 24], [30, 20], [70, 20], [50, 16]],
        steps: [
            { say: "Keep your shape: a diamond, not a line.", m: [["pass", [46, 43], [34, 38]]] },
            { say: "Look to score within three passes.", m: [["pass", [34, 36], [48, 34]], ["pass", [52, 31], [66, 38]]] },
            { say: "Everyone defends when the ball is lost.", m: [["press", [50, 22], [50, 30]]] }
        ]
    },
    "2v1 attack waves": {
        z: [20, 6, 60, 58], c: [[20, 40], [80, 40]], g: [TOP, BOTTOM], ball: [35, 52],
        a: [[35, 56, 1], [60, 56, 2]], d: [[48, 28]],
        steps: [
            { say: "Two attackers drive at one defender.", m: [["dribble", [36, 52], [42, 38]]] },
            { say: "Pass early, then run past the defender.", m: [["pass", [44, 36], [58, 28]], ["run", [60, 52], [58, 42], [56, 30]]] },
            { say: "Finish in two touches, then send the next wave.", m: [["pass", [57, 24], [52, 9]]] }
        ]
    },
    "jockey and delay": {
        c: square(34, 12, 32, 48), ball: [50, 52],
        a: [[50, 56, 1]], d: [[50, 30]],
        steps: [
            { say: "Close down fast, then slow your last two steps.", m: [["press", [50, 26], [50, 40]]] },
            { say: "Get side-on, knees bent, one arm's length away.", m: [["press", [50, 42], [44, 46]]] },
            { say: "Show the attacker one side and delay. Don't dive in.", m: [["dribble", [50, 52], [60, 42], [62, 20]]] }
        ]
    }
};

export const DIAGRAMS = Object.freeze(Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, normalizeDiagram(v)])));

// The diagram for a drill, matched by name. A drill with its own saved board shows that board instead.
export function diagramFor(drill) {
    if (!drill || drill.boardId) return null;
    return DIAGRAMS[String(drill.name || "").trim().toLowerCase()] || null;
}
