"use client";
import { useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { api, type FeedItem } from "../api.ts";
import { DEFAULT_THEME, ITEMS, describeRoom, itemById, roomBonus, type ItemDef } from "../../shared/items.ts";
import { Scene } from "../art/scene.tsx";
import { DAILY_REWARDS, EVENTS } from "../../shared/content.ts";
import { CURRENCIES, WORKPLACE, exchangeQuote, type Currency } from "../../shared/economy.ts";
import { ItemIcon } from "../art/items.tsx";
import { UIcon, type UiIcon } from "../art/icons.tsx";
import { Avatar, Bar, PriceTag, RARITY_LABEL, Sheet, Tabs, countdown, fmtCur, fmtNum } from "../ui.tsx";

type ShopTab = "weapon" | "outfit" | "items";

export function ShopSheet() {
  const { sheet, openSheet } = useGame();
  const [tab, setTab] = useState<ShopTab>("weapon");
  const open = sheet === "shop";
  return (
    <Sheet open={open} onClose={() => openSheet(null)} title="МАГАЗИН" wide>
      <Tabs<ShopTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "weapon", label: "Оружие" },
          { value: "outfit", label: "Одежда" },
          { value: "items", label: "Предметы" },
        ]}
      />
      <ShopGrid tab={tab} />
    </Sheet>
  );
}

