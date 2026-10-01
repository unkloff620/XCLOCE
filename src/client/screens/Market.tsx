"use client";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "../store.tsx";
import { api, type TokenPublic } from "../api.ts";
import { Bar, Icon, PriceChart, Segmented, Sparkline, TokenLogo } from "../ui.tsx";
import { ago, money, num, pct, price } from "../format.ts";
import { haptic } from "../telegram.ts";
import { riskLabel } from "../../shared/tokens.ts";
import { comboMultiplier, COMBO_WINDOW_MS, equipmentByTier, MIN_TRADE_USD, toolById, TRADE_FEE, DUMP_TOOLS } from "../../shared/economy.ts";

type Sort = "trend" | "mcap" | "risk";

function RiskChip({ score }: { score: number }) {
  const r = riskLabel(score);
  return <span className={`risk risk-${r.level}`}>{r.label}</span>;
}

function RegimeChip({ regime }: { regime: string }) {
  if (regime === "pump") return <span className="chip chip-up">PUMP</span>;
  if (regime === "dump") return <span className="chip chip-down">DUMP</span>;
  if (regime === "rugged") return <span className="chip chip-dead">RUGGED</span>;
  if (regime === "recovering") return <span className="chip chip-info">CTO</span>;
  return null;
}

export function MarketScreen() {
  const { market, openToken, game } = useGame();
  const [sort, setSort] = useState<Sort>("trend");
  const sorted = useMemo(() => {
    const arr = [...market];
    if (sort === "trend") arr.sort((a, b) => b.change1h - a.change1h);
    if (sort === "mcap") arr.sort((a, b) => b.marketCap - a.marketCap);
    if (sort === "risk") arr.sort((a, b) => a.risk - b.risk);
    return arr;
  }, [market, sort]);
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>Мем-рынок</h2>
        <span className="muted small">SOL ≈ {money(game?.rates.SOL ?? 0)}</span>
      </div>
      <Segmented value={sort} onChange={setSort} options={[{ value: "trend", label: "🔥 Тренды" }, { value: "mcap", label: "Mcap" }, { value: "risk", label: "Надёжные" }]} />
      <div className="list market-list">
        {sorted.map((t) => (
          <button key={t.id} className="list-row token-row" onClick={() => openToken(t.id)}>
            <TokenLogo art={t.art} size={42} />
            <div className="grow minw0">
              <div className="row gap-s"><span className="strong ellipsis">{t.name}</span><RegimeChip regime={t.regime} /></div>
              <div className="muted small ellipsis">${t.ticker} · {money(t.marketCap, { compact: true })}</div>
              <RiskChip score={t.risk} />
            </div>
            <Sparkline data={t.history} width={56} height={26} />
            <div className="right price-col">
              <div className="strong mono">{price(t.price)}</div>
              <div className={`small ${t.change1h >= 0 ? "up" : "down"}`}>{pct(t.change1h)}</div>
            </div>
          </button>
        ))}
        {!market.length && <div className="empty">Загружаем рынок…</div>}
      </div>
      <p className="muted small center">Игровой рынок. Цены симулирует сервер и не являются финансовыми данными.</p>
    </div>
  );
}

