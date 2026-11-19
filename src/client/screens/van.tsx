"use client";
/*
 * «Барыга на газели» (content/van.ts): the weekend van in the yard. Two doors: «Меняла» — the week's currency (папиросы
 * or зубы) for roubles / метро tokens at the visit's rate; «Акции» — the packs, one at a time with ‹ ›, each once a visit.
 * The van's own pictures come later (the user draws them): for now a plain window on the game's panels.
 */
import { useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Modal, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { clock, full } from "../format.ts";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { CURRENCY_DEFS, type Currency } from "../../content/currencies.ts";
import { VAN_CASE, VAN_PACKS, type VanGive } from "../../content/van.ts";
import type { Granted } from "../api.ts";

const left = (ms: number) => (ms > 86_400_000 ? `${Math.floor(ms / 86_400_000)} д ${Math.floor((ms % 86_400_000) / 3_600_000)} ч` : clock(ms));

export function VanWindow({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const now = useNow();
  const [door, setDoor] = useState<"ex" | "packs" | null>(null);
  const v = state?.van;
  if (!v) return null;
  return (
    <Modal title="Барыга на газели" onClose={onClose}>
      <div className="col" style={{ gap: 12 }}>
        <span className="tiny muted">Приезжает по пятницам и стоит до конца воскресенья. Уедет через <b className="num">{left(v.until - now)}</b>.</span>
        {door === null && (
          <div className="van-doors">
            <button type="button" className="van-door" onClick={() => { haptic.tap(); setDoor("ex"); }}>
              <b className="display">Меняла</b><span className="small">⇄ Обмен</span>
            </button>
            <button type="button" className="van-door" onClick={() => { haptic.tap(); setDoor("packs"); }}>
              <b className="display">Акции</b><span className="small">% Посмотреть</span>
            </button>
          </div>
        )}
        {door === "ex" && <VanExchange onBack={() => setDoor(null)} />}
        {door === "packs" && <VanPacks onBack={() => setDoor(null)} />}
      </div>
    </Modal>
  );
}

const NAME_GEN: Partial<Record<Currency, string>> = { PAP: "папирос", TOOTH: "зубов" };

function VanExchange({ onBack }: { onBack: () => void }) {
  const { state, act, busy } = useGame();
  const v = state!.van!;
  const [give, setGive] = useState<VanGive>("RUB");
  const [qty, setQty] = useState("1");
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  const rate = v.rates[give];
  const cost = rate * n;
  const have = state?.wallet[v.takes] ?? 0;
  const go = async () => {
    const r = await act("van_exchange", { give, qty: n }, `+${n} ${give === "RUB" ? "₽" : "жетонов"}`);
    if (r) { haptic.ok(); sfx("coin"); }
  };
  return (
    <div className="col van-card" style={{ gap: 10 }}>
      <span className="small">На этой неделе барыга берёт <b>{CURRENCY_DEFS[v.takes].name.toLowerCase()}</b> <Icon name={v.takes} size={18} /> · есть <b className="num">{full(have)}</b></span>
      <div className="van-gives">
        {(["RUB", "TOKEN"] as const).map((g) => (
          <button key={g} type="button" className={`van-give ${give === g ? "on" : ""}`} onClick={() => { haptic.tap(); setGive(g); }}>
            <Icon name={g} size={34} />
            <b>{CURRENCY_DEFS[g].name}</b>
            <span className="tiny num">1 = {full(v.rates[g])} {NAME_GEN[v.takes]}</span>
          </button>
        ))}
      </div>
      <label className="van-qty">
        <span className="small">Сколько нужно {give === "RUB" ? "рублей" : "жетонов"}</span>
        <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, ""))} aria-label="Сколько" />
      </label>
      <span className="small">Цена вопроса: <b className="num">{full(cost)}</b> <Icon name={v.takes} size={16} /></span>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn dark" onClick={onBack}>Назад</button>
        <button type="button" className="btn gold grow" disabled={!n || cost > have || busy === "van_exchange"} onClick={go}>{cost > have ? "Не хватает" : "Обменять"}</button>
      </div>
    </div>
  );
}

function VanPacks({ onBack }: { onBack: () => void }) {
  const { state, act, busy } = useGame();
  const v = state!.van!;
  const [i, setI] = useState(0);
  const [got, setGot] = useState<Granted | null>(null);
  const p = VAN_PACKS[i];
  const taken = v.taken.includes(p.id);
  const turn = (d: number) => { haptic.tap(); setGot(null); setI((x) => (x + d + VAN_PACKS.length) % VAN_PACKS.length); };
  const take = async () => {
    const r = await act<{ reward: Granted }>("van_pack", { id: p.id }, p.price ? `Куплено: ${p.name}` : "Забрал бесплатную акцию");
    if (r) { haptic.big(); sfx("reward"); setGot(r.reward); }
  };
  const can = !p.price || (state?.wallet[p.price.currency] ?? 0) >= p.price.amount;
  return (
    <div className="col van-card" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" className="btn dark sm" onClick={() => turn(-1)} aria-label="Предыдущая акция">‹</button>
        <b className="display">{p.name}</b>
        <button type="button" className="btn dark sm" onClick={() => turn(1)} aria-label="Следующая акция">›</button>
      </div>
      {got ? <RewardChips r={got} size={18} /> : (
        <div className="van-pack">
          {Object.entries(p.currencies).map(([c, r]) => <span key={c}><Icon name={c} size={24} /><b className="num">{r![0] === r![1] ? full(r![0]) : `${full(r![0])}–${full(r![1])}`}</b></span>)}
          {Object.entries(p.items).map(([id, r]) => <span key={id}>{id === VAN_CASE ? <Icon name="case" size={24} /> : <ItemArt id={id} size={26} />}<b className="num">{r![0]}–{r![1]}</b></span>)}
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn dark" onClick={onBack}>Назад</button>
        <button type="button" className="btn gold grow" disabled={taken || !can || busy === "van_pack"} onClick={take}>
          {taken ? "Уже взято — до следующей пятницы" : p.price ? <>Купить · {full(p.price.amount)} <Icon name={p.price.currency} size={16} /></> : "Бесплатно — забрать"}
        </button>
      </div>
    </div>
  );
}
