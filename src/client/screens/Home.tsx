"use client";
import { useMemo, useState } from "react";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { AnimatedNumber, Avatar, Bar, Icon, Sheet, TokenLogo } from "../ui.tsx";
import { cur, money, pct } from "../format.ts";
import { haptic } from "../telegram.ts";
import { CURRENCY_UNLOCK_LEVEL, EQUIPMENT, EXCHANGE_PAIRS, exchangeQuote, equipmentByTier, type Currency } from "../../shared/economy.ts";

const TUTORIAL_TEXT: Record<number, { title: string; text: string; cta: string }> = {
  0: { title: "Шаг 1 · Первые деньги", text: "Отработай смену за старым ноутбуком и получи первые рубли.", cta: "Работать" },
  1: { title: "Шаг 2 · Купи доллары", text: "Обменяй рубли на USD в обменнике.", cta: "Открыть обменник" },
  2: { title: "Шаг 3 · Купи SOL", text: "Мем-токены торгуются за SOL. Обменяй USD → SOL.", cta: "Открыть обменник" },
  3: { title: "Шаг 4 · Первый мемкоин", text: "Зайди на рынок и купи любой мем-токен за SOL.", cta: "На рынок" },
  4: { title: "Шаг 5 · Слей его", text: "Продай позицию. Сумма продажи станет уроном по боссу!", cta: "К позиции" },
  5: { title: "Шаг 6 · Твой босс", text: "Твоя продажа ударила по боссу. И по боссам всех игроков сервера.", cta: "К боссу" },
};

