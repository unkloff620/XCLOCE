"use client";
/*
 * «Барыга на газели» (content/van.ts): the weekend van in the yard. A tap on it — its open back (public/assets/van/
 * trunk.webp, tools/van/build-van.py): on the left door «Меняла» — the paper «Обмен» (the week's currency, папиросы or
 * зубы, for roubles / метро tokens at the visit's rate), on the right door «Акции» — the paper «Посмотреть» (the packs
 * on the slate in the cargo opening, ‹ › between them under the van, each once a visit; the slate bronze / silver / gold by the pack, its outline shining).
 */
import { useLayoutEffect, useRef, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { clock, full } from "../format.ts";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import type { Currency } from "../../content/currencies.ts";
import { VAN_PACKS, vanPackOf, type VanGive } from "../../content/van.ts";
import { ACH_BOX_COST } from "../../content/ach-box.ts";
import type { Granted } from "../api.ts";

const V = "/assets/van";
/* the marker-drawn signs on the papers and the red arrows on the carpet (as on the artist's screens) */
const IcSwap = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 8a7.5 7.5 0 0 0-13.2-2.4M5 16a7.5 7.5 0 0 0 13.2 2.4" /><path d="M5.5 2.8v3.4h3.4M18.5 21.2v-3.4h-3.4" /></g></svg>
);
const IcEye = () => (
  <svg viewBox="0 0 24 24" width="30" height="26" aria-hidden="true"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z" fill="currentColor" /><circle cx="12" cy="12" r="3.6" fill="#f4e2b8" /><circle cx="12" cy="12" r="1.7" fill="currentColor" /></svg>
);
const IcArrow = ({ flip }: { flip?: boolean }) => (
  <svg viewBox="0 0 32 24" width="34" height="26" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M28 6c-2 9-11 12-20 9" fill="none" stroke="#d8261c" strokeWidth="4.2" strokeLinecap="round" /><path d="M11 8.5 5 15l7.5 4.5" fill="none" stroke="#d8261c" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const left = (ms: number) => (ms > 86_400_000 ? `${Math.floor(ms / 86_400_000)} д ${Math.floor((ms % 86_400_000) / 3_600_000)} ч` : clock(ms));
/** the slate of each pack */
const PLAQUE: Record<string, "free" | "bronze" | "silver" | "gold"> = { free: "free", pacan: "bronze", blat: "silver", avtor: "gold" };

/** the van standing in the back yard: the body idles on its wheels, smoke from under it (placed on the yard's sheet) */
export function YardVan({ onOpen, focusable }: { onOpen: () => void; focusable: boolean }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="yard-van-wheels" src={`${V}/wheels.webp`} alt="" draggable={false} />
      <button type="button" className="yard-van" onClick={() => { haptic.tap(); onOpen(); }} aria-label="Барыга на газели" title="Барыга на газели" tabIndex={focusable ? 0 : -1}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${V}/body.webp`} alt="" draggable={false} />
      </button>
      <span className="yard-van-smoke" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ ["--d" as string]: `${i * 0.55}s` }} />)}</span>
    </>
  );
}

export function VanWindow({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const now = useNow();
  const [door, setDoor] = useState<"ex" | "packs" | null>(null);
  const v = state?.van;
  const layer = useRef<HTMLDivElement>(null);
  const trunk = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  // how close the trunk comes: its opening, the bumper and the arrows by it (x 20–80%, y 3–90%) fill the window
  useLayoutEffect(() => {
    const fit = () => {
      const l = layer.current, t = trunk.current;
      if (!l || !t) return;
      const k = Math.min((l.clientWidth * 0.98) / (t.offsetWidth * 0.6), (l.clientHeight * 0.9) / (t.offsetHeight * 0.87));
      setZoom(Math.max(1, Math.min(2.6, k)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (layer.current) ro.observe(layer.current);
    return () => ro.disconnect();
  }, [v]);
  if (!v) return null;
  const pick = (d: "ex" | "packs") => { haptic.tap(); setDoor((x) => (x === d ? null : d)); };
  return (
    <div ref={layer} className={`van-layer ${door ? "near" : ""}`} role="dialog" aria-label="Барыга на газели" onClick={(e) => { if (e.target === e.currentTarget) (door ? setDoor(null) : onClose()); }}>
      <button type="button" className="van-x" onClick={onClose} aria-label="Закрыть">✕</button>
      {door && <button type="button" className="van-back" onClick={() => { haptic.tap(); setDoor(null); }} aria-label="К машине"><IcArrow /></button>}
      <div ref={trunk} className="van-trunk" style={{ transform: door ? `scale(${zoom})` : undefined }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${V}/trunk.webp`} alt="" draggable={false} />
        <button type="button" className={`van-paper l ${door === "ex" ? "on" : ""}`} onClick={() => pick("ex")}>
          <span className="van-paper-ic"><IcSwap /></span><b className="display">Обмен</b>
        </button>
        <button type="button" className={`van-paper r ${door === "packs" ? "on" : ""}`} onClick={() => pick("packs")}>
          <span className="van-paper-ic"><IcEye /></span><b className="display">Посмотреть</b>
        </button>
        {door && <i className="van-hold" aria-hidden="true" />}
        {door === "ex" && <VanExchange />}
        {door === "packs" && <VanPacks />}
      </div>
      <span className="van-when tiny">Барыга стоит до конца воскресенья · уедет через <b className="num">{left(v.until - now)}</b></span>
    </div>
  );
}

