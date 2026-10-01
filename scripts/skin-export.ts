// Prints the skin slot list as JSON (used to build templates and the size spec).
import { SKIN_SLOTS } from "../src/shared/skin.ts";
console.log(JSON.stringify(SKIN_SLOTS, null, 2));
