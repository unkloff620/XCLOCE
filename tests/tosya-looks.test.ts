import { it, expect } from "vitest";
import { TOSYA_LOOKS, tosyaLook, tosyaLookById } from "../src/content/tosya.ts";
import { TOSYA_PARTS } from "../src/client/art/tosya-data.ts";

it("Тося's looks: one a visit (the same for everybody), every look turns up, each has its art", () => {
  expect(tosyaLook("2026-11-05").id).toBe(tosyaLook("2026-11-05").id);
  const seen = new Set<string>();
  for (let d = 1; d <= 60; d++) seen.add(tosyaLook(`2026-12-${String(d).padStart(2, "0")}`).id);
  expect(seen.size).toBe(TOSYA_LOOKS.length);
  expect(tosyaLookById(undefined).id).toBe("maid");
  for (const l of TOSYA_LOOKS.filter((x) => x.art)) {
    for (const n of [`body${l.art}`, `head${l.art}`, `item${l.art}-l`, `item${l.art}-c`, `item${l.art}-r`]) expect(TOSYA_PARTS[n], n).toBeTruthy();
  }
});
