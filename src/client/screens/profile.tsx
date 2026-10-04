"use client";
import { replayTutorial } from "../tutorial.tsx";
import { NotifySwitch } from "./quests.tsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { api } from "../api.ts";
import { BOSSES } from "../../content/bosses.ts";
import { WEAPONS } from "../../content/items.ts";
import { CURRENCIES, CURRENCY_DEFS, type Currency } from "../../content/currencies.ts";
import { Avatar, Bar, Coin, Empty, Modal } from "../ui.tsx";
import { Emblem } from "../art/emblems.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { HeroRig } from "../art/rig.tsx";
import { HomeScene } from "../art/home-scene.tsx";
import { ROOM_BACKDROP } from "../../content/home-scene.ts";
import { ROOM_DEFS, stageOf } from "../../content/home.ts";
import { BadgesPanel, type AchRow } from "../badges.tsx";
import type { Look } from "../../content/home.ts";
import { clock, dateRu, full, money, short } from "../format.ts";

interface Profile {
  id: number; self: boolean; name: string; username: string | null; photo: string | null;
  level: number; xp: number; levelXp: number; levelNeed: number;
  firstSeen: number; lastSeen: number; activeDays: number;
  wallet: Record<Currency, number> | null; energy: number | null;
  stats: { totalDamage: number; weapons: Record<string, number>; taskSteps: number; tasksDone: number; locationsDone: number; locationsTotal: number; yardFound: number; rewardsGot: number; fightsWon: number; fightsLost: number };
  bosses: { id: string; damage: number; hits: number; wins: number }[];
  clan: { id: number; name: string; tag: string; emblem: string; color: string } | null;
  equipped: Record<string, string>;
  body: Look;
  frame: string | null;
  achievements: AchRow[];
  room: { id: string; levels: Record<string, number>; decor: Record<string, number> };
}

const FRAME_TITLE: Record<string, string> = { gold: "1 место прошлой недели", silver: "2 место прошлой недели", bronze: "3 место прошлой недели", top: "Топ-10 прошлой недели" };

function RenameWindow({ current, onClose, onDone }: { current: string; onClose: () => void; onDone: () => void }) {
  const { state, act, busy } = useGame();
  const now = useNow();
  const [name, setName] = useState(current);
  if (!state) return null;
  const r = state.rename;
  const clean = name.replace(/\s+/g, " ").trim();
  const can = (state.wallet[r.price.currency] ?? 0) >= r.price.amount;
  const valid = clean.length >= r.min && clean.length <= r.max && clean !== current;
  const save = async () => {
    const res = await act<{ name: string }>("rename", { name: clean }, (x) => `Теперь ты ${x.name}`);
    if (res) {
      onDone();
      onClose();
    }
  };
  return (
    <Modal title="Сменить ник" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        <div className="small muted">Меняется только ник в игре — имя в Telegram останется прежним. Сменить можно раз в 24 часа.</div>
        {r.nextAt ? (
          <div className="panel center small">Следующая смена через <b className="num">{clock(r.nextAt - now)}</b></div>
        ) : (
          <>
            <input className="input" value={name} maxLength={r.max} onChange={(e) => setName(e.target.value)} placeholder="Новый ник" autoFocus />
            <div className="tiny muted">От {r.min} до {r.max} символов: буквы, цифры, пробел, точка, _ и -</div>
            <button className="btn gold block" disabled={!valid || !can || busy === "rename"} onClick={save}>
              Сменить за <Icon name={r.price.currency} size={16} /> {money(r.price.currency, r.price.amount)}
            </button>
            {!can && <div className="tiny center" style={{ color: "#ff8a9e" }}>Не хватает {r.price.currency}</div>}
          </>
        )}
      </div>
    </Modal>
  );
}

