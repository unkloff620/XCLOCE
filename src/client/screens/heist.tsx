"use client";
/*
 * «Взлом» (content/heist.ts): the basement with 5 cells (3 + 2). A box in a cell shows its padlocks; a tap opens it big:
 * the padlocks hang on its hasps — the one being picked shakes while the lockpicks poke it, a timer under the box.
 * «Взломать» starts the next padlock (an hour; the player comes back for each), «Вскрыть сейчас» opens it for dollars,
 * and with every padlock off the box opens: the loot lies in the open box, like the case.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Modal, RewardChips } from "../ui.tsx";
import { haptic } from "../telegram.ts";
import { clock } from "../format.ts";
import { leftText } from "../event-banner.tsx";
import type { GameState, Granted } from "../api.ts";
import { HEIST_BOXES, heistBox, heistOdds, type HeistKind } from "../../content/heist.ts";

type Heist = NonNullable<GameState["heist"]>;
type Box = Heist["boxes"][number];

const A = "/assets/heist";
/** padlocks off by now (a lock whose timer ran out counts, before the server settles it) */
const doneNow = (b: Box, now: number) => Math.min(b.locks, b.done + (b.pickEnds !== null && b.pickEnds <= now ? 1 : 0));
const picking = (b: Box, now: number) => b.pickEnds !== null && b.pickEnds > now;
/** boxes that want the player: a padlock to start, or all off — ready to open (the badge on the home button) */
export function heistReady(h: Heist, now: number) {
  return h.boxes.filter((b) => !picking(b, now)).length;
}

/** a box with its padlocks on the hasps; `live` — the one being picked shakes and the picks poke it */
function LockedBox({ box, now, big }: { box: Box; now: number; big?: boolean }) {
  const d = heistBox(box.kind);
  const done = doneNow(box, now);
  const busy = picking(box, now);
  return (
    <div className={`hs-box ${big ? "big" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hs-box-pic" src={`${A}/box-${box.kind}.webp`} alt={d.name} draggable={false} />
      {d.rings.map(([x, y], i) => {
        const off = i < done, live = busy && i === done;
        return (
          <span key={i} className={`hs-lock ${off ? "off" : ""} ${live ? "live" : ""}`} style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${d.lockW * 100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${A}/${off ? "lock-open" : "lock"}.webp`} alt="" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {live && <img className="hs-picks" src={`${A}/picks.webp`} alt="" draggable={false} />}
          </span>
        );
      })}
    </div>
  );
}

