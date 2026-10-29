"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useGame, useNow } from "../store.tsx";
import { Avatar, Empty, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { Emblem } from "../art/emblems.tsx";
import { clock, full, short } from "../format.ts";
import type { Reward } from "../../content/rewards.ts";
import { GAME_BOARDS, pokerHandOfRank, type GameBoard } from "../../content/games.ts";

interface PlayerRow { id: number; name: string; photo: string | null; level: number; value: number; frame: string | null }
interface ClanRow { id: number; name: string; tag: string; emblem: string; color: string; value: number; members: number }
interface Rating {
  week: { start: number; end: number };
  prizes: { players: Reward[]; clans: Reward[] };
  damage: PlayerRow[];
  authority: PlayerRow[];
  clans: ClanRow[];
  me: { damage: { value: number; place: number } | null; authority: { value: number; place: number } | null };
  lastWinners: { id: number; place: number; damage: number; name: string }[];
  games?: {
    boards: Record<GameBoard, { rows: { id: number; name: string; photo: string | null; value: number }[]; me: { value: number; place: number } | null; last: { id: number; name: string; place: number }[] }>;
    prizes: Reward[];
  };
}

type Tab = "damage" | "authority" | "clans" | "games";
const TABS: { id: Tab; label: string }[] = [
  { id: "damage", label: "Урон недели" },
  { id: "authority", label: "Авторитет" },
  { id: "clans", label: "Кланы" },
  { id: "games", label: "Игры" },
];
/* the weekly mini-game boards: their picture (the game tiles of the yard) and what the number means */
const BOARD_ART: Record<GameBoard, string> = { poker: "/assets/yard/game-poker.webp", zonk: "/assets/yard/game-zonk.webp", bj: "/assets/yard/game-blackjack.webp" };
/** the value on a mini-game board: the best poker hand, the best zonk score, the blackjack winnings */
const boardValue = (b: GameBoard, v: number) =>
  b === "bj" ? `${short(Math.round(v * 100) / 100)} $` : b === "poker" ? pokerHandOfRank(v)?.name ?? "—" : `${full(v)} очков`;
const MEDAL = ["gold", "silver", "bronze"];

/** "5 д 3 ч" for long waits, the clock for the last day */
function untilText(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return clock(ms);
  return `${d} д ${Math.floor((ms % 86_400_000) / 3_600_000)} ч`;
}

function Place({ n }: { n: number }) {
  // places 1–3: a drawn medal with the number (public/assets/ui/place-*.webp)
  // eslint-disable-next-line @next/next/no-img-element
  return <span className={`rt-place display ${n <= 3 ? `p${n}` : ""}`}>{n <= 3 ? <img className="rt-medal" src={`/assets/ui/place-${MEDAL[n - 1]}.webp`} alt={`${n} место`} draggable={false} /> : n}</span>;
}

export function RatingScreen() {
  const { state } = useGame();
  const now = useNow();
  const [data, setData] = useState<Rating | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("damage");
  const [prizesOpen, setPrizesOpen] = useState(false);
  const [board, setBoard] = useState<GameBoard>("poker");
  useEffect(() => {
    api.get<Rating>("/api/rating").then(setData).catch((e) => setErr(e.message));
  }, []);
  if (err) return <Empty>{err}</Empty>;
  const me = state?.player.id;
  const rows = data ? (tab === "damage" ? data.damage : data.authority) : [];
  const mine = data ? (tab === "damage" ? data.me.damage : tab === "authority" ? data.me.authority : null) : null;
  const myClan = state?.clan?.id;

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="title" style={{ margin: 0 }}>
        <div>
          <Link href="/" className="back">← Дом</Link>
          <h1 className="display">Рейтинг</h1>
        </div>
      </div>

      <div className="rt-tabs">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab !== "authority" && data && (
        <div className="rt-week">
          <span className="row" style={{ gap: 6 }}><Icon name="clock" size={16} />Итоги недели через <b className="num">{untilText(data.week.end - now)}</b></span>
          {tab !== "games" && <button className="btn dark sm" onClick={() => setPrizesOpen((v) => !v)}>{prizesOpen ? "Скрыть" : "Призы"}</button>}
        </div>
      )}
      {prizesOpen && data && tab !== "authority" && tab !== "games" && (
        <div className="panel col" style={{ gap: 6 }}>
          {tab === "damage" ? (
            <>
              <div className="tiny muted">Топ-10 по урону за неделю получают призы, а у тройки лидеров всю следующую неделю будет рамка на карточке.</div>
              {[0, 1, 2].map((i) => <div key={i} className="row small" style={{ gap: 8 }}><Place n={i + 1} /><RewardChips r={data.prizes.players[i]} size={14} /></div>)}
              <div className="row small" style={{ gap: 8 }}><span className="rt-place display">4–10</span><RewardChips r={data.prizes.players[3]} size={14} /></div>
            </>
          ) : (
            <>
              <div className="tiny muted">Каждый участник {data.prizes.clans.length} лучших кланов недели получает приз.</div>
              {data.prizes.clans.slice(0, 3).map((r, i) => <div key={i} className="row small" style={{ gap: 8 }}><Place n={i + 1} /><RewardChips r={r} size={14} /></div>)}
              {data.prizes.clans[3] && <div className="row small" style={{ gap: 8 }}><span className="rt-place display">4–{data.prizes.clans.length}</span><RewardChips r={data.prizes.clans[3]} size={14} /></div>}
            </>
          )}
        </div>
      )}

      {tab === "damage" && !!data?.lastWinners.length && (
        <div className="rt-last">
          <span className="tiny muted">Прошлая неделя:</span>
          {data.lastWinners.map((w) => (
            <Link key={w.id} href={`/profile?id=${w.id}`} className="rt-last-one"><Place n={w.place} /><span className="ellipsis">{w.name}</span></Link>
          ))}
        </div>
      )}

      {tab === "games" && data?.games && (() => {
        const b = data.games.boards[board];
        const def = GAME_BOARDS.find((x) => x.id === board)!;
        return (
          <div className="col" style={{ gap: 8 }}>
            <div className="rt-games">
              {GAME_BOARDS.map((g) => (
                <button key={g.id} className={`rt-game ${board === g.id ? "on" : ""}`} onClick={() => setBoard(g.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={BOARD_ART[g.id]} alt="" draggable={false} />
                  <span>{g.name}</span>
                </button>
              ))}
            </div>
            <div className="tiny muted center">{board === "bj" ? "Чистый выигрыш в блэкджеке за неделю" : board === "poker" ? "Лучшая комбинация за неделю" : "Лучший счёт за одну игру за неделю"} · тройка лидеров получает приз</div>
            {!!b.last.length && (
              <div className="rt-last">
                <span className="tiny muted">Прошлая неделя:</span>
                {b.last.map((w) => <Link key={w.id} href={`/profile?id=${w.id}`} className="rt-last-one"><Place n={w.place} /><span className="ellipsis">{w.name}</span></Link>)}
              </div>
            )}
            {b.rows.length ? b.rows.map((r, i) => (
              <Link key={r.id} href={`/profile?id=${r.id}`} className={`rt-row ${r.id === me ? "me" : ""} ${i < 3 ? `top${i + 1}` : ""}`}>
                <Place n={i + 1} />
                <Avatar name={r.name} photo={r.photo} size={36} />
                <span className="rt-name"><b className="ellipsis">{r.name}</b>{i < 3 && <RewardChips r={data.games!.prizes[i]} size={12} />}</span>
                <b className="rt-val num">{boardValue(board, r.value)}</b>
              </Link>
            )) : <Empty>На этой неделе в {def.name.toLowerCase()} ещё никто не играл. Стань первым!</Empty>}
            {b.me && !b.rows.some((r) => r.id === me) && (
              <div className="rt-row me rt-mine">
                <span className="rt-place display">{b.me.place}</span>
                <span className="rt-name"><b>Ты</b><span className="tiny muted">твоё место</span></span>
                <b className="rt-val num">{boardValue(board, b.me.value)}</b>
              </div>
            )}
          </div>
        );
      })()}

      {tab === "games" ? null : !data ? (
        <div className="muted small center">Загружаем…</div>
      ) : tab === "clans" ? (
        data.clans.length ? (
          <div className="col" style={{ gap: 6 }}>
            {data.clans.map((c, i) => (
              <Link key={c.id} href={`/clans/${c.id}`} className={`rt-row ${c.id === myClan ? "me" : ""} ${i < 3 ? `top${i + 1}` : ""}`}>
                <Place n={i + 1} />
                <Emblem emblem={c.emblem} color={c.color} size={34} />
                <span className="rt-name"><b className="ellipsis">{c.name}</b><span className="tiny muted">[{c.tag}] · {c.members} чел.</span></span>
                <b className="rt-val num">{short(c.value)}</b>
              </Link>
            ))}
          </div>
        ) : <Empty>Кланов пока нет — создай первый.</Empty>
      ) : rows.length ? (
        <div className="col" style={{ gap: 6 }}>
          {rows.map((r, i) => (
            <Link key={r.id} href={`/profile?id=${r.id}`} className={`rt-row ${r.id === me ? "me" : ""} ${i < 3 ? `top${i + 1}` : ""}`}>
              <Place n={i + 1} />
              <Avatar name={r.name} photo={r.photo} size={36} frame={r.frame} />
              <span className="rt-name"><b className="ellipsis">{r.name}</b><span className="tiny muted">LVL {r.level}</span></span>
              <b className="rt-val num">{tab === "damage" ? short(r.value) : full(r.value)}</b>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>{tab === "damage" ? "На этой неделе ещё никто не бил боссов. Займи первое место!" : "Пока пусто."}</Empty>
      )}

      {mine && !rows.some((r) => r.id === me) && (
        <div className="rt-row me rt-mine">
          <span className="rt-place display">{mine.place}</span>
          <span className="rt-name"><b>Ты</b><span className="tiny muted">твоё место</span></span>
          <b className="rt-val num">{tab === "damage" ? short(mine.value) : full(mine.value)}</b>
        </div>
      )}
    </div>
  );
}
