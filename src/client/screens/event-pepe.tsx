"use client";
/*
 * The mentor Пепе («Менторы» in the bosses): the same fight as the chain bosses (screens/boss.tsx BossScreen — the door,
 * the weapons, the global damage, the reward), only «Пацанский», no pass needed (content/bosses.ts EVENT_FIGHTS, mentor).
 * A win: 25 authority, 25 зубов and a tattoo of the «Болото» set (content/tattoos.ts). Always on.
 */
import { BossScreen } from "./boss.tsx";

export function PepeEventScreen() {
  return <BossScreen id="pepe" />;
}
