// Every motion the bake tool knows. Add one: write tools/motions/<id>.js
// (setup(rig) + pose(rig, t) over one loop) and list it here.
import { squat } from "./squat.js";
import { pushup } from "./pushup.js";
import { lunge } from "./lunge.js";
import { row } from "./row.js";
import { press } from "./press.js";
import { plank } from "./plank.js";
export const MOTIONS = { squat, pushup, lunge, row, press, plank };