function ShopGrid({ tab }: { tab: ShopTab }) {
  const { game, act, busy } = useGame();
  if (!game) return null;
  const list = ITEMS.filter((i) => {
    if (tab === "weapon") return i.kind === "weapon";
    if (tab === "outfit") return ["hat", "glasses", "jacket", "chain"].includes(i.kind);
    return (i.kind === "consumable" || i.kind === "chest") && !!i.price;
  });
  const owned = (it: ItemDef) => game.inventory.some((x) => x.id === it.id) || (it.id === "t-default");
  return (
    <div className="shop-grid">
      {list.map((it) => {
        const have = owned(it);
        const locked = game.player.level < (it.unlockLevel ?? 1);
        const applied = it.kind === "theme" && game.player.theme === it.id;
        return (
          <div key={it.id} className={`shop-item r-${it.rarity}`}>
            <ItemIcon id={it.id} size={64} />
            <b className="small">{it.name}</b>
            <span className={`rarity-chip r-${it.rarity}`}>{RARITY_LABEL[it.rarity]}</span>
            {it.hit ? <span className="small">💥 {fmtNum(it.hit.dmg)} урона · 1 удар</span> : it.power ? <span className="small">+{it.power} ⚔</span> : it.energy ? <span className="small">+{it.energy} ⚡</span> : <span className="small muted">{it.kind === "chest" ? "случайная награда" : " "}</span>}
            {it.stackable && (game.inventory.find((x) => x.id === it.id)?.qty ?? 0) > 0 && <span className="small muted">в наличии: {game.inventory.find((x) => x.id === it.id)?.qty}</span>}
            {it.kind === "theme" && have ? (
              <button className="btn-small green comic" disabled={applied || !!busy} onClick={() => act("theme", { itemId: it.id }, "Комната изменена")}>{applied ? "✓" : "Применить"}</button>
            ) : have && !it.stackable ? (
              <span className="chip-owned">Есть</span>
            ) : !it.price ? (
              <span className="chip-owned">Дроп</span>
            ) : locked ? (
              <span className="lock-chip"><UIcon name="lock" size={14} />Lv {it.unlockLevel}</span>
            ) : (
              <button className="btn-buy comic" disabled={!!busy} onClick={() => act("buy", { itemId: it.id }, `${it.name} — куплено!`)}>
                <PriceTag price={it.price} size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Rooms: buy and apply; every room except the default one gives damage bonuses while applied. */
export function RoomsSheet() {
  const { sheet, openSheet, game, act, busy } = useGame();
  if (!game) return null;
  const rooms = ITEMS.filter((i) => i.kind === "theme");
  return (
    <Sheet open={sheet === "rooms"} onClose={() => openSheet(null)} title="КОМНАТЫ">
      <p className="small muted center">Бонусы работают, пока комната применена.</p>
      <div className="rooms">
        {rooms.map((r) => {
          const owned = r.id === DEFAULT_THEME || game.inventory.some((x) => x.id === r.id);
          const applied = game.player.theme === r.id;
          const locked = game.player.level < (r.unlockLevel ?? 1);
          const bonus = describeRoom(roomBonus(r.id));
          return (
            <div key={r.id} className={`room r-${r.rarity} ${applied ? "applied" : ""}`}>
              <div className="room-preview"><Scene theme={r.id} tier={game.player.workplaceTier} /></div>
              <div className="room-info">
                <div className="row-c between gap"><b className="comic room-name">{r.name}</b><span className={`rarity-chip r-${r.rarity}`}>{RARITY_LABEL[r.rarity]}</span></div>
                <div className="small muted">{r.description}</div>
                {bonus.length ? (
                  <ul className="room-bonus">{bonus.map((t) => <li key={t}>⚔ {t}</li>)}</ul>
                ) : <div className="small muted">Без бонусов</div>}
                <div className="room-act">
                  {applied ? (
                    <span className="chip-owned">✓ Применена</span>
                  ) : owned ? (
                    <button className="btn-small green comic" disabled={!!busy} onClick={() => act("theme", { itemId: r.id }, `${r.name} — применена`)}>Применить</button>
                  ) : locked ? (
                    <span className="lock-chip"><UIcon name="lock" size={14} />Lv {r.unlockLevel}</span>
                  ) : r.price ? (
                    <button className="btn-buy comic" disabled={!!busy} onClick={async () => { if (await act("buy", { itemId: r.id }, `${r.name} — куплена`)) act("theme", { itemId: r.id }); }}>
                      <PriceTag price={r.price} size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/** The only place to swap currencies: opened by the Exchange button on the main screen. */
export function ExchangeSheet() {
  const { sheet, openSheet, game, now } = useGame();
  if (!game) return null;
  const rub = (c: Currency) => exchangeQuote(c, "RUB", 1, now).rate;
  return (
    <Sheet open={sheet === "exchange"} onClose={() => openSheet(null)} title="EXCHANGE">
      <div className="ex-rates">
        {CURRENCIES.map((c) => (
          <div key={c} className="ex-rate">
            <UIcon name={c.toLowerCase() as UiIcon} size={22} />
            <div className="minw0">
              <b>{fmtCur(game.balances[c], c)}</b>
              <small className="muted">{c === "RUB" ? "базовая" : `1 ${c} = ${fmtNum(rub(c))} ₽`}</small>
            </div>
          </div>
        ))}
      </div>
      <Exchange />
    </Sheet>
  );
}

function Exchange() {
  const { game, act, busy, now } = useGame();
  const [from, setFrom] = useState<Currency>("RUB");
  const [to, setTo] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  if (!game) return null;
  const v = Number(amount.replace(",", "."));
  const q = v > 0 && from !== to ? exchangeQuote(from, to, v, now) : null;
  return (
    <div className="section">
      <div className="ex-row">{CURRENCIES.map((c) => <button key={c} className={`cur-pick ${from === c ? "on" : ""}`} onClick={() => { setFrom(c); if (to === c) setTo(c === "USD" ? "RUB" : "USD"); }}><UIcon name={c.toLowerCase() as UiIcon} size={22} />{c}</button>)}</div>
      <div className="center muted">↓</div>
      <div className="ex-row">{CURRENCIES.map((c) => <button key={c} disabled={c === from} className={`cur-pick ${to === c ? "on" : ""}`} onClick={() => setTo(c)}><UIcon name={c.toLowerCase() as UiIcon} size={22} />{c}</button>)}</div>
      <label className="field"><span>Отдаёте · баланс {fmtCur(game.balances[from], from)}</span>
        <input inputMode="decimal" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} />
      </label>
      <div className="row-c gap">{[0.25, 0.5, 1].map((k) => <button key={k} className="btn-small grow" onClick={() => setAmount(String(Math.floor(game.balances[from] * k * 1e6) / 1e6))}>{k === 1 ? "MAX" : `${k * 100}%`}</button>)}</div>
      <div className="quote">
        <div className="row-c between"><span className="muted">Курс</span><span>1 {from} = {exchangeQuote(from, to === from ? "USD" : to, 1, now).rate.toPrecision(4)} {to}</span></div>
        <div className="row-c between"><span className="muted">Комиссия</span><span>2%</span></div>
        <div className="row-c between big"><span>Получите</span><b>{q ? fmtCur(q.received, to) : "—"}</b></div>
      </div>
      <button className="btn-green comic" disabled={!q || !!busy} onClick={async () => { if (await act("exchange", { from, to, amount: v }, (r: { received: number }) => `Получено ${fmtCur(r.received, to)}`)) setAmount(""); }}>ОБМЕНЯТЬ</button>
    </div>
  );
}

export function DailySheet() {
  const { sheet, openSheet, game, act, busy, now } = useGame();
  if (!game) return null;
  const d = game.daily;
  return (
    <Sheet open={sheet === "daily"} onClose={() => openSheet(null)} title="НАГРАДА ЗА ВХОД">
      <div className="streak">
        {DAILY_REWARDS.map((r, i) => {
          const day = i + 1;
          const state = day < d.cycleDay ? "done" : day === d.cycleDay ? (d.canClaim ? "today" : "next") : "future";
          return (
            <div key={day} className={`day ${state}`}>
              <small className="comic">ДЕНЬ {day}</small>
              {r.item ? <ItemIcon id={r.item} size={34} /> : <UIcon name={r.reward!.currency.toLowerCase() as UiIcon} size={30} />}
              <b className="small">{r.label}</b>
            </div>
          );
        })}
      </div>
      <p className="muted small center">Серия: {d.streak}. Не пропускай больше 48 часов — иначе серия сбросится.</p>
      <button className="btn-green comic" disabled={!d.canClaim || !!busy} onClick={() => act("daily", {}, (r: { label: string }) => `Получено: ${r.label}`)}>
        {d.canClaim ? "ЗАБРАТЬ" : `СЛЕДУЮЩАЯ ЧЕРЕЗ ${countdown(d.availableAt - now)}`}
      </button>
    </Sheet>
  );
}

export function MissionsSheet() {
  const { sheet, openSheet, game, act, busy, now } = useGame();
  if (!game) return null;
  return (
    <Sheet open={sheet === "missions"} onClose={() => openSheet(null)} title="ЕЖЕДНЕВНЫЕ ЗАДАНИЯ">
      <p className="muted small center">Обновятся через {countdown((game.missions[0]?.resetsAt ?? now) - now)}</p>
      {game.missions.map((m) => (
        <div key={m.id} className={`mission ${m.claimed ? "claimed" : m.done ? "ready" : ""}`}>
          <div className="grow minw0">
            <b>{m.title}</b>
            <Bar value={m.progress} max={m.target} tone="violet" label={`${fmtNum(m.progress)}/${fmtNum(m.target)}`} />
            <div className="small row-c gap"><PriceTag price={m.reward} size={14} /><span>+{m.xp} XP</span><span>+{m.power} ⚔</span></div>
          </div>
          {m.claimed ? <span className="chip-owned">✓</span> : (
            <button className="btn-small green comic" disabled={!m.done || !!busy} onClick={() => act("mission", { missionId: m.id }, "Награда получена")}>{m.done ? "Забрать" : "…"}</button>
          )}
        </div>
      ))}
    </Sheet>
  );
}

export function EventsSheet() {
  const { sheet, openSheet, game } = useGame();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const open = sheet === "events";
  useEffect(() => { if (open) api.feed().then((r) => setFeed(r.items)).catch(() => undefined); }, [open]);
  return (
    <Sheet open={open} onClose={() => openSheet(null)} title="ИВЕНТЫ">
      {EVENTS.map((e) => (
        <div key={e.id} className={`event ${e.kind === "weekend" && game?.weekend ? "active" : ""}`}>
          <b className="comic">{e.title}</b>
          <div className="small">{e.description}</div>
          {e.kind === "weekend" && <span className={`small ${game?.weekend ? "up" : "muted"}`}>{game?.weekend ? "● Идёт сейчас" : "Начнётся в субботу"}</span>}
        </div>
      ))}
      <h3 className="comic">Лента сервера</h3>
      <div className="feed">{feed.length ? feed.map((f) => <div key={f.id} className="feed-item">{f.text}</div>) : <div className="muted small">Пока тихо</div>}</div>
    </Sheet>
  );
}

export function UpgradeSheet() {
  const { sheet, openSheet, game, act, busy } = useGame();
  if (!game) return null;
  const tier = game.player.workplaceTier;
  return (
    <Sheet open={sheet === "upgrade"} onClose={() => openSheet(null)} title="РАБОЧЕЕ МЕСТО">
      {WORKPLACE.map((w) => {
        const state = w.tier < tier ? "done" : w.tier === tier ? "current" : w.tier === tier + 1 ? "next" : "future";
        return (
          <div key={w.tier} className={`wp ${state}`}>
            <span className="wp-n comic">{w.tier}</span>
            <div className="grow minw0">
              <b>{w.name}</b>
              <div className="small muted">+{w.power} ⚔ · +{w.maxEnergyBonus} ⚡ к максимуму энергии</div>
            </div>
            {state === "current" ? <span className="chip-owned">Сейчас</span> : state === "done" ? <span className="chip-owned">✓</span> : state === "next" && w.price ? (
              game.player.level < w.unlockLevel ? <span className="lock-chip"><UIcon name="lock" size={14} />Lv {w.unlockLevel}</span> : (
                <button className="btn-buy comic" disabled={!!busy} onClick={() => act("workplace", { tier: w.tier }, `${w.name} установлен!`)}><PriceTag price={w.price} size={14} /></button>
              )
            ) : <span className="lock-chip"><UIcon name="lock" size={14} /></span>}
          </div>
        );
      })}
    </Sheet>
  );
}

export function ProfileSheet() {
  const { sheet, openSheet, game, act, busy, now } = useGame();
  const [name, setName] = useState("");
  const open = sheet === "profile";
  useEffect(() => { if (open && game) setName(game.player.name); }, [open, game?.player.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!game) return null;
  const p = game.player;
  const wait = p.renameAt - now;
  const clean = name.replace(/\s+/g, " ").trim();
  const valid = /^[\p{L}\p{N}_. -]{3,16}$/u.test(clean) && clean !== p.name;
  return (
    <Sheet open={open} onClose={() => openSheet(null)} title="ПРОФИЛЬ">
      <div className="profile-head">
        <Avatar url={p.photoUrl} name={p.name} size={72} />
        <div className="minw0">
          <div className="comic big ellipsis">{p.name}</div>
          <div className="small muted">Lv {p.level} · ⚔ {fmtNum(p.power)}</div>
        </div>
      </div>
      <label className="field"><span>Никнейм (3–16 символов)</span>
        <input maxLength={16} value={name} disabled={wait > 0} onChange={(e) => setName(e.target.value)} placeholder="Твой ник" />
      </label>
      {wait > 0 ? (
        <p className="small muted center">Сменить ник снова можно через {countdown(wait)}</p>
      ) : (
        <p className="small muted center">Ник можно менять раз в 24 часа. Буквы, цифры, пробел, _ . -</p>
      )}
      <button className="btn-green comic" disabled={!valid || wait > 0 || busy === "rename"} onClick={async () => { if (await act("rename", { name: clean }, "Ник изменён")) openSheet(null); }}>
        СОХРАНИТЬ
      </button>
    </Sheet>
  );
}

export { itemById };
