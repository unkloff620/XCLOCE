import { passLook } from "../../content/bosses.ts";
/* Item and weapon pictures: the artist's pictures (public/assets/items) in a 64×64 SVG box; unknown ids show a chest. */
import { Icon } from "./icons.tsx";
import { ART_VER } from "../preload.ts";
import { STASH_IDS } from "../../content/stashes.ts";
import { TATTOO_IDS } from "../../content/tattoos.ts";
import { CRAFT_ALL } from "../../content/craft.ts";

/** Items drawn by the artist (public/assets/items/<id>.webp, built by tools/items/build-items.py). */
const RASTER_ITEMS = new Set([
  "fist", "mouse", "red-candle", "keyboard", "gpu", "rug-pull-gun",
  "tee-white", "tee-pump", "hoodie-hodl", "jeans", "shorts-remote", "sneakers", "cap-moon", "slippers", "gold-chain", "bottle-komandate", "anchor-mugo", "hand-drum", "gloves-botsman", "pants-botsman", "boots-botsman", "coat-botsman",
  "jacket-puffer", "pants-black", "sneakers-chunky", "tee-sailor", "cap-captain", "mask-diver", "teeth-necklace", "tee-actclose", "shorts-actclose", "badge-actclose", "jacket-komandate", "pants-komandate", "sneakers-komandate", "jacket-vadim", "pants-vadim", "shoes-vadim", "tie-vadim", "sweater-vostok", "pants-vostok", "headphones-vostok", "sneakers-black", "cigarette", "toothpick", "shades-gold", "chain-cuban", "mask-anon", "monocle-whale", "bruise-liq", "crown-cash", "ushanka-star", "helmet-miner", "bandana-hodl", "cigar", "teeth-grin", "grillz-diamond",
  "poker-chip", "energy-drink", "energy-pack", "energy-full", "energy-50", "energy-100", "energy-500", "lost-wallet", "bottle-cap", "flyer-passive", "spinner", "sticker-hodl", "statue-close", "trophy-sun", "santa-hat", "laser-eyes", "fortune-ticket", "keycap", "raid-flag-1", "raid-flag-2", "raid-flag-3", "raid-flag-4", "raid-flag-5",
  ...STASH_IDS,
  ...TATTOO_IDS,
  ...CRAFT_ALL.map((c) => c.id),
]);

/** does the item have its own picture (not the fallback chest) */
export const hasItemArt = (id: string) => RASTER_ITEMS.has(id);

/** picture of an energy offer: +50 a crate, +100 a box, +500 a pile of cans (the energy icon for other amounts) */
export function EnergyArt({ amount, size = 40 }: { amount: number; size?: number }) {
  return RASTER_ITEMS.has(`energy-${amount}`) ? <ItemArt id={`energy-${amount}`} size={size} /> : <Icon name="energy" size={size} />;
}

/** a boss pass (item key-<boss>): the key of the boss it opens (pass-key-<next>.webp), or for the last five a pass card */
export function cardArt(id: string): string {
  return passLook(id.replace(/^key-/, "")).art;
}

/** Picture of any item; boss cards show their tier, unknown ids fall back to a chest. */
export function ItemArt({ id, size = 40 }: { id: string; size?: number }) {
  const raster = RASTER_ITEMS.has(id) ? id : id.startsWith("key-") ? cardArt(id) : null;
  if (raster) {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style={{ flex: "none", display: "block" }}>
        <image href={`/assets/items/${raster}.webp?v=${ART_VER.items}`} x="0" y="0" width="64" height="64" />
      </svg>
    );
  }
  if (id === "coins") return <Icon name="coins" size={size} />;
  return <Icon name="chest" size={size} />;
}
