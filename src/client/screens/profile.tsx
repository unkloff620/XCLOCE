"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { BOSSES } from "../../content/bosses.ts";
import { WEAPONS } from "../../content/items.ts";
import { CURRENCIES, type Currency } from "../../content/currencies.ts";
import { Avatar, Bar, Coin, Empty } from "../ui.tsx";
import { Emblem } from "../art/emblems.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { Character } from "../art/character.tsx";
import { dateRu, full, short } from "../format.ts";

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

export function ProfileScreen() {
  const q = useSearchParams();
  const { state } = useGame();
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const id = q.get("id");
  useEffect(() => {
    api.get<Profile>(`/api/profile${id ? `?id=${encodeURIComponent(id)}` : ""}`).then(setP).catch((e) => setErr(e.message));
  }, [id, state?.player.xp]);
  if (err) return <Empty>{err}</Empty>;
  if (!p) return null;
  const s = p.stats;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="title" style={{ margin: 0 }}>
        <Link href="/" className="back">← Дом</Link>
        {p.self && p.username && <span className="small muted">@{p.username}</span>}
      </div>
      <div className="panel profile-head">
        <div className="profile-char"><Character equipped={p.equipped} size={150} /></div>
        <div className="col grow" style={{ gap: 6 }}>
          <div className="row">
            <Avatar name={p.name} photo={p.photo} size={44} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="display ellipsis" style={{ display: "block", fontSize: 18 }}>{p.name}</b>
              <span className="lvl">LVL {p.level}</span>
            </div>
          </div>
          <Bar value={p.levelXp} max={p.levelNeed || 1} tone="violet" label={`${full(p.levelXp)} / ${full(p.levelNeed)} XP`} />
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
    </div>
  );
}