export function TokenScreen({ id }: { id: string }) {
  const { openToken, game, market, run, busy, energyNow, toast, setTab } = useGame();
  const [token, setToken] = useState<TokenPublic | null>(() => market.find((t) => t.id === id) ?? null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [sol, setSol] = useState("");
  const [fraction, setFraction] = useState(1);
  const summary = market.find((t) => t.id === id);

  useEffect(() => {
    let alive = true;
    const load = () => api.token(id).then((r) => alive && setToken(r.token)).catch(() => undefined);
    load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, summary?.price]);

  const pos = game?.positions.find((p) => p.tokenId === id);
  useEffect(() => {
    if (pos && game?.player.tutorialStep === 4) setSide("sell");
  }, [pos, game?.player.tutorialStep]);

  if (!token || !game) return <div className="screen"><div className="empty">Загрузка…</div></div>;
  const solUsd = game.rates.SOL;
  const solVal = Number(sol.replace(",", "."));
  const buyUsd = solVal > 0 ? solVal * solUsd : 0;
  const tool = toolById(game.player.equippedTool) ?? DUMP_TOOLS[0];
  const eq = equipmentByTier(game.player.equipmentTier);
  const sellValue = pos ? pos.amount * fraction * token.price : 0;
  const sinceSell = game.player.lastSellAt ? Date.now() - game.player.lastSellAt : Infinity;
  const nextCombo = sinceSell <= COMBO_WINDOW_MS ? game.player.combo + 1 : 1;
  const dmgPreview = sellValue * tool.mult * comboMultiplier(nextCombo) * (1 + eq.damageBonus);
  const r = riskLabel(token.risk);
  const rugged = token.regime === "rugged";

  const buy = async () => {
    if (!(solVal > 0)) return toast("err", "Введите сумму в SOL");
    if (buyUsd < MIN_TRADE_USD) return toast("err", `Минимум $${MIN_TRADE_USD}`);
    if (solVal > game.balances.SOL + 1e-9) return toast("err", "Недостаточно SOL. Купите в обменнике");
    const res = await run("buy", () => api.buy(id, solVal));
    if (res) {
      haptic.ok();
      toast("ok", `Куплено ${num(res.amount)} $${res.ticker}`);
      setSol("");
      if (game.player.tutorialStep <= 4) setSide("sell");
    }
  };
  const sell = async () => {
    if (!pos) return;
    if (energyNow < tool.energyCost) return toast("err", `Нужно ${tool.energyCost} энергии`);
    const res = await run("sell", () => api.sell(id, fraction));
    if (res) {
      haptic.hit();
      toast("dmg", `${res.damage.crit ? "💥 CRITICAL DUMP! " : "🔥 "}${money(res.damage.amount)} урона · PnL ${money(res.pnlUsd, { sign: true })}`);
    }
  };

  return (
    <div className="screen token-screen">
      <div className="token-head">
        <button className="icon-btn" onClick={() => openToken(null)} aria-label="Назад">←</button>
        <TokenLogo art={token.art} size={46} />
        <div className="grow minw0">
          <div className="row gap-s"><h2 className="ellipsis">{token.name}</h2><RegimeChip regime={token.regime} /></div>
          <div className="muted small">${token.ticker} · возраст {ago(token.ageMs)}{token.generation > 1 ? ` · ребрендинг #${token.generation}` : ""}</div>
        </div>
      </div>
      <div className="price-big">
        <span className="mono">{price(token.price)}</span>
        <span className={token.change1h >= 0 ? "up" : "down"}>{pct(token.change1h)} 1ч</span>
      </div>
      <PriceChart data={token.history} format={price} />

      <div className="stats-grid">
        <div><span className="muted small">Market Cap</span><b>{money(token.marketCap, { compact: true })}</b></div>
        <div><span className="muted small">Ликвидность</span><b>{money(token.liquidity, { compact: true })}</b></div>
        <div><span className="muted small">Холдеры</span><b>{num(token.holders, 0)}</b></div>
        <div><span className="muted small">Объём 24ч</span><b>{money(token.volume24h, { compact: true })}</b></div>
      </div>

      <section className="card risk-card">
        <div className="row between"><h3>Риск</h3><span className={`risk risk-${r.level}`}>{r.label}</span></div>
        <div className="risk-rows">
          {([
            ["Ненадёжный разработчик", token.riskFactors.dev],
            ["Концентрация китов", token.riskFactors.whales],
            ["Мало ликвидности", token.riskFactors.liquidity],
            ["Мало холдеров", token.riskFactors.holders],
            ["Молодой токен", token.riskFactors.age],
            ["Волатильность", token.riskFactors.volatility],
          ] as [string, number][]).map(([label, v]) => (
            <div key={label} className="risk-row">
              <span className="small">{label}</span>
              <Bar value={v} max={1} tone="risk" />
            </div>
          ))}
        </div>
        {token.ruggedCount > 0 && <div className="warn small">Этот токен уже рагали: {token.ruggedCount}×</div>}
        <div className="muted small">Длиннее полоса — опаснее. Высокий риск = выше шанс rugpull. Следите за уходом ликвидности и холдеров.</div>
      </section>

      {pos && (
        <section className="card">
          <h3>Ваша позиция</h3>
          <div className="stats-grid">
            <div><span className="muted small">Токенов</span><b>{num(pos.amount)}</b></div>
            <div><span className="muted small">Стоимость</span><b>{money(pos.valueUsd)}</b></div>
            <div><span className="muted small">Средняя цена</span><b className="mono">{price(pos.avgPrice)}</b></div>
            <div><span className="muted small">PnL / ROI</span><b className={pos.pnlUsd >= 0 ? "up" : "down"}>{money(pos.pnlUsd, { sign: true })} · {pct(pos.roi)}</b></div>
          </div>
        </section>
      )}

      <section className="card trade-card">
        <Segmented value={side} onChange={setSide} options={[{ value: "buy", label: "Купить" }, { value: "sell", label: "Продать" }]} />
        {rugged && <div className="warn">Торги остановлены — токен зарагали. Ждите перезапуска комьюнити.</div>}
        {side === "buy" ? (
          <>
            <label className="field">
              <span className="muted small">Сумма в SOL · баланс {game.balances.SOL.toFixed(4)}</span>
              <input inputMode="decimal" placeholder="0.0" value={sol} onChange={(e) => setSol(e.target.value.replace(/[^0-9.,]/g, ""))} />
            </label>
            <div className="row gap">
              {[0.25, 0.5, 1].map((k) => (
                <button key={k} className="btn btn-chip" onClick={() => setSol(String(Math.floor(game.balances.SOL * k * 1e6) / 1e6))}>{k === 1 ? "MAX" : `${k * 100}%`}</button>
              ))}
            </div>
            <div className="quote">
              <div className="row between"><span className="muted">Цена</span><span className="mono">{price(token.price)}</span></div>
              <div className="row between"><span className="muted">Итого</span><span>{money(buyUsd)}</span></div>
              <div className="row between"><span className="muted">Комиссия {TRADE_FEE * 100}%</span><span>{money(buyUsd * TRADE_FEE)}</span></div>
              <div className="row between big"><span>Получите ≈</span><span className="strong">{num(buyUsd > 0 ? (buyUsd * (1 - TRADE_FEE)) / token.price : 0)} ${token.ticker}</span></div>
              {pos && <div className="row between"><span className="muted">Позиция после</span><span>{money(pos.valueUsd + buyUsd * (1 - TRADE_FEE))}</span></div>}
            </div>
            {game.balances.SOL < 0.01 && (
              <div className="hint small">Нет SOL? <button className="link" onClick={() => { openToken(null); setTab("home"); }}>Купите в обменнике</button></div>
            )}
            <button className="btn btn-buy wide" disabled={busy === "buy" || rugged} onClick={buy}>{busy === "buy" ? "Покупаем…" : `Купить $${token.ticker}`}</button>
          </>
        ) : pos ? (
          <>
            <div className="row gap">
              {[0.25, 0.5, 1].map((k) => (
                <button key={k} className={`btn btn-chip ${fraction === k ? "on" : ""}`} onClick={() => setFraction(k)}>{k === 1 ? "Всё" : `${k * 100}%`}</button>
              ))}
            </div>
            <div className="quote">
              <div className="row between"><span className="muted">Продаёте</span><span>{num(pos.amount * fraction)} ${token.ticker}</span></div>
              <div className="row between"><span className="muted">Стоимость</span><span>{money(sellValue)}</span></div>
              <div className="row between"><span className="muted">Прибыль</span><span className={pos.pnlUsd >= 0 ? "up" : "down"}>{money(pos.pnlUsd * fraction - sellValue * TRADE_FEE, { sign: true })}</span></div>
              <div className="row between big dmg-line"><span><Icon name="damage" size={16} /> Урон по боссу ≈</span><span className="strong">{money(dmgPreview)}</span></div>
              <div className="muted small">{tool.name} ×{tool.mult} · комбо ×{comboMultiplier(nextCombo)} · сетап ×{(1 + eq.damageBonus).toFixed(2)} · крит {Math.round(tool.critChance * 100)}% · {tool.energyCost} ⚡</div>
            </div>
            <button className="btn btn-sell wide" disabled={busy === "sell" || rugged} onClick={sell}>{busy === "sell" ? "Сливаем…" : "SELL → DUMP"}</button>
          </>
        ) : (
          <div className="empty small">У вас нет ${token.ticker}. Купите, чтобы потом слить его в босса.</div>
        )}
      </section>
      <p className="muted small">{token.description}</p>
    </div>
  );
}
