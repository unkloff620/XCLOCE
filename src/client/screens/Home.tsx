"use client";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { AnimatedNumber, Bar, Icon, Sheet, TokenLogo } from "../ui.tsx";
import { cur, money, pct } from "../format.ts";
import { haptic } from "../telegram.ts";
import { Room, type MonitorTicker } from "../room/Room.tsx";
import { GameIcon } from "../icons.tsx";
import { CURRENCY_UNLOCK_LEVEL, EXCHANGE_PAIRS, exchangeQuote, equipmentByTier, type Currency } from "../../shared/economy.ts";

const TUTORIAL_TEXT: Record<number, { title: string; text: string; cta: string }> = {
  0: { title: "Шаг 1 · Первые деньги", text: "Тапни по комнате или нажми кнопку — отработай смену и получи рубли.", cta: "Работать" },
  1: { title: "Шаг 2 · Купи доллары", text: "Обменяй рубли на USD в обменнике.", cta: "Обменник" },
  2: { title: "Шаг 3 · Купи SOL", text: "Мем-токены торгуются за SOL. Обменяй USD → SOL.", cta: "Обменник" },
  3: { title: "Шаг 4 · Первый мемкоин", text: "Зайди на рынок и купи любой мем-токен.", cta: "На рынок" },
  4: { title: "Шаг 5 · Слей его", text: "Продай позицию — сумма продажи станет уроном по боссу!", cta: "К позиции" },
  5: { title: "Шаг 6 · Твой босс", text: "Твой слив ударил по боссу. И по боссам всех игроков.", cta: "К боссу" },
};

