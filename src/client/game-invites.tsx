"use client";
/*
 * Calls into the mini-games pop up wherever the player is: «[avatar] [nick] зовёт вас в блэкджек / зонк» with ✓ and ✕.
 * ✓ takes the seat (blackjack) or accepts the duel (zonk) and opens that game in the yard; ✕ declines.
 * The calls come with the state (bjInviteList, duels); one is shown at a time.
 */
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useGame } from "./store.tsx";
import { Avatar } from "./ui.tsx";
import { haptic } from "./telegram.ts";
import { sfx } from "./sound.ts";

export type GameId = "blackjack" | "zonk" | "poker";
const OPEN_EVENT = "xc-open-game";
let pending: GameId | null = null;

/** asks the yard to open a game window (now if the yard is on screen, or when it mounts) */
export function openGame(id: GameId) {
  pending = id;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
}
/** for the yard: the game asked for before it mounted (taken once) */
export function takePendingGame(): GameId | null {
  const g = pending;
  pending = null;
  return g;
}
export const OPEN_GAME_EVENT = OPEN_EVENT;

interface Call { key: string; game: "blackjack" | "zonk"; from: string; photo: string | null; stake?: number; accept: () => Promise<unknown>; decline: () => Promise<unknown> }

export function GameInvites() {
  const { state, act, busy } = useGame();
  const router = useRouter();
  const path = usePathname();
  const [gone, setGone] = useState<Set<string>>(new Set());
  if (!state) return null;
  const calls: Call[] = [
    ...(state.bjInviteList ?? []).map((i) => ({
      key: `bj${i.id}`, game: "blackjack" as const, from: i.from, photo: i.photo,
      accept: () => act("bj_join", { inviteId: i.id }), decline: () => act("bj_decline", { inviteId: i.id }),
    })),
    ...(state.duels ?? []).filter((d) => d.status === "open" && !d.mine).map((d) => ({
      key: `du${d.id}`, game: "zonk" as const, from: d.rival.name, photo: d.rival.photo, stake: d.stake,
      accept: () => act("duel_answer", { id: d.id, answer: "accept" }, "Вызов принят — играй свою партию"), decline: () => act("duel_answer", { id: d.id, answer: "decline" }, "Вызов отклонён"),
    })),
  ].filter((c) => !gone.has(c.key));
  const c = calls[0];
  if (!c) return null;
  const hide = () => setGone((g) => new Set(g).add(c.key));
  const yes = async () => {
    haptic.ok();
    sfx("step");
    hide();
    const r = await c.accept();
    if (r === null) return;
    if (path !== "/yard") router.push("/yard");
    openGame(c.game);
  };
  const no = async () => {
    haptic.tap();
    hide();
    await c.decline();
  };
  return createPortal(
    <div className="gi" role="alertdialog" aria-label="Приглашение в игру" key={c.key}>
      <Avatar name={c.from} photo={c.photo} size={40} />
      <span className="gi-t">
        <b className="ellipsis">{c.from}</b>
        <small>зовёт вас в {c.game === "blackjack" ? "блэкджек" : <>зонк{c.stake ? ` · ${c.stake} $` : ""}</>}</small>
      </span>
      <button type="button" className="gi-b ok" disabled={!!busy} onClick={yes} aria-label="Принять">✓</button>
      <button type="button" className="gi-b no" disabled={!!busy} onClick={no} aria-label="Отклонить">✕</button>
    </div>,
    document.body,
  );
}