const NAME_GEN: Partial<Record<Currency, string>> = { PAP: "папирос", TOOTH: "зубов" };

/** «Обмен»: the slate (exchange.webp) — how many roubles (or tokens, ‹ ›), the price in the week's currency */
function VanExchange() {
  const { state, act, busy } = useGame();
  const v = state!.van!;
  const [give, setGive] = useState<VanGive>("RUB");
  const [qty, setQty] = useState("1");
  const have = state?.wallet[v.takes] ?? 0;
  // the most the player can take: what he has, at the visit's rate
  const most = Math.floor(have / v.rates[give]);
  const n = Math.min(most, Math.max(0, Math.floor(Number(qty) || 0)));
  const cost = v.rates[give] * n;
  const turn = () => { haptic.tap(); setGive((g) => (g === "RUB" ? "TOKEN" : "RUB")); };
  const go = async () => {
    const r = await act("van_exchange", { give, qty: n }, `+${n} ${give === "RUB" ? "₽" : "жетонов"}`);
    if (r) { haptic.ok(); sfx("coin"); }
  };
  return (
    <div className="van-panel">
      <div className="van-ex-paper">
        <b className="display">Сколько нужно {give === "RUB" ? "рублей" : "жетонов"}</b>
        <span className="van-ex-coin"><Icon name={give} size={56} /></span>
        <input inputMode="numeric" value={qty === "" ? "" : String(n)} onChange={(e) => { const t = e.target.value.replace(/[^0-9]/g, ""); setQty(t === "" ? "" : String(Math.min(most, Number(t)))); }} aria-label="Сколько" />
        <span className="display van-ex-price-h">Цена вопроса:</span>
        <span className="van-ex-price num">{full(cost)} <Icon name={v.takes} size={20} /></span>
        <span className="van-ex-rate">1 {give === "RUB" ? "₽" : "жетон"} = {full(v.rates[give])} {NAME_GEN[v.takes]} · есть {full(have)}</span>
      </div>
      <div className="van-ctl">
        <button type="button" className="van-arrow" onClick={turn} aria-label="Другая валюта"><IcArrow /></button>
        <button type="button" className="btn gold van-go" disabled={!n || busy === "van_exchange"} onClick={go}>{most < 1 ? "Не хватает" : "Обменять"}</button>
        <button type="button" className="van-arrow" onClick={turn} aria-label="Другая валюта"><IcArrow flip /></button>
      </div>
    </div>
  );
}

/** «Посмотреть»: a pack on its slate (this visit's contents, exact), ‹ › between the packs */
function VanPacks() {
  const { state, act, busy } = useGame();
  const v = state!.van!;
  const [i, setI] = useState(0);
  const [got, setGot] = useState<Granted | null>(null);
  const p = VAN_PACKS[i];
  const taken = v.taken.includes(p.id);
  const inside = vanPackOf(p, v.visit);
  const kind = PLAQUE[p.id] ?? "free";
  const turn = (d: number) => { haptic.tap(); setGot(null); setI((x) => (x + d + VAN_PACKS.length) % VAN_PACKS.length); };
  const take = async () => {
    const r = await act<{ reward: Granted }>("van_pack", { id: p.id }, p.price ? `Куплено: ${p.name}` : "Забрал бесплатную акцию");
    if (r) { haptic.big(); sfx("reward"); setGot(r.reward); }
  };
  const can = !p.price || (state?.wallet[p.price.currency] ?? 0) >= p.price.amount;
  return (
    <div className="van-panel">
      <div className={`van-plaque k-${kind}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${V}/plaque-${kind}.webp`} alt="" draggable={false} />
        {(kind === "gold" || kind === "silver") && <i className="van-plaque-rim" aria-hidden="true" />}
        <b className="van-plaque-name display">{p.price ? p.name : "Подгон от барыги"}</b>
        <div className={`van-plaque-in ${Object.keys(inside.currencies ?? {}).length + (inside.items ?? []).length + (inside.achPoints ? 1 : 0) > 9 ? "many" : ""}`}>
          {got ? <RewardChips r={got} size={18} /> : <>
            {Object.entries(inside.currencies ?? {}).map(([c, n]) => <span key={c}><Icon name={c} size={22} /><b className="num">+{full(n ?? 0)}</b></span>)}
            {!!inside.achPoints && <span><Icon name="case" size={22} /><b className="num">+{inside.achPoints / ACH_BOX_COST}</b></span>}
            {(inside.items ?? []).map((it) => <span key={it.id}><ItemArt id={it.id} size={24} /><b className="num">+{full(it.qty)}</b></span>)}
          </>}
        </div>
        <b className="van-plaque-price display">{p.price ? <>{full(p.price.amount)} <Icon name={p.price.currency} size={20} /></> : "Бесплатно"}</b>
      </div>
      <div className="van-ctl">
        <button type="button" className="van-arrow" onClick={() => turn(-1)} aria-label="Предыдущая акция"><IcArrow /></button>
        <button type="button" className="btn gold van-go" disabled={taken || !can || busy === "van_pack"} onClick={take}>
          {taken ? "Взято до пятницы" : !can ? "Не хватает" : p.price ? "Купить" : "Забрать"}
        </button>
        <button type="button" className="van-arrow" onClick={() => turn(1)} aria-label="Следующая акция"><IcArrow flip /></button>
      </div>
    </div>
  );
}
