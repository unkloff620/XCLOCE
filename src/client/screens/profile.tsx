"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { api } from "../api.ts";
import { BOSSES } from "../../content/bosses.ts";
import { WEAPONS } from "../../content/items.ts";
import { CURRENCIES, type Currency } from "../../content/currencies.ts";
import { Avatar, Bar, Coin, Empty, Modal } from "../ui.tsx";
import { Emblem } from "../art/emblems.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { Character } from "../art/character.tsx";
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
}

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
  useEffect(() => {
    api.get<Profile>(`/api/profile${id ? `?id=${encodeURIComponent(id)}` : ""}`).then(setP).catch((e) => setErr(e.message));
  }, [id, state?.player.xp, state?.player.name]);
  if (err) return <Empty>{err}</Empty>;
  if (!p) return null;
  const s = p.stats;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="title" style={{ margin: 0 }}>
        <Link href="/" className="back">← Дом</Link>
      </div>
      <div className="panel profile-head">
        <div className="profile-char"><Character equipped={p.equipped} size={150} /></div>
        <div className="col grow" style={{ gap: 6 }}>
          <div className="row">
            <Avatar name={p.name} photo={p.photo} size={44} />
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
              <div><span className="lvl">LVL {p.level}</span></div>
            </div>
          </div>
          <Bar value={p.levelXp} max={p.levelNeed || 1} tone="violet" label={p.levelNeed ? `${full(p.levelXp)} / ${full(p.levelNeed)} авторитета` : "максимальный уровень"} />
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
          <div className="stat-grid">
            {CURRENCIES.map((c) => <div key={c}><b><Coin c={c} v={p.wallet![c]} size={18} /></b><span>{c}</span></div>)}
          </div>
          {p.energy !== null && <div className="row small" style={{ marginTop: 8 }}><Icon name="energy" size={18} /> Энергия: <b>{p.energy}</b></div>}
        </div>
      )}

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

      <div className="panel">
        <div className="small muted" style={{ marginBottom: 8 }}>ДОСТИЖЕНИЯ</div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="ach-slot"><Icon name="lock" size={24} /></span>)}
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>Появятся в следующих обновлениях.</div>
      </div>
      {renaming && <RenameWindow current={p.name} onClose={() => setRenaming(false)} onDone={() => undefined} />}
    </div>
  );
}