export function HeistScreen() {
  const { state, act, busy } = useGame();
  const now = useNow();
  const h = state?.heist ?? null;
  const [open, setOpen] = useState<number | null>(null);
  const [got, setGot] = useState<{ kind: HeistKind; reward: Granted; tattoo: string | null } | null>(null);
  const [help, setHelp] = useState(false);
  const box = h?.boxes.find((b) => b.slot === open) ?? null;
  // the box went away (opened elsewhere): close its window
  useEffect(() => { if (open !== null && h && !h.boxes.some((b) => b.slot === open)) setOpen(null); }, [h, open]);

  const pick = async (slot: number) => { if (await act("heist_pick", { slot })) haptic.ok(); };
  const rush = async (slot: number) => { if (await act("heist_rush", { slot })) haptic.ok(); };
  const openBox = async (slot: number) => {
    const r = await act<{ kind: HeistKind; reward: Granted; tattoo: string | null }>("heist_open", { slot });
    if (r) { haptic.big(); setOpen(null); setGot(r); }
  };

  const cells = Array.from({ length: h?.slots ?? 5 }, (_, i) => h?.boxes.find((b) => b.slot === i) ?? null);
  return (
    <div className="fit-page hs-page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hs-bg" src={`${A}/bg.webp`} alt="" draggable={false} />
      <div className="hs-top">
        <div className="title-row">
          <Link href="/" className="back-btn" aria-label="Домой">‹</Link>
          <div className="hs-title">
            <b className="display">Взлом</b>
            <span className="small">{h?.on && h.endsAt ? <>Ящики падают с боссов ещё <b>{leftText(h.endsAt - now)}</b></> : "Ивент закончился — вскрой то, что осталось"}</span>
          </div>
          <button type="button" className="btn dark sm" onClick={() => setHelp(true)} aria-label="Как это работает">?</button>
        </div>
      </div>
      <div className="hs-cells">
        {cells.map((b, i) => {
          const done = b ? doneNow(b, now) : 0;
          return (
            <button type="button" key={i} className={`hs-cell ${b ? "" : "empty"}`} disabled={!b} onClick={() => { if (b) { haptic.tap(); setOpen(b.slot); } }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hs-cell-bg" src={`${A}/cell.webp`} alt="" draggable={false} />
              {b && <LockedBox box={b} now={now} />}
              <span className={`hs-cell-st num ${b && done >= b.locks ? "ready" : ""}`}>
                {!b ? "пусто" : done >= b.locks ? "Открыть!" : picking(b, now) ? clock(b.pickEnds! - now) : `замки ${done}/${b.locks}`}
              </span>
            </button>
          );
        })}
      </div>
      {h && !h.boxes.length && <div className="hs-empty small">Победи любого босса — ящик упадёт сюда. Ячеек 5: когда все заняты, новые ящики не падают.</div>}

      {box && (() => {
        const d = heistBox(box.kind);
        const done = doneNow(box, now);
        const busyLock = picking(box, now);
        return (
          <Modal title={d.name} onClose={() => setOpen(null)} className="hs-modal">
            <div className="hs-big">
              <LockedBox box={box} now={now} big />
            </div>
            <div className="hs-status">
              {done >= d.locks ? <b>Все замки сняты!</b>
                : busyLock ? <>Замок {done + 1}/{d.locks} · <b className="num">{clock(box.pickEnds! - now)}</b></>
                : <>Замки: <b className="num">{done}/{d.locks}</b>. Один замок — {Math.round((h?.lockMs ?? 3_600_000) / 3_600_000)} ч</>}
            </div>
            <div className="col" style={{ gap: 8 }}>
              {done >= d.locks ? (
                <button className="btn gold block" disabled={busy === "heist_open"} onClick={() => openBox(box.slot)}>Открыть ящик</button>
              ) : (
                <>
                  {!busyLock && <button className="btn gold block" disabled={busy === "heist_pick"} onClick={() => pick(box.slot)}>Взломать замок {done + 1}</button>}
                  {busyLock && <span className="small muted center">Отмычки работают. Загляни, когда таймер дойдёт до нуля, — и начни следующий замок.</span>}
                  <button className="btn dark block" disabled={busy === "heist_rush"} onClick={() => rush(box.slot)}>Вскрыть сейчас · ${h?.rush ?? 100}</button>
                </>
              )}
            </div>
          </Modal>
        );
      })()}

      {got && (
        <Modal title={`${heistBox(got.kind).name} вскрыт!`} onClose={() => setGot(null)} className="hs-modal">
          <div className="hs-opened">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${A}/open-${got.kind}.webp`} alt="" draggable={false} />
            <div className="hs-loot"><RewardChips r={got.reward} size={34} /></div>
          </div>
          {got.tattoo && <div className="small center">Внутри — наколка из сета ивента!</div>}
          <button className="btn gold block" onClick={() => setGot(null)}>Забрать</button>
        </Modal>
      )}

      {help && (
        <Modal title="Как работает взлом" onClose={() => setHelp(false)}>
          <ul className="small" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>Пока идёт ивент, с каждой победы над любым боссом в любом режиме падает ящик. Он ложится в свободную ячейку; когда все 5 заняты, ящики не падают.</li>
            <li>Чем сильнее босс, тем чаще дорогие ящики: {HEIST_BOXES.map((b) => b.name.split(" ")[0].toLowerCase()).join(", ")}. С Солнца бриллиантовый — примерно 1 из {Math.round(1 / heistOdds(1).diamond)}.</li>
            <li>На ящике от 1 до 4 замков. Замок взламывается час; следующий начинаешь сам, так что заходи каждый час. Сразу — за ${h?.rush ?? 100} замок.</li>
            <li>Внутри рубли, доллары, оружие, детали и нычки — чем дороже ящик, тем больше. И шанс на наколку из сетов ивента: бронза 25%, серебро 50%, золото 75%, бриллиант 100%.</li>
            <li>Сеты: «Динамит» +300 к Rug Pull Gun, «Маски» +200 к видеокарте, «Ночная смена» +100 к клавиатуре.</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}
