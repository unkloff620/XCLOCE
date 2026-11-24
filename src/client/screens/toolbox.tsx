"use client";
/*
 * «Строительный ящик» (content/toolbox.ts): a CS2-style roulette. The strip of parts runs right to left and slows down
 * under the marker on the part the server rolled; under it — what the box holds, by rarity.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../ui.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { itemById } from "../../content/items.ts";
import { TOOLBOX_DISC_MS, TOOLBOX_DISCOUNTS, TOOLBOX_DISC_WEIGHTS, TOOLBOX_ODDS, TOOLBOX_PARTS, toolboxPrice } from "../../content/toolbox.ts";
import { useGame } from "../store.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";

const CELL = 78;          // px, one cell of the strip with its gap
const WIN_AT = 42;        // the won part's place in the strip
const STRIP = 50;
const SPIN_MS = 5200;
const rarityOf = (id: string) => TOOLBOX_PARTS.find((p) => p.id === id)?.rarity ?? "common";
/** a random part by the box's odds (for the strip's look only; the real one comes from the server) */
function fake() {
  const r = Math.random();
  const tier = r < TOOLBOX_ODDS.epic ? "epic" : r < TOOLBOX_ODDS.epic + TOOLBOX_ODDS.rare ? "rare" : "common";
  const list = TOOLBOX_PARTS.filter((p) => p.rarity === tier);
  return list[Math.floor(Math.random() * list.length)].id;
}
const strip = (win?: string) => Array.from({ length: STRIP }, (_, i) => (i === WIN_AT && win ? win : fake()));

/* the discount strip (the panel that slides out above after the first spin): the same roulette of 25/50/75/100% */
const DCELL = 70;
const D_WIN = 30;
const D_STRIP = 36;
const D_MS = 3200;
function fakeDisc() {
  const t = TOOLBOX_DISC_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * t;
  for (const [i, w] of TOOLBOX_DISC_WEIGHTS.entries()) if ((r -= w) < 0) return TOOLBOX_DISCOUNTS[i];
  return 25;
}
const dstrip = (win?: number) => Array.from({ length: D_STRIP }, (_, i) => (i === D_WIN && win ? win : fakeDisc()));

