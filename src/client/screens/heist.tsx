"use client";
/*
 * «Взлом» (content/heist.ts): the basement. Below — 5 paper cards with the boxes; the chosen box stands big above them
 * with its padlocks in a row on its front: the one being picked shakes while the lockpicks poke it, a timer under it.
 * On the right — what the box may hold. «Взломать» starts the next padlock (an hour; the player comes back for each),
 * «Вскрыть сейчас» opens it for dollars; with every padlock off the box opens — the loot lies on its bottom.
 */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useGame, useNow } from "../store.tsx";
import { Modal, RewardChips, Toggle } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { haptic } from "../telegram.ts";
import { clock } from "../format.ts";
import { leftText } from "../event-banner.tsx";
import type { GameState, Granted } from "../api.ts";
import { rushCut, rushedShare, HEIST_BOXES, HEIST_SET_BOSS, LOCK_ROW, heistBox, heistLoot, heistOdds, type HeistKind } from "../../content/heist.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";
import { STASH_IDS } from "../../content/stashes.ts";

type Heist = NonNullable<GameState["heist"]>;
type Box = Heist["boxes"][number];

const A = "/assets/heist";
const SET_PIECES = TATTOO_SETS.filter((s) => s.boss === HEIST_SET_BOSS).flatMap((s) => s.pieces.map((p) => p.id));
/** padlocks off by now (a lock whose timer ran out counts, before the server settles it) */
const doneNow = (b: Box, now: number) => Math.min(b.locks, b.done + (b.pickEnds !== null && b.pickEnds <= now ? 1 : 0));
const picking = (b: Box, now: number) => b.pickEnds !== null && b.pickEnds > now;
/** boxes that want the player: a padlock to start, or all off — ready to open (the badge on the home button) */
export function heistReady(h: Heist, now: number) {
  return h.boxes.filter((b) => !picking(b, now)).length;
}

/** a chest from the front with its padlocks in a row on its band; the one being picked shakes and the picks poke it.
 * `onLock`: the padlocks are buttons (the big chest); `face`: text or a button on the plain lower panel of its front */