export function ProfileScreen() {
  const q = useSearchParams();
  const { state } = useGame();
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const id = q.get("id");
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    api.get<Profile>(`/api/profile${id ? `?id=${encodeURIComponent(id)}` : ""}`).then(setP).catch((e) => setErr(e.message));
  }, [id, state?.player.xp, state?.player.name, tick]);
  if (err) return <Empty>{err}</Empty>;
  if (!p) return null;
  const s = p.stats;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="title" style={{ margin: 0 }}>
        <Link href="/" className="back">← Дом</Link>
      </div>
      <div className="panel profile-head">
        <div className="profile-char"><HeroRig size={150} still look={p.body} worn={p.equipped} seat={stageOf("chair", p.room.levels, p.room.decor).level} /></div>
        <div className="col grow" style={{ gap: 6 }}>
          <div className="row">
            <Avatar name={p.name} photo={p.photo} size={44} frame={p.frame} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6 }}>
                <b className="display ellipsis" style={{ fontSize: 18 }}>{p.name}</b>
                {p.self && (
                  <button className="icon-btn" onClick={() => setRenaming(true)} aria-label="Сменить ник" title="Сменить ник">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" fill="#ffcc33" stroke="#140d24" strokeWidth="2" strokeLinejoin="round" /><path d="M13 7l4 4" stroke="#140d24" strokeWidth="2" /></svg>
                  </button>
                )}
              </div>
              {p.username && (
                <a className="tg-link tiny" href={`https://t.me/${encodeURIComponent(p.username)}`} target="_blank" rel="noopener noreferrer">@{p.username}</a>
              )}
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="lvl">LVL {p.level}</span>
                {p.frame && <span className={`chip frame-chip frame-${p.frame}`}><Icon name="trophy" size={14} />{FRAME_TITLE[p.frame]}</span>}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 6 }} title="Авторитет"><Icon name="xp" size={22} /><div className="grow"><Bar value={p.levelXp} max={p.levelNeed || 1} tone="violet" label={p.levelNeed ? `${full(p.levelXp)} / ${full(p.levelNeed)}` : "максимальный уровень"} /></div></div>
          <div className="tiny muted">Авторитет: <b className="num" style={{ color: "var(--ink)" }}>{full(p.xp)}</b>{p.levelNeed ? <> · до уровня {p.level + 1}: <b className="num" style={{ color: "var(--ink)" }}>{full(p.levelNeed - p.levelXp)}</b></> : null}</div>
          <div className="tiny muted">В игре с {dateRu(p.firstSeen)} · дней в игре: {p.activeDays}</div>
          <div className="tiny muted">Последний вход: {dateRu(p.lastSeen)}</div>
          {p.clan && (
            <Link href={`/clans/${p.clan.id}`} className="row small">
              <Emblem emblem={p.clan.emblem} color={p.clan.color} size={26} /> {p.clan.name} [{p.clan.tag}]
            </Link>
          )}
        </div>
      </div>

      {p.wallet && (
        <div className="panel">
          <div className="small muted" style={{ marginBottom: 8 }}>БАЛАНС</div>
          {/* one row per currency: the full amount has the whole width, however big it grows */}
          <div className="balance-list">
            {CURRENCIES.map((c) => (
              <div key={c} className="balance-row">
                <Icon name={c} size={26} />
                <span className="balance-name">{CURRENCY_DEFS[c].name}</span>
                <b className="balance-val num">{money(c, p.wallet![c])}</b>
              </div>
            ))}
            {p.energy !== null && (
              <div className="balance-row">
                <Icon name="energy" size={26} />
                <span className="balance-name">Энергия</span>
                <b className="balance-val num">{full(p.energy)}</b>
              </div>
            )}
          </div>
        </div>
      )}

      <BadgesPanel rows={p.achievements} self={p.self} onClaimed={reload} />

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span className="small muted">КОМНАТА</span>
          <span className="tiny muted">{ROOM_DEFS.find((r) => r.id === p.room.id)?.name ?? ""}</span>
        </div>
        <div className="profile-room" style={{ backgroundImage: `url(/assets/home/${ROOM_BACKDROP[p.room.id] ?? ROOM_BACKDROP.basic}.webp)` }}>
          <HomeScene room={p.room.id} look={p.body} worn={p.equipped} levels={p.room.levels} decor={p.room.decor} still />
        </div>
      </div>

      {p.self && <SettingsPanel />}

      <div className="panel">
        <div className="small muted" style={{ marginBottom: 8 }}>СТАТИСТИКА</div>
        <div className="stat-grid">
          <div><b className="num">{short(s.totalDamage)}</b><span>урона боссам</span></div>
          <div><b className="num">{s.fightsWon}</b><span>побед</span></div>
          <div><b className="num">{s.fightsLost}</b><span>поражений</span></div>
          <div><b className="num">{s.locationsDone}/{s.locationsTotal}</b><span>локаций</span></div>
          <div><b className="num">{s.tasksDone}</b><span>заданий</span></div>
          <div><b className="num">{s.yardFound}</b><span>находок во дворе</span></div>
          <div><b className="num">{s.rewardsGot}</b><span>наград</span></div>
          <div><b className="num">{s.taskSteps}</b><span>шагов заданий</span></div>
        </div>
      </div>

      <div className="panel">
        <div className="small muted" style={{ marginBottom: 8 }}>ОРУЖИЕ</div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {WEAPONS.map((w) => (
            <span key={w.id} className="chip"><ItemArt id={w.id} size={22} /> ×{s.weapons[w.id] ?? 0}</span>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="small muted" style={{ marginBottom: 8 }}>УРОН ПО БОССАМ</div>
        <div className="col" style={{ gap: 4 }}>
          {BOSSES.map((b) => {
            const r = p.bosses.find((x) => x.id === b.id);
            return (
              <div key={b.id} className="row small">
                <span className="grow">{b.order}. {b.name}</span>
                {!!r?.wins && <span className="chip green"><Icon name="trophy" size={14} />{r.wins}</span>}
                <b className="num">{full(r?.damage ?? 0)}</b>
              </div>
            );
          })}
        </div>
      </div>

      {renaming && <RenameWindow current={p.name} onClose={() => setRenaming(false)} onDone={() => undefined} />}
    </div>
  );
}

/** Own profile only: Telegram reminders, the tour again (sound switches live in the HUD). */
function SettingsPanel() {
  const router = useRouter();
  return (
    <div className="panel col" style={{ gap: 8 }}>
      <div className="small muted">НАСТРОЙКИ</div>
      <NotifySwitch />
      <button className="btn dark block" onClick={() => { router.push("/"); setTimeout(replayTutorial, 400); }}>Пройти обучение заново</button>
    </div>
  );
}