function useCountdown(target: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, target - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { ms, text: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, short: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
}

export function HomeScreen() {
  const { game, run, energyNow, setTab, openSheet, openMore, predictedBoss, globalLive, live, openToken, market, toast } = useGame();
  const [floaters, setFloaters] = useState<{ id: number; text: string; x: number; y: number }[]>([]);
  const tickers: MonitorTicker[] = useMemo(
    () => market.map((t) => ({ ticker: t.ticker, change: t.change1h, history: t.history })),
    [market],
  );
  const daily = useCountdown(game?.daily.availableAt ?? 0);
  const regenLeft = game ? game.player.energyRegenMs - ((Date.now() - game.serverTime) % game.player.energyRegenMs) : 0;
  const energyTimer = useCountdown(Date.now() + regenLeft);
  if (!game) return null;
  const p = game.player;
  const eq = equipmentByTier(p.equipmentTier);
  const step = p.tutorialStep;
  const tut = TUTORIAL_TEXT[step];
  const portfolio = game.positions.reduce((s, x) => s + x.valueUsd, 0);
  const pnl = game.positions.reduce((s, x) => s + x.pnlUsd, 0);
  const questsReady = game.quests.filter((q) => q.done && !q.claimed).length;

  const work = (x = 50, y = 55) => {
    if (energyNow < 1) {
      toast("err", "Нет энергии — она восстанавливается со временем");
      return;
    }
    haptic.tap();
    run("work", api.work, (r) => {
      const id = Date.now() + Math.random();
      setFloaters((f) => [...f.slice(-6), { id, text: `+${r.earned} ₽`, x, y }]);
      setTimeout(() => setFloaters((f) => f.filter((v) => v.id !== id)), 900);
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

  const claimDaily = () => {
    if (!game.daily.canClaim) return setTab("quests");
    run("daily", api.claimDaily, (r) => {
      haptic.ok();
      toast("ok", `День ${r.day}: награда получена!`);
    });
  };

  return (
    <div className="screen home">
      <div className="stat-row">
        <div className="stat-pill xp-pill">
          <span className="xp-badge">XP</span>
          <span className="lvl-text">Lv. {p.level}</span>
          <div className="grow"><Bar value={p.xp} max={p.xpNext} tone="xp" /></div>
          <span className="small muted mono">{p.xp.toLocaleString("en-US")} / {p.xpNext.toLocaleString("en-US")}</span>
        </div>
        <div className="stat-pill energy-pill">
          <Icon name="energy" size={22} />
          <div className="grow">
            <div className="row between"><b className="mono">{Math.floor(energyNow)} / {p.maxEnergy}</b></div>
            <Bar value={energyNow} max={p.maxEnergy} tone="energy" />
            <small className="muted">{energyNow >= p.maxEnergy ? "полная" : `+1 через ${energyTimer.short}`}</small>
          </div>
          <button className="plus-btn" onClick={() => openMore("upgrades")} aria-label="Улучшить энергию">+</button>
        </div>
      </div>

      <section className="scene" onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        work(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
      }}>
        <Room tier={p.equipmentTier} outfit={p.outfit} tickers={tickers} />
        <div className="floaters">
          {floaters.map((f) => <span key={f.id} className="floater" style={{ left: `${f.x}%`, top: `${f.y}%` }}>{f.text}</span>)}
        </div>
        <div className="widgets left" onClick={(e) => e.stopPropagation()}>
          <button className="widget" onClick={claimDaily}>
            <GameIcon name="chest" size={44} />
            <span className="widget-label">{game.daily.canClaim ? "Забрать" : daily.text}</span>
            {game.daily.canClaim && <span className="dot" />}
          </button>
          <button className="widget" onClick={() => setTab("quests")}>
            <GameIcon name="calendar" size={40} />
            <span className="widget-label">Daily</span>
            {questsReady > 0 && <span className="dot" />}
          </button>
        </div>
        <div className="widgets right" onClick={(e) => e.stopPropagation()}>
          <button className="widget" onClick={() => openSheet("events")}>
            <GameIcon name="megaphone" size={40} />
            <span className="widget-label">Events</span>
            <span className={`dot ${live ? "live-dot" : "off"}`} />
          </button>
          <button className="widget" onClick={() => openMore("wardrobe")}>
            <GameIcon name="hoodie" size={40} />
            <span className="widget-label">Стиль</span>
          </button>
          <button className="widget" onClick={() => openMore("top")}>
            <GameIcon name="trophy" size={40} />
            <span className="widget-label">Топ</span>
          </button>
        </div>
        <div className="scene-hint" onClick={(e) => e.stopPropagation()}>
          {tut ? (
            <div className="tut-bubble">
              <div className="tutorial-step">{tut.title}</div>
              <div className="small">{tut.text}</div>
              <div className="row gap">
                <button className="btn btn-primary small" onClick={tutorialAction}>{tut.cta}</button>
                <button className="btn btn-ghost small" onClick={() => run("skip", () => api.tutorial("skip"))}>Пропустить</button>
              </div>
            </div>
          ) : (
            <div className="work-chip">👆 Тапай по комнате: +{eq.workRub} ₽ за 1 ⚡</div>
          )}
        </div>
      </section>

      <section className="big-cards">
        <button className="big-card c-green" onClick={() => openMore("upgrades")}>
          <span className="big-icon"><GameIcon name="hammer" size={46} /></span>
          <b>Upgrades</b>
          <small>Улучши сетап<br />Зарабатывай больше</small>
        </button>
        <button className="big-card c-violet" onClick={() => setTab("quests")}>
          <span className="big-icon"><GameIcon name="scroll" size={46} /></span>
          <b>Quests</b>
          <small>Выполняй задания<br />Получай награды</small>
          {questsReady > 0 && <span className="dot" />}
        </button>
        <button className="big-card c-gold" onClick={() => openSheet("exchange")}>
          <span className="big-icon"><GameIcon name="swap" size={46} /></span>
          <b>Exchange</b>
          <small>Меняй валюты<br />Расти капитал</small>
        </button>
      </section>

      <section className="card global-card" onClick={() => setTab("boss")}>
        <div className="row between">
          <span className="muted small">GLOBAL DAMAGE · босс #{predictedBoss?.index} · {money(predictedBoss?.remaining ?? 0, { compact: true })} MCAP</span>
          <span className={`live ${live ? "on" : ""}`}>{live ? "LIVE" : "sync"}</span>
        </div>
        <div className="global-total"><AnimatedNumber value={globalLive} format={(v) => money(v)} /></div>
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
    </div>
  );
}

export function EventsSheet() {
  const { sheet, openSheet, feed } = useGame();
  const items = [...feed].reverse();
  return (
    <Sheet open={sheet === "events"} onClose={() => openSheet(null)} title="События сервера">
      <div className="feed">
        {items.length ? items.map((f) => (
          <div key={f.id} className={`feed-item feed-${f.kind}`}>{f.text}</div>
        )) : <div className="empty">Пока тихо</div>}
      </div>
      <p className="muted small center">Новости — это игровые события. Они влияют на внутриигровой рынок.</p>
    </Sheet>
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
