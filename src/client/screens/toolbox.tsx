"use client";
/*
 * «Строительный ящик» (content/toolbox.ts): a CS2-style roulette. The strip of parts runs right to left and slows down
 * under the marker on the part the server rolled; under it — what the box holds, by rarity.
 */
import { useMemo, useRef, useState } from "react";
import { Modal } from "../ui.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { itemById } from "../../content/items.ts";
import { TOOLBOX_ODDS, TOOLBOX_PARTS, TOOLBOX_PRICE } from "../../content/toolbox.ts";
import { useGame } from "../store.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";

const CELL = 92;          // px, one cell of the strip with its gap
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

export function ToolboxWindow({ onClose }: { onClose: () => void }) {
  const { state, act } = useGame();
  const [items, setItems] = useState<string[]>(() => strip());
  const [x, setX] = useState(0);
  const [anim, setAnim] = useState(false);
  const [won, setWon] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
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
  };
  const tokens = state?.wallet.TOKEN ?? 0;
  const spin = async () => {
    if (run.current) { finish(); return; }
    if (spinning) return;
    haptic.tap();
    setSpinning(true);
    setWon(null);
    const r = await act<{ itemId: string }>("toolbox_spin");
    if (!r) { setSpinning(false); return; }
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
    <Modal title="Строительный ящик" onClose={onClose} wide className="tb-win">
      <div className="tb-roll" ref={box}>
        <div className="tb-strip" style={{ transform: `translateX(${x}px)`, transition: anim ? `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.6, 0.12, 1)` : "none" }}>
          {items.map((id, i) => (
            <div key={i} className={`tb-cell r-${rarityOf(id)} ${won && i === WIN_AT ? "won" : ""}`}><ItemArt id={id} size={56} /></div>
          ))}
        </div>
        <i className="tb-mark" aria-hidden="true" />
      </div>
      <div className="tb-got">{won ? <><b className={`r-${rarityOf(won)}`}>{itemById(won)?.name}</b></> : <span>&nbsp;</span>}</div>
      <button type="button" className="btn gold tb-spin" disabled={(!spinning && tokens < TOOLBOX_PRICE)} onClick={() => void spin()}>
        {spinning ? "Пропустить" : <>Крутить <span className="num row" style={{ gap: 3 }}>{TOOLBOX_PRICE}<Icon name="TOKEN" size={18} /></span></>}
      </button>
      <button type="button" className={`tb-more-btn ${open ? "on" : ""}`} onClick={() => { haptic.tap(); setOpen((o) => !o); }} aria-expanded={open}>Что в ящике</button>
      {/* the contents unfold smoothly downward (grid rows 0fr → 1fr); the window's top stays where it is */}
      <div className={`tb-more ${open ? "open" : ""}`}><div className="tb-more-in">
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
      </div></div>
    </Modal>
  );
}
