"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { useGame, useNow } from "../store.tsx";
import { Avatar, Empty, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { clock, full, short } from "../format.ts";
import type { Reward } from "../../content/rewards.ts";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { GAME_BOARDS, pokerHandOfRank, type GameBoard } from "../../content/games.ts";

interface PlayerRow { id: number; name: string; photo: string | null; level: number; value: number; frame: string | null }
interface ClanRow { id: number; name: string; tag: string; emblem: string; color: string; value: number; members: number }
interface Rating {
  week: { start: number; end: number };
  prizes: { players: Reward[]; clans: Reward[] };
  damage: PlayerRow[];
  authority: PlayerRow[];
  /** «Топ 100 по достижениям»: how many achievements taken */
  achievements?: PlayerRow[];
  clans: ClanRow[];
  me: { damage: { value: number; place: number } | null; authority: { value: number; place: number } | null; achievements?: { value: number; place: number } | null };
  lastWinners: { id: number; place: number; damage: number; name: string }[];
  games?: {
    boards: Record<GameBoard, { rows: { id: number; name: string; photo: string | null; value: number }[]; me: { value: number; place: number } | null; last: { id: number; name: string; place: number }[] }>;
    prizes: Reward[];
  };
}

type Tab = "damage" | "authority" | "ach" | "games";
/** the paper tabs on the left of the sheet: their picture and the sheet's heading */
const TABS: { id: Tab; label: string; icon: string; head: string }[] = [
  { id: "damage", label: "Урон недели", icon: "/assets/ui/influence.webp", head: "Недельный топ по урону" },
  { id: "authority", label: "Авторитет", icon: "/assets/ui/authority.webp", head: "Топ по авторитету" },
  { id: "ach", label: "Достижения", icon: "/assets/ui/ach-leader.webp", head: "Топ 100 по достижениям" },
  { id: "games", label: "Игры", icon: "/assets/ui/ach-poker.webp", head: "Топ игр недели" },
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

/** My won prizes waiting to be taken (the weekly tops, the games): here they can always be collected */
function MyPrizes() {
  const { state, act, busy } = useGame();
  const list = state?.prizes ?? [];
  if (!list.length) return null;
  const take = async (id: number) => {
    const r = await act("prize_claim", { id }, "Приз получен!");
    if (r) { haptic.big(); sfx("casedrop"); }
  };
  return (
    <div className="panel rt-mine-prizes">
      <b className="display row" style={{ gap: 6 }}><Icon name="trophy" size={22} />Твои призы</b>
      {list.map((p) => (
        <div key={p.id} className="rt-prize-row">
          <span className="col grow" style={{ minWidth: 0, gap: 3 }}>
            <b className="small">{p.title}</b>
            <RewardChips r={p.reward} size={14} />
          </span>
          <button className="btn gold sm" disabled={busy === "prize_claim"} onClick={() => void take(p.id)}>Забрать</button>
        </div>
      ))}
    </div>
  );
}

/** The weekly tops on a sheet of old paper: opened over the hero on the home screen (onClose — back to the room). */
export function RatingBoard({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const now = useNow();
  const [data, setData] = useState<Rating | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("damage");
  const [prizesOpen, setPrizesOpen] = useState(false);
  const [board, setBoard] = useState<GameBoard>("poker");
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api.get<Rating>("/api/rating").then(setData).catch((e) => setErr(e.message));
  }, []);
  if (err) return <Empty>{err}</Empty>;
  const me = state?.player.id;
  const rows = data ? (tab === "damage" ? data.damage : tab === "ach" ? data.achievements ?? [] : data.authority) : [];
  const mine = data ? (tab === "damage" ? data.me.damage : tab === "authority" ? data.me.authority : tab === "ach" ? data.me.achievements ?? null : null) : null;
  const head = TABS.find((t) => t.id === tab)!.head;
  const pick = (t: Tab) => { if (t === tab) return; haptic.tap(); setTab(t); scroll.current?.scrollTo({ top: 0 }); };
  // «Найти себя»: scroll the list to my row
  const findMe = () => {
    const el = scroll.current?.querySelector<HTMLElement>(".rt-row.me");
    if (!el) return;
    haptic.tap();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("rt-flash"); void el.offsetWidth; el.classList.add("rt-flash");
  };

  return (
    <div className="rt-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rt-board">
        {/* the paper tabs stuck to the left edge of the sheet */}
        <div className="rt-side" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`rt-side-tab ${tab === t.id ? "on" : ""}`} onClick={() => pick(t.id)} aria-label={t.label} title={t.label}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.icon} alt="" draggable={false} />
            </button>
          ))}
        </div>
        <div className="rt-sheet">
          <button className="rt-x" onClick={onClose} aria-label="Закрыть">✕</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <h1 className="rt-head display">{head}<img src="/assets/ui/trophy.webp" alt="" draggable={false} /></h1>
          <div className="rt-scroll" ref={scroll}>
      <MyPrizes />

      {prizesOpen && data && tab === "damage" && (
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
            {b.rows.length ? b.rows.map((r, i) => (
              <Link key={r.id} href={`/profile?id=${r.id}`} className={`rt-row ${r.id === me ? "me" : ""} ${i < 3 ? `top${i + 1}` : ""}`}>
                <Place n={i + 1} />
                <Avatar name={r.name} photo={r.photo} size={36} />
                <span className="rt-name"><b className="ellipsis">{r.name}</b>{i < 3 && <RewardChips r={data.games!.prizes[i]} size={12} times={false} />}</span>
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
      ) : rows.length ? (
        <div className="col" style={{ gap: 6 }}>
          {rows.map((r, i) => (
            <Link key={r.id} href={`/profile?id=${r.id}`} className={`rt-row ${r.id === me ? "me" : ""} ${i < 3 ? `top${i + 1}` : ""}`}>
              <Place n={i + 1} />
              <Avatar name={r.name} photo={r.photo} size={36} frame={r.frame} />
              <span className="rt-name"><b className="ellipsis">{r.name}</b><span className="tiny muted">Уровень {r.level}</span></span>
              <b className="rt-val num">{tab === "damage" ? short(r.value) : full(r.value)}</b>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>{tab === "damage" ? "На этой неделе ещё никто не бил боссов. Займи первое место!" : tab === "ach" ? "Достижений пока никто не забрал. Будь первым!" : "Пока пусто."}</Empty>
      )}

      {mine && !rows.some((r) => r.id === me) && (
        <div className="rt-row me rt-mine">
          <span className="rt-place display">{mine.place}</span>
          <span className="rt-name"><b>Ты</b><span className="tiny muted">твоё место</span></span>
          <b className="rt-val num">{tab === "damage" ? short(mine.value) : full(mine.value)}</b>
        </div>
      )}
          </div>
          <div className="rt-foot">
            {tab === "damage" && data && <button className="btn dark sm rt-prize-btn" onClick={() => { haptic.tap(); setPrizesOpen((v) => !v); scroll.current?.scrollTo({ top: 0, behavior: "smooth" }); }}>{prizesOpen ? "Скрыть" : "Призы"}</button>}
            {data && tab !== "authority" && tab !== "ach" && <span>Сброс через <b className="num">{untilText(data.week.end - now)}</b></span>}
          </div>
          {/* on the strip of tape at the bottom left, turned with it */}
          <button className="rt-find display" onClick={findMe}>Найти себя</button>
        </div>
      </div>
    </div>
  );
}

/** /rating (old links): the tops open over the hero on the home screen */
export function RatingScreen() {
  const router = useRouter();
  useEffect(() => { router.replace("/?top=1"); }, [router]);
  return null;
}
