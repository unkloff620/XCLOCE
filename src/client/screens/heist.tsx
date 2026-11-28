"use client";
/*
 * «Взлом» (content/heist.ts): the basement. Below — 5 paper cards with the boxes; the chosen box stands big above them
 * with its padlocks in a row on its front: the one being picked shakes while the lockpicks poke it, a timer under it.
 * On the right — what the box may hold. «Взломать» starts the next padlock (6 hours; the player comes back for each; one box at a time),
 * «Вскрыть сейчас» opens it for teeth (bars when the teeth run short); with every padlock off the box opens — the loot lies on its bottom.
 */
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useGame, useNow } from "../store.tsx";
import { Modal, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { haptic } from "../telegram.ts";
import { clock, full as num } from "../format.ts";
import { leftText } from "../event-banner.tsx";
import type { GameState, Granted } from "../api.ts";
import { HEIST_BOX } from "../art/heist-box-data.ts";
import { ACH_BOX_COST } from "../../content/ach-box.ts";
import { HEIST_BOXES, HEIST_CASE, HEIST_SET_BOSS, heistBox, heistLoot, heistOdds, rushPrice, type HeistKind } from "../../content/heist.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";

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

const BX = "/assets/heist/box";
type Part = keyof typeof HEIST_BOX & ("body" | "lid" | "lid-mid" | "lid-open" | "hasp" | "lock" | "shackle" | "ring");
const at = (n: Part, rel?: { x: number; y: number; w: number; h: number }) => {
  const b = HEIST_BOX[n];
  // a part placed in the canvas, or inside another box (`rel`, e.g. the padlock's group)
  return rel
    ? { left: `${((b.x - rel.x) / rel.w) * 100}%`, top: `${((b.y - rel.y) / rel.h) * 100}%`, width: `${(b.w / rel.w) * 100}%`, height: `${(b.h / rel.h) * 100}%` }
    : { left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` };
};
/** the padlock (bow + body): one box round both */
const PAD = (() => {
  const s = HEIST_BOX.shackle, l = HEIST_BOX.lock;
  const x = Math.min(s.x, l.x), y = Math.min(s.y, l.y);
  return { x, y, w: Math.max(s.x + s.w, l.x + l.w) - x, h: Math.max(s.y + s.h, l.y + l.h) - y };
})();
function Img({ src, className, style }: { src: string; className?: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} style={style} alt="" draggable={false} />;
}

/**
 * The artist's box (tools/heist/build-box.py), coloured by its kind. Locked: the lid shut, the latch, the padlock
 * through the ring — tap it (`onLock`): its picking starts; while being picked it shakes and the picks poke it. Every
 * padlock off (`free`): the bow springs up and the padlock drops out of the ring. `open`: the lid swings up (three
 * pictures) and the loot lies on its inside. The padlocks of the box — a row of little locks above it.
 */
/** what each box had off when last seen: only padlocks that came off since then drop (heist.tsx Chest) */
const SEEN = new Map<number, number>();
/** the padlocks' places along the lid's edge: each its own latch, ring and padlock, this far apart (% of the canvas) */
const LOCK_GAP = 17;

function Chest({ slot, kind, locks, done, live, onLock, face, open, loot }: {
  slot?: number; kind: HeistKind; locks: number; done: number; live?: boolean; onLock?: () => void; face?: ReactNode; open?: boolean; loot?: ReactNode;
}) {
  // the padlocks that came off since this box was last seen fall now; the older ones are gone already
  const [seen] = useState(() => (slot === undefined ? done : Math.min(SEEN.get(slot) ?? done, done)));
  useEffect(() => { if (slot !== undefined) SEEN.set(slot, done); }, [slot, done]);
  const shift = (i: number) => (i - (locks - 1) / 2) * LOCK_GAP;
  const moved = (n: Part, dx: number) => { const st = at(n); return { ...st, left: `${HEIST_BOX[n].x + dx}%` }; };
  return (
    <div className={`hb ${open ? "open" : ""}`}>
      <Img className="hb-p hb-lid-open" src={`${BX}/${kind}-lid-open.webp`} style={at("lid-open")} />
      <Img className="hb-p hb-lid-mid" src={`${BX}/${kind}-lid-mid.webp`} style={at("lid-mid")} />
      <Img className="hb-p hb-body" src={`${BX}/${kind}-body.webp`} style={at("body")} />
      <Img className="hb-p hb-lid" src={`${BX}/${kind}-lid.webp`} style={at("lid")} />
      {Array.from({ length: locks }, (_, i) => {
        const dx = shift(i);
        const off = i < done, falling = off && i >= seen, isLive = !!live && i === done;
        const tap = !!onLock && !off;
        return (
          <span key={i} className={`hb-latch ${falling ? "free" : ""} ${isLive ? "live" : ""}`}>
            <Img className="hb-p hb-hasp" src={`${BX}/hasp.webp`} style={moved("hasp", dx)} />
            {!open && (!off || falling) && (
              <span className={`hb-pad ${tap ? "tap" : ""}`} style={{ left: `${PAD.x + dx}%`, top: `${PAD.y}%`, width: `${PAD.w}%`, height: `${PAD.h}%` }}
                role={tap ? "button" : undefined} aria-label={tap ? (isLive ? "Открыть замок сразу" : "Взломать замок") : undefined}
                onClick={tap ? (e) => { e.stopPropagation(); onLock!(); } : undefined}>
                <Img className="hb-p hb-shackle" src={`${BX}/shackle.webp`} style={at("shackle", PAD)} />
                <Img className="hb-p hb-lockb" src={`${BX}/lock.webp`} style={at("lock", PAD)} />
                {isLive && <Img className="hb-picks" src={`${A}/picks.webp`} />}
              </span>
            )}
            {!open && <Img className="hb-p hb-ring" src={`${BX}/ring.webp`} style={moved("ring", dx)} />}
          </span>
        );
      })}
      {open && loot && <div className="hb-loot" style={at("loot" as Part)}>{loot}</div>}
      {face && <div className="hs-face">{face}</div>}
    </div>
  );
}

/** «Возможная награда» on the paper on the right: what this kind of box may hold */
function Possible({ kind, owned }: { kind: HeistKind; owned: Set<string> }) {
  const T = heistLoot(kind, "teeth"), B = heistLoot(kind, "bars");
  // what may be inside (opened for teeth or for bars)
  const ids = [...new Set([...T.items, ...B.items].map(([id]) => id))];
  const got = SET_PIECES.filter((id) => owned.has(id)).length;
  return (
    <div className="hs-panel">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hs-panel-bg" src={`${A}/panel.webp`} alt="" draggable={false} />
      <div className="hs-panel-in">
        <b className="hs-panel-t">Возможная награда</b>
        <div className={`hs-panel-grid ${ids.length > 7 ? "many" : ""}`}>
          {ids.map((id) => <span key={id}>{id === HEIST_CASE ? <Icon name="case" size={26} /> : <ItemArt id={id} size={28} />}</span>)}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {SET_PIECES[0] && <span title="Наколки сетов ивента"><img src="/assets/ui/drop-tattoo.webp?v=2" width={28} height={28} alt="наколка" draggable={false} /></span>}
        </div>
        <span className="hs-panel-note">Наколка {Math.round(T.tattoo * 100)}% · {got}/{SET_PIECES.length}<br />за слитки {Math.round(B.tattoo * 100)}%</span>
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
          <button type="button" className="btn gold sm" onClick={() => setHelp(true)} aria-label="Как это работает">?</button>
        </div>
      </div>

      <div className="hs-stage">
        <div className="hs-main">
          {got ? (
            <>
              <Chest kind={got.kind} locks={1} done={1} open loot={
                <>
                  <RewardChips r={{ ...got.reward, achPoints: undefined }} size={14} />
                  {/* «Ящик ништяков» openings (given as achievement points) — as cases */}
                  {!!got.reward.achPoints && <span className="hb-case"><Icon name="case" size={14} />×{Math.round(got.reward.achPoints / ACH_BOX_COST)}</span>}
                </>
              } />
              {got.tattoo && <div className="hs-status">Внутри — наколка из сета ивента!</div>}
              <button className="btn gold block" onClick={() => setGot(null)}>Забрать</button>
            </>
          ) : box && d ? (
            <>
              {/* tap a padlock: the next one starts being picked; tapped again while it is — open it at once for dollars */}
              <Chest key={box.slot} slot={box.slot} kind={box.kind} locks={d.locks} done={done} live={busyLock}
                onLock={() => {
                  if (box.auto) return;
                  if (busyLock) { haptic.tap(); setAsk(box.slot); return; }
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
                {b && <span className="hs-card-box"><Chest kind={b.kind} locks={b.locks} done={dn} /></span>}
                <span className={`hs-card-st num ${b && dn >= b.locks ? "ready" : ""}`}>
                  {!b ? "пусто" : dn >= b.locks ? "Открыть" : picking(b, now) ? clock(b.pickEnds! - now) : `замки ${dn}/${b.locks}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {ask !== null && (() => {
        const price = rushPrice(state?.wallet?.TOOTH ?? 0);
        return (
          <Modal title="Открыть сразу?" onClose={() => setAsk(null)}>
            <p style={{ margin: "4px 0 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
              Открыть замок сразу за <span style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}><Icon name={price.currency} size={16} /><b className="num">{num(price.amount)}</b>?</span>
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn red" style={{ flex: 1 }} onClick={() => setAsk(null)}>Нет</button>
              <button className="btn gold" style={{ flex: 1 }} disabled={busy === "heist_rush"} onClick={async () => { const s0 = ask; setAsk(null); await rush(s0); }}>Открыть</button>
            </div>
          </Modal>
        );
      })()}

      {help && (
        <Modal title="Как работает взлом" onClose={() => setHelp(false)}>
          <ul className="small" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>Пока идёт ивент, с каждой победы над любым боссом в любом режиме падает ящик. Он ложится в свободную ячейку; когда все 5 заняты, ящики не падают.</li>
            <li>Чем сильнее босс, тем чаще дорогие ящики: {HEIST_BOXES.map((b) => b.name.split(" ")[0].toLowerCase()).join(", ")}. С Солнца бриллиантовый — примерно 1 из {Math.round(1 / heistOdds(1).diamond)}.</li>
            <li>На ящике от 1 до 4 замков. Нажми на замок — его начнут взламывать, это 6 часов; следующий начинаешь сам. Взламывать можно только один ящик за раз.</li>
            <li>Нажми на взламываемый замок ещё раз — откроешь его сразу за {num(h?.rush ?? 25000)} зубов, а если зубов не хватает — за {h?.rushGold ?? 8} слитков.</li>
            <li>Внутри ножи, стволы, пушки, самородки, а в ящиках подороже — кольца, фишки, билеты колеса, кейсы и энергетики. Если все замки ящика открыть за слитки — награда больше и шанс на наколку из сетов ивента выше: {HEIST_BOXES.map((b) => `${Math.round(heistLoot(b.id, "teeth").tattoo * 100)}/${Math.round(heistLoot(b.id, "bars").tattoo * 100)}%`).join(", ")} (бронза, серебро, золото, бриллиант).</li>
            <li>Сеты: «Динамит» +600 к стволу, +400 к пушке, +150 к ножу; «Маски» +200 к стволу, «Ночная смена» +100 к ножу.</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}
