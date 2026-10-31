"use client";
/*
 * The event boss Пепе: the same fight as the chain bosses (screens/boss.tsx BossScreen — the door, the weapons, the
 * global damage, the reward), only «Пацанский», no pass needed (content/bosses.ts EVENT_FIGHTS). A win: 100 000
 * authority, 15 000 ₽ and a tattoo of the «Болото» set (content/tattoos.ts). The admin turns the event on and off.
 */
import { BossScreen } from "./boss.tsx";

export function PepeEventScreen() {
  return <BossScreen id="pepe" />;
}