function Chest({ box, now, onLock, face }: { box: Box; now: number; onLock?: (i: number) => void; face?: ReactNode }) {
  const d = heistBox(box.kind);
  const done = doneNow(box, now);
  const busy = picking(box, now);
  return (
    <div className="hs-chest">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hs-chest-pic" src={`${A}/chest-${box.kind}.webp`} alt={d.name} draggable={false} />
      {Array.from({ length: d.locks }, (_, i) => {
        const off = i < done, live = busy && i === done;
        const x = 0.5 + (i - (d.locks - 1) / 2) * LOCK_ROW.gap;
        return (
          <span key={i} className={`hs-lock ${off ? "off" : ""} ${live ? "live" : ""} ${onLock && !off ? "tap" : ""}`} style={{ left: `${x * 100}%`, top: `${LOCK_ROW.y * 100}%`, width: `${LOCK_ROW.w * 100}%` }}
            role={onLock && !off ? "button" : undefined} aria-label={onLock && !off ? (live ? "Открыть замок сразу" : "Взломать замок") : undefined}
            onClick={onLock && !off ? (e) => { e.stopPropagation(); onLock(i); } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${A}/${off ? "lock-open" : "lock"}.webp`} alt="" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {live && <img className="hs-picks" src={`${A}/picks.webp`} alt="" draggable={false} />}
          </span>
        );
      })}
      {face && <div className="hs-face">{face}</div>}
    </div>
  );
}

/** «Возможная награда» on the paper on the right: what this kind of box may hold */
function Possible({ kind, owned }: { kind: HeistKind; owned: Set<string> }) {
  const L = heistLoot(kind);
  const d = heistBox(kind);
  const got = SET_PIECES.filter((id) => owned.has(id)).length;
  return (
    <div className="hs-panel">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hs-panel-bg" src={`${A}/panel.webp`} alt="" draggable={false} />
      <div className="hs-panel-in">
        <b className="hs-panel-t">Возможная награда</b>
        <div className="hs-panel-grid">
          <span title="Рубли"><Icon name="RUB" size={24} /></span>
          <span title="Доллары"><Icon name="USD" size={24} /></span>
          {L.weapons.map(([id]) => <span key={id}><ItemArt id={id} size={28} /></span>)}
          <span title="Детали"><Icon name="parts" size={24} /></span>
          {L.stashes[1] > 0 && <span title="Нычки"><ItemArt id={STASH_IDS[0]} size={28} /></span>}
          {SET_PIECES[0] && <span title="Наколки сетов ивента"><ItemArt id={SET_PIECES[0]} size={28} /></span>}
        </div>
        <span className="hs-panel-note">Наколка {Math.round(d.tattoo * 100)}% · {got}/{SET_PIECES.length}</span>
      </div>
    </div>
  );
}

export function HeistScreen() {
  const { state, act, busy } = useGame();
  const now = useNow();
  const h = state?.heist ?? null;
  const [sel, setSel] = useState<number | null>(null);
  const [got, setGot] = useState<{ kind: HeistKind; reward: Granted; tattoo: string | null } | null>(null);
  const [help, setHelp] = useState(false);
  // «Открыть сразу за $100?» for the padlock being picked
  const [ask, setAsk] = useState<number | null>(null);
  // «Автовзлом» confirmation
  const [autoAsk, setAutoAsk] = useState<number | null>(null);
  const boxes = h?.boxes ?? [];
  // the chosen box: the one tapped, else the first there is
  const box = boxes.find((b) => b.slot === sel) ?? boxes[0] ?? null;
  useEffect(() => { if (sel !== null && !boxes.some((b) => b.slot === sel)) setSel(null); }, [boxes, sel]);
  const owned = new Set((state?.inventory ?? []).map((i) => i.id));

  const pick = async (slot: number) => { if (await act("heist_pick", { slot })) haptic.ok(); };
  const rush = async (slot: number) => { if (await act("heist_rush", { slot })) haptic.ok(); };
  const openBox = async (slot: number) => {
    const r = await act<{ kind: HeistKind; reward: Granted; tattoo: string | null }>("heist_open", { slot });
    if (r) { haptic.big(); setGot(r); }
  };

  const d = box ? heistBox(box.kind) : null;
  const done = box ? doneNow(box, now) : 0;
  const busyLock = box ? picking(box, now) : false;
  const cells = Array.from({ length: h?.slots ?? 5 }, (_, i) => boxes.find((b) => b.slot === i) ?? null);
  const full = !!h && boxes.length >= h.slots;

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

      <div className="hs-stage">
        <div className="hs-main">
          {got ? (
            <>
              <div className="hs-opened">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${A}/chest-open-${got.kind}.webp`} alt="" draggable={false} />
                <div className="hs-floor"><RewardChips r={got.reward} size={26} /></div>
              </div>
              {got.tattoo && <div className="hs-status">Внутри — наколка из сета ивента!</div>}
              <button className="btn gold block" onClick={() => setGot(null)}>Забрать</button>
            </>
          ) : box && d ? (
            <>
              {/* «Автовзлом»: the padlocks left paid at once, then picked one by one by themselves (loot whole) */}
              {done < d.locks && (
                <div className="hs-auto">
                  <Toggle on={!!box.auto} disabled={!!box.auto || busy === "heist_auto"} title="Замки ломаются сами, один за другим, по часу — заходить не нужно. Награда полная"
                    onChange={(v) => { if (v) setAutoAsk(box.slot); }}>
                    {box.auto ? "Автовзлом" : <><Icon name="USD" size={14} /><b className="num">{(h?.rush ?? 100) * (d.locks - done)}</b></>}
                  </Toggle>
                </div>
              )}
              {/* tap a padlock: the next one starts being picked; tapped again while it is — open it at once for dollars */}
              <Chest box={box} now={now}
                onLock={(i) => {
                  if (box.auto) return;
                  if (busyLock) { if (i === done) { haptic.tap(); setAsk(box.slot); } return; }
                  if (busy !== "heist_pick") void pick(box.slot);
                }}
                face={done >= d.locks
                  ? <button type="button" className="hs-face-btn" disabled={busy === "heist_open"} onClick={() => openBox(box.slot)}>Открыть</button>
                  : busyLock ? <span className="hs-face-t num">{clock(box.pickEnds! - now)}</span>
                  : <span className="hs-face-t sm">Нажми на замок</span>} />
            </>
          ) : (
            <div className="hs-status hs-none">Победи любого босса — ящик упадёт в ячейку снизу.</div>
          )}
        </div>
        <Possible kind={got?.kind ?? box?.kind ?? "bronze"} owned={owned} />
      </div>

      <div className="hs-bottom">
        <div className={`hs-hint ${full ? "warn" : ""}`}>{full ? "Нет места под ящик — с босса он не выпадет!" : "Если не будет места под ящик, он не выпадет с босса"}</div>
        <div className="hs-cards">
          {cells.map((b, i) => {
            const dn = b ? doneNow(b, now) : 0;
            return (
              <button type="button" key={i} className={`hs-card ${b ? "" : "empty"} ${b && box?.slot === b.slot && !got ? "on" : ""}`} disabled={!b}
                onClick={() => { if (b) { haptic.tap(); setGot(null); setSel(b.slot); } }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="hs-card-bg" src={`${A}/card.webp`} alt="" draggable={false} />
                {b && <Chest box={b} now={now} />}
                <span className={`hs-card-st num ${b && dn >= b.locks ? "ready" : ""}`}>
                  {!b ? "пусто" : dn >= b.locks ? "Открыть" : picking(b, now) ? clock(b.pickEnds! - now) : `замки ${dn}/${b.locks}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {autoAsk !== null && (() => {
        const bx = boxes.find((b) => b.slot === autoAsk);
        if (!bx) return null;
        const left = bx.locks - doneNow(bx, now);
        return (
          <Modal title="Автовзлом" onClose={() => setAutoAsk(null)}>
            <p className="center" style={{ margin: "4px 0 8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
              Оплатить {left} {left === 1 ? "замок" : left < 5 ? "замка" : "замков"} за <span style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}><Icon name="USD" size={16} /><b>{(h?.rush ?? 100) * left}</b>?</span>
            </p>
            <p className="small center muted" style={{ margin: "0 0 12px" }}>Замки будут ломаться сами, один за другим, по часу — заходить каждый час не нужно. Награда полная.</p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn dark" style={{ flex: 1 }} onClick={() => setAutoAsk(null)}>Нет</button>
              <button className="btn gold" style={{ flex: 1 }} disabled={busy === "heist_auto"} onClick={async () => { const s0 = autoAsk; setAutoAsk(null); if (await act("heist_auto", { slot: s0 })) haptic.ok(); }}>Оплатить</button>
            </div>
          </Modal>
        );
      })()}

      {ask !== null && (
        <Modal title="Открыть сразу?" onClose={() => setAsk(null)}>
          <p style={{ margin: "4px 0 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
            Открыть замок сразу за <span style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}><Icon name="USD" size={16} /><b>{h?.rush ?? 100}</b>?</span>
          </p>
          {(() => {
            const bx = boxes.find((b) => b.slot === ask);
            if (!bx) return null;
            const cut = Math.round(rushCut(bx.locks) * 100), after = Math.round((1 - rushedShare(bx.locks, (bx.rushed ?? 0) + 1)) * 100);
            return <p className="small center muted" style={{ margin: "-6px 0 12px" }}>Награда в ящике станет меньше на {cut}%{after > cut ? ` (всего −${after}%)` : ""}. Если дождаться таймера — без потерь.</p>;
          })()}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn dark" style={{ flex: 1 }} onClick={() => setAsk(null)}>Нет</button>
            <button className="btn gold" style={{ flex: 1 }} disabled={busy === "heist_rush"} onClick={async () => { const s0 = ask; setAsk(null); await rush(s0); }}>Открыть</button>
          </div>
        </Modal>
      )}

      {help && (
        <Modal title="Как работает взлом" onClose={() => setHelp(false)}>
          <ul className="small" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>Пока идёт ивент, с каждой победы над любым боссом в любом режиме падает ящик. Он ложится в свободную ячейку; когда все 5 заняты, ящики не падают.</li>
            <li>Чем сильнее босс, тем чаще дорогие ящики: {HEIST_BOXES.map((b) => b.name.split(" ")[0].toLowerCase()).join(", ")}. С Солнца бриллиантовый — примерно 1 из {Math.round(1 / heistOdds(1).diamond)}.</li>
            <li>На ящике от 1 до 4 замков. Нажми на замок — его начнут взламывать, это час; следующий начинаешь сам, так что заходи каждый час. Нажми на взламываемый замок ещё раз — откроешь его сразу за ${h?.rush ?? 100}, но каждый такой замок срезает награду ящика: бриллиантовый −10%, золотой −13%, серебряный −20%, бронзовый −40% за замок.</li>
            <li>Внутри рубли, доллары, оружие, детали и нычки — чем дороже ящик, тем больше. И шанс на наколку из сетов ивента: бронза 25%, серебро 50%, золото 75%, бриллиант 100%.</li>
            <li>Сеты: «Динамит» +300 к Rug Pull Gun, «Маски» +200 к видеокарте, «Ночная смена» +100 к клавиатуре.</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}