export function HomeScreen() {
  const { game, run, busy, energyNow, setTab, openSheet, predictedBoss, globalLive, live, openToken, market } = useGame();
  const [floaters, setFloaters] = useState<{ id: number; text: string }[]>([]);
  if (!game) return null;
  const p = game.player;
  const eq = equipmentByTier(p.equipmentTier);
  const step = p.tutorialStep;
  const tut = TUTORIAL_TEXT[step];
  const portfolio = game.positions.reduce((s, x) => s + x.valueUsd, 0);
  const pnl = game.positions.reduce((s, x) => s + x.pnlUsd, 0);

  const work = () => {
    haptic.tap();
    run("work", api.work, (r) => {
      const id = Date.now() + Math.random();
      setFloaters((f) => [...f.slice(-5), { id, text: `+${r.earned} ₽` }]);
      setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 900);
    });
  };

  const tutorialAction = () => {
    if (step === 0) work();
    else if (step === 1 || step === 2) openSheet("exchange");
    else if (step === 3) setTab("market");
    else if (step === 4) {
      const pos = game.positions[0];
      if (pos) openToken(pos.tokenId);
      else setTab("market");
    } else if (step === 5) setTab("boss");
  };

  return (
    <div className="screen home">
      <section className="card profile-card">
        <Avatar url={p.photoUrl} name={p.name} />
        <div className="profile-main">
          <div className="profile-name">{p.name}{p.isGuest && <span className="chip chip-muted">гость</span>}</div>
          <div className="profile-level">
            <span className="lvl">LVL {p.level}</span>
            <Bar value={p.xp} max={p.xpNext} tone="xp" />
            <span className="muted small">{p.xp}/{p.xpNext}</span>
          </div>
        </div>
      </section>

      {tut && (
        <section className="card tutorial">
          <div className="tutorial-step">{tut.title}</div>
          <p>{tut.text}</p>
          <div className="row gap">
            <button className="btn btn-primary" onClick={tutorialAction}>{tut.cta}</button>
            <button className="btn btn-ghost small" onClick={() => run("skip", () => api.tutorial("skip"))}>Пропустить</button>
          </div>
        </section>
      )}

      <section className="room-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="room" src={`/assets/rooms/room-${eq.tier}-${eq.id}.svg`} alt={eq.name} />
        <div className="room-label">
          <span>{eq.name}</span>
          <span className="muted small">+{eq.passiveRubPerHour.toLocaleString("ru-RU")} ₽/ч пассивно</span>
        </div>
        <div className="floaters">
          {floaters.map((f) => <span key={f.id} className="floater">{f.text}</span>)}
        </div>
      </section>

      <section className="actions-grid">
        <button className={`action action-work ${busy === "work" ? "busy" : ""}`} onClick={work} disabled={energyNow < 1}>
          <span className="action-title">Работать</span>
          <span className="action-sub">+{eq.workRub} ₽ · 1 <Icon name="energy" size={12} /></span>
        </button>
        <button className="action" onClick={() => openSheet("exchange")}>
          <span className="action-title">Обменник</span>
          <span className="action-sub">₽ · $ · SOL{p.level >= CURRENCY_UNLOCK_LEVEL.BTC ? " · BTC" : ""}</span>
        </button>
        <button className="action" onClick={() => setTab("market")}>
          <span className="action-title">Рынок</span>
          <span className="action-sub">{market.length} мемкоинов</span>
        </button>
        <button className="action action-boss" onClick={() => setTab("boss")}>
          <span className="action-title">Босс #{predictedBoss?.index}</span>
          <span className="action-sub">{money(predictedBoss?.remaining ?? 0, { compact: true })} MCAP</span>
        </button>
      </section>

      <section className="card global-card">
        <div className="row between">
          <span className="muted small">GLOBAL DAMAGE</span>
          <span className={`live ${live ? "on" : ""}`}>{live ? "LIVE" : "sync"}</span>
        </div>
        <div className="global-total"><AnimatedNumber value={globalLive} format={(v) => money(v)} /></div>
        <div className="muted small">Каждый слив любого игрока бьёт по твоему боссу</div>
      </section>

      {game.positions.length > 0 && (
        <section className="card">
          <div className="row between">
            <h3>Портфель</h3>
            <span className={pnl >= 0 ? "up" : "down"}>{money(portfolio)} · {money(pnl, { sign: true })}</span>
          </div>
          <div className="list">
            {game.positions.map((x) => (
              <button key={x.tokenId} className="list-row" onClick={() => openToken(x.tokenId)}>
                <TokenLogo art={x.art as never} size={34} />
                <div className="grow">
                  <div className="strong">${x.ticker}</div>
                  <div className="muted small">{money(x.costUsd)} вложено</div>
                </div>
                <div className="right">
                  <div className="strong">{money(x.valueUsd)}</div>
                  <div className={`small ${x.roi >= 0 ? "up" : "down"}`}>{pct(x.roi)}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="row between">
          <h3>Рабочее место</h3>
          <button className="btn btn-ghost small" onClick={() => setTab("bag")}>Улучшить →</button>
        </div>
        <div className="muted small">
          Уровень {eq.tier}/{EQUIPMENT.length} · энергия {eq.maxEnergy} · урон +{Math.round(eq.damageBonus * 100)}%
        </div>
      </section>
    </div>
  );
}

// ---------------- Exchange ----------------
const ALL: Currency[] = ["RUB", "USD", "SOL", "BTC"];

export function ExchangeSheet() {
  const { sheet, openSheet, game, run, busy, toast } = useGame();
  const step = game?.player.tutorialStep ?? 6;
  const [from, setFrom] = useState<Currency>("RUB");
  const [to, setTo] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const open = sheet === "exchange";
  const level = game?.player.level ?? 1;

  // Tutorial nudges the right pair.
  const suggested = useMemo(() => (step === 2 ? (["USD", "SOL"] as const) : step === 1 ? (["RUB", "USD"] as const) : null), [step]);
  const [appliedHint, setAppliedHint] = useState<number>(-1);
  if (open && suggested && appliedHint !== step) {
    setAppliedHint(step);
    setFrom(suggested[0]);
    setTo(suggested[1]);
    setAmount("");
  }
  if (!game) return null;

  const toOptions = EXCHANGE_PAIRS.filter(([a]) => a === from).map(([, b]) => b);
  const validTo = toOptions.includes(to) ? to : toOptions[0];
  const bal = game.balances[from];
  const val = Number(amount.replace(",", "."));
  const quote = val > 0 ? exchangeQuote(from, validTo, val, game.serverTime + (Date.now() - game.serverTime)) : null;
  const locked = (c: Currency) => level < CURRENCY_UNLOCK_LEVEL[c];

  const submit = async () => {
    if (!(val > 0)) return toast("err", "Введите сумму");
    if (val > bal + 1e-9) return toast("err", `Недостаточно ${from}`);
    const r = await run("exchange", () => api.exchange(from, validTo, val));
    if (r) {
      haptic.ok();
      toast("ok", `Получено ${cur(r.received, validTo)}`);
      setAmount("");
      if (step <= 2) openSheet(null);
    }
  };

  return (
    <Sheet open={open} onClose={() => openSheet(null)} title="Обменник">
      <div className="ex-pick">
        {ALL.map((c) => (
          <button key={c} className={`curbtn ${from === c ? "on" : ""}`} disabled={locked(c)} onClick={() => { setFrom(c); setAmount(""); }}>
            <Icon name={c.toLowerCase() as "rub"} size={20} />
            <span>{c}</span>
            {locked(c) && <small>LVL {CURRENCY_UNLOCK_LEVEL[c]}</small>}
          </button>
        ))}
      </div>
      <div className="ex-arrow">↓</div>
      <div className="ex-pick">
        {toOptions.map((c) => (
          <button key={c} className={`curbtn ${validTo === c ? "on" : ""}`} disabled={locked(c)} onClick={() => setTo(c)}>
            <Icon name={c.toLowerCase() as "rub"} size={20} />
            <span>{c}</span>
            {locked(c) && <small>LVL {CURRENCY_UNLOCK_LEVEL[c]}</small>}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="muted small">Отдаёте · баланс {cur(bal, from)}</span>
        <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} />
      </label>
      <div className="row gap">
        {[0.25, 0.5, 1].map((k) => (
          <button key={k} className="btn btn-chip" onClick={() => setAmount(String(Math.floor(bal * k * 1e6) / 1e6))}>
            {k === 1 ? "MAX" : `${k * 100}%`}
          </button>
        ))}
      </div>
      <div className="quote">
        <div className="row between"><span className="muted">Курс</span><span>1 {from} = {quote ? quote.rate.toPrecision(5) : exchangeQuote(from, validTo, 1, Date.now()).rate.toPrecision(5)} {validTo}</span></div>
        <div className="row between"><span className="muted">Спред 1%</span><span>{quote ? money(quote.feeUsd) : "—"}</span></div>
        <div className="row between big"><span>Получите</span><span className="strong">{quote ? cur(quote.received, validTo) : "—"}</span></div>
      </div>
      <button className="btn btn-primary wide" disabled={busy === "exchange" || !quote} onClick={submit}>
        {busy === "exchange" ? "Обмениваем…" : `Обменять ${from} → ${validTo}`}
      </button>
      <p className="muted small center">Курсы меняются в реальном времени. Финальный курс фиксирует сервер.</p>
    </Sheet>
  );
}