export function ToolboxWindow({ onClose }: { onClose: () => void }) {
  const { state, act } = useGame();
  const [items, setItems] = useState<string[]>(() => strip());
  const [x, setX] = useState(0);
  const [anim, setAnim] = useState(false);
  const [won, setWon] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // the discount panel: shown after the first spin (or when a discount is still on); its own strip, the minute left
  const disc0 = state?.toolboxDisc ?? null;
  const [disc, setDisc] = useState<{ pct: number; until: number } | null>(disc0);
  const [top, setTop] = useState(!!disc0);
  const [dItems, setDItems] = useState<number[]>(() => dstrip(disc0?.pct));
  const [dx, setDx] = useState(0);
  const [dAnim, setDAnim] = useState(false);
  const [dRolling, setDRolling] = useState(false);
  const dbox = useRef<HTMLDivElement>(null);
  const dRun = useRef<{ d: { pct: number; until: number }; target: number; timer: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(t); }, []);
  // the strip at rest on a discount still on (the window opened again within its minute)
  useEffect(() => {
    if (!disc0) return;
    const w = dbox.current?.clientWidth ?? 300;
    setDx(-(D_WIN * DCELL + 3 + (DCELL - 6) / 2 - w / 2));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const dFinish = () => {
    const r = dRun.current;
    if (!r) return;
    window.clearTimeout(r.timer);
    dRun.current = null;
    setDAnim(false);
    setDx(r.target);
    setDRolling(false);
    setDisc(r.d);
    haptic.ok();
    sfx(r.d.pct >= 75 ? "reward" : "coin");
  };
  const rollDisc = (d: { pct: number; until: number }) => {
    setTop(true);
    setDAnim(false);
    setDx(0);
    setDItems(dstrip(d.pct));
    setDRolling(true);
    const w = dbox.current?.clientWidth ?? 300;
    const target = -(D_WIN * DCELL + 3 + (DCELL - 6) / 2 - w / 2 + (Math.random() - 0.5) * 18);
    dRun.current = { d, target, timer: window.setTimeout(dFinish, D_MS + 100) };
    // after the panel has slid out
    window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => { if (!dRun.current) return; setDAnim(true); setDx(target); })), 450);
  };
  /** the discount that holds now (rolled and shown, not burned) */
  const live = disc && !dRolling && disc.until > now ? disc : null;
  const left = live ? Math.max(0, Math.min(TOOLBOX_DISC_MS, live.until - now)) : 0;
  const price = toolboxPrice(live?.pct ?? 0);
  const pending = useRef<{ pct: number; until: number } | null>(null);
  /** the spin under way: its end (a second tap ends it at once) */
  const run = useRef<{ id: string; target: number; timer: number } | null>(null);
  const finish = () => {
    const r = run.current;
    if (!r) return;
    window.clearTimeout(r.timer);
    run.current = null;
    setAnim(false);
    setX(r.target);
    setSpinning(false);
    setWon(r.id);
    haptic.ok();
    sfx(rarityOf(r.id) === "common" ? "coin" : "reward");
    // then the discount strip rolls the next spin's discount
    const d = pending.current;
    pending.current = null;
    if (d) rollDisc(d);
  };
  const tokens = state?.wallet.TOKEN ?? 0;
  const spin = async () => {
    if (run.current) { finish(); return; }
    if (dRun.current) { dFinish(); return; }
    if (spinning) return;
    haptic.tap();
    setSpinning(true);
    setWon(null);
    const r = await act<{ itemId: string; discount: { pct: number; until: number } }>("toolbox_spin");
    if (!r) { setSpinning(false); return; }
    // the discount used up (or burned): the old one goes off; the new one is shown after the main strip stops
    setDisc(null);
    pending.current = r.discount;
    // a fresh strip with the won part at WIN_AT, back to the start without animation, then the long run
    setAnim(false);
    setX(0);
    setItems(strip(r.itemId));
    const w = box.current?.clientWidth ?? 320;
    // the won cell stops right under the marker (a little off its middle, like a real wheel)
    const jitter = (Math.random() - 0.5) * 24;
    const target = -(WIN_AT * CELL + 3 + (CELL - 6) / 2 - w / 2 + jitter);
    run.current = { id: r.itemId, target, timer: window.setTimeout(finish, SPIN_MS + 100) };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!run.current) return;
      setAnim(true);
      setX(target);
      sfx("spin");
    }));
  };
  const byRarity = useMemo(() => (["epic", "rare", "common"] as const).map((t) => ({ t, list: TOOLBOX_PARTS.filter((p) => p.rarity === t) })), []);
  return (
    <Modal onClose={onClose} wide className="tb-win">
      {/* above: the discount slate slides out from behind the main one after the first spin */}
      <div className={`tb-top ${top ? "open" : ""}`} aria-hidden={!top}>
        <div className="tb-top-in">
          <div className="tb-droll" ref={dbox}>
            <div className="tb-dstrip" style={{ transform: `translateX(${dx}px)`, transition: dAnim ? `transform ${D_MS}ms cubic-bezier(0.1, 0.6, 0.15, 1)` : "none" }}>
              {dItems.map((v, i) => <div key={i} className={`tb-dcell d${v} ${!dRolling && disc && i === D_WIN ? "won" : ""}`}><b className="num">−{v}%</b></div>)}
            </div>
            <i className="tb-mark" aria-hidden="true" />
          </div>
          <div className="tb-dnote num">{dRolling ? "\u00a0" : live ? <>Скидка {live.pct}% · <b>0:{String(Math.ceil(left / 1000)).padStart(2, "0")}</b></> : "Скидка сгорела"}</div>
        </div>
      </div>
      {/* the main slate; the second slate with the contents slides out from behind it */}
      <div className="tb-main">
      <h3 className="display tb-h">Строительный ящик</h3>
      <div className="tb-roll" ref={box}>
        <div className="tb-strip" style={{ transform: `translateX(${x}px)`, transition: anim ? `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.6, 0.12, 1)` : "none" }}>
          {items.map((id, i) => (
            <div key={i} className={`tb-cell r-${rarityOf(id)} ${won && i === WIN_AT ? "won" : ""}`}><ItemArt id={id} size={48} /></div>
          ))}
        </div>
        <i className="tb-mark" aria-hidden="true" />
      </div>
      <div className="tb-got">{won ? <><b className={`r-${rarityOf(won)}`}>{itemById(won)?.name}</b></> : <span>&nbsp;</span>}</div>
      <button type="button" className="btn gold tb-spin" disabled={!spinning && !dRolling && tokens < price} onClick={() => void spin()}>
        {spinning || dRolling ? "Пропустить" : price === 0 ? "Крутить бесплатно" : <>Крутить <span className="num row" style={{ gap: 3 }}>{live && <s className="tb-old">{toolboxPrice(0)}</s>}{price}<Icon name="TOKEN" size={18} /></span></>}
      </button>
      <button type="button" className={`tb-more-btn ${open ? "on" : ""}`} onClick={() => { haptic.tap(); setOpen((o) => !o); }} aria-expanded={open}>Что в ящике</button>
      </div>
      <div className={`tb-more ${open ? "open" : ""}`}><div className="tb-drawer"><div className="tb-more-in">
      <div className="tb-list">
        {byRarity.map(({ t, list }) => (
          <div key={t} className="tb-tier">
            <span className={`tb-tier-name r-${t}`}>{t === "epic" ? "Очень редкие" : t === "rare" ? "Редкие" : "Обычные"} · {Math.round(TOOLBOX_ODDS[t] * 100)}%</span>
            <div className="tb-tier-grid">
              {list.map((p) => <span key={p.id} className={`tb-mini r-${t}`} title={p.name}><ItemArt id={p.id} size={34} /></span>)}
            </div>
          </div>
        ))}
      </div>
      </div></div></div>
    </Modal>
  );
}
