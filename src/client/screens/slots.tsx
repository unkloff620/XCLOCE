"use client";
import { useEffect, useRef, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { RewardChips } from "../ui.tsx";
import { clock } from "../format.ts";
import { sfx } from "../sound.ts";
import { haptic } from "../telegram.ts";
import { SLOT_OUTCOMES, SLOT_SYMBOLS, slotLevelNeed, slotXpOf, type SlotSymbol } from "../../content/slots.ts";
import { api, type GameState, type Granted } from "../api.ts";

/*
 * The slot room (public/assets/slots/room.webp, 1024×1536, tools/slots/build-slots.py): the drawn machine with three
 * empty cream reels; the symbols (public/assets/slots/<id>.webp) spin on them, the display under the reels tells the
 * result, the big red button spins. Every place below is in the picture's pixels.
 */
const RW = 1024, RH = 1536;
const px = (x: number) => `${(x / RW) * 100}%`;
const py = (y: number) => `${(y / RH) * 100}%`;
const REELS = [{ x: 228, w: 160 }, { x: 430, w: 162 }, { x: 634, w: 150 }];
const REEL_TOP = 440, REEL_H = 346;
const STRIP: SlotSymbol[] = [...SLOT_SYMBOLS, ...SLOT_SYMBOLS, ...SLOT_SYMBOLS];

function Sym({ s }: { s: SlotSymbol }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="sl-sym" src={`/assets/slots/${s}.webp`} alt={s} draggable={false} />;
}

interface Spin {
  outcome: string; kind: "jackpot" | "triple" | "pair" | "miss"; title: string; reels: SlotSymbol[]; reward: Granted | null; left: number;
  /** the machine's xp for this spin, the level after it, the levels reached (each with its reward) */
  xp: number; level: { level: number; into: number; need: number }; levelUps: { level: number; reward: Granted }[];
}

/** the symbol above and below the one on the line (the reel shows three) */
const around = (s: SlotSymbol, d: number) => SLOT_SYMBOLS[(SLOT_SYMBOLS.indexOf(s) + d + SLOT_SYMBOLS.length) % SLOT_SYMBOLS.length];

export function SlotMachine() {
  const { state, setState, toast } = useGame();
  const now = useNow();
  const [reels, setReels] = useState<SlotSymbol[]>(["seven", "seven", "seven"]);
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false]);
  const [result, setResult] = useState<Spin | null>(null);
  const [pay, setPay] = useState(false);
  // three of a kind (or a new level) opens a window with what was won
  const [prize, setPrize] = useState<Spin | null>(null);
  const [press, setPress] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  if (!state) return null;
  const s = state.slots;
  const busy = spinning.some(Boolean);
  const cooling = s.left < 1;

  const spin = async () => {
    if (busy || cooling) return;
    haptic.tap();
    sfx("card");
    setPress((n) => n + 1);
    setResult(null);
    setSpinning([true, true, true]);
    const started = Date.now();
    let r: Spin;
    let fresh: GameState;
    try {
      const res = await api.action<Spin>("slots_spin");
      r = res.result;
      fresh = res.state;
    } catch (e) {
      haptic.err();
      sfx("error");
      toast(e instanceof Error ? e.message : "Автомат заело", "err");
      setSpinning([false, false, false]);
      return;
    }
    const spinRes = r;
    const st = fresh;
    // the reels stop one by one with a little bounce, the result shows after the last one
    const wait = Math.max(0, 900 - (Date.now() - started));
    [0, 1, 2].forEach((i) => {
      timers.current.push(
        setTimeout(() => {
          setReels((old) => old.map((x, k) => (k === i ? spinRes.reels[i] : x)));
          setSpinning((old) => old.map((x, k) => (k === i ? false : x)));
          haptic.tap();
          sfx("dice");
          if (i === 2) {
            setResult(spinRes);
            setState(st); // the balance changes only when the last reel stops
            if (spinRes.kind === "jackpot") { haptic.big(); sfx("levelup"); timers.current.push(setTimeout(() => sfx("coin"), 300)); }
            else if (spinRes.kind !== "miss") { haptic.ok(); sfx("coin"); }
            if (spinRes.levelUps?.length && spinRes.kind !== "jackpot") timers.current.push(setTimeout(() => sfx("levelup"), 250));
            if (spinRes.kind === "jackpot" || spinRes.kind === "triple" || spinRes.levelUps?.length) timers.current.push(setTimeout(() => setPrize(spinRes), 650));
          }
        }, wait + i * 420),
      );
    });
  };

  const win = !!result && result.kind !== "miss";
  const hit = (i: number) => win && !!result && (result.kind === "pair" ? result.reels.filter((x) => x === result.reels[i]).length >= 2 : true);
  return (
    <div className="sl-stage">
      <div className={`sl ${result ? `res-${result.kind}` : ""} ${busy ? "busy" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="sl-bg" src="/assets/slots/room.webp" alt="" draggable={false} />
        {/* the sign's bulbs chase, brighter on a win */}
        <span className="sl-sign" style={{ left: px(190), top: py(60), width: px(640), height: py(320) }} aria-hidden="true" />
        {REELS.map((r, i) => (
          <div key={i} className={`sl-reel ${spinning[i] ? "spin" : "stop"} ${hit(i) ? "hit" : ""}`} style={{ left: px(r.x), top: py(REEL_TOP), width: px(r.w), height: py(REEL_H) }}>
            {spinning[i] ? (
              <div className="sl-strip" style={{ animationDelay: `${-i * 0.13}s` }}>
                {STRIP.map((x, k) => <span key={k}><Sym s={x} /></span>)}
              </div>
            ) : (
              <div className="sl-still" key={`${press}-${reels[i]}`}>
                <span className="dim"><Sym s={around(reels[i], -1)} /></span>
                <span className="mid"><Sym s={reels[i]} /></span>
                <span className="dim"><Sym s={around(reels[i], 1)} /></span>
              </div>
            )}
          </div>
        ))}
        <i className={`sl-line ${win ? "on" : ""}`} style={{ left: px(222), top: py(619), width: px(570) }} aria-hidden="true" />
        {/* the display under the reels: the result, or how many spins are left */}
        <div className="sl-display" style={{ left: px(196), top: py(850), width: px(628), height: py(86) }} aria-live="polite">
          {result ? (
            <>
              <b className={`display ${win ? "win" : "miss"}`}>{result.title}</b>
              <span className="sl-gain">{result.reward && <RewardChips r={result.reward} size={14} />}<i className="sl-xp num">+{result.xp} опыта</i></span>
            </>
          ) : busy ? <b className="display">Крутится…</b> : cooling ? (
            <span>Остывает · <b className="num">{clock((s.nextAt ?? now) - now)}</b></span>
          ) : <span>Прокрутки: <b className="num">{s.left}/{s.max}</b> в час · жми кнопку</span>}
        </div>
        <button className={`sl-btn ${cooling ? "off" : ""}`} key={press} style={{ left: px(420), top: py(964), width: px(172), height: py(172) }}
          disabled={busy || cooling} onClick={spin} aria-label="Крутить">
          <span className="display">{cooling ? "" : "КРУТИТЬ"}</span>
        </button>
        {/* the lever spins too */}
        <button className="sl-lever" style={{ left: px(880), top: py(400), width: px(110), height: py(420) }} disabled={busy || cooling} onClick={spin} aria-label="Дёрнуть рычаг" />
        {/* a win pours coins into the tray, the jackpot showers them over the whole machine */}
        {win && (
          <div className="sl-coins" key={`c${press}`} style={{ left: px(236), top: py(1150), width: px(552), height: py(240) }} aria-hidden="true">
            {Array.from({ length: result!.kind === "jackpot" ? 26 : result!.kind === "triple" ? 14 : 6 }, (_, k) => (
              <i key={k} style={{ left: `${(k * 37) % 92}%`, animationDelay: `${(k % 7) * 0.09}s` }} />
            ))}
          </div>
        )}
        {result?.kind === "jackpot" && <div className="sl-rain" aria-hidden="true">{Array.from({ length: 30 }, (_, k) => <i key={k} style={{ left: `${(k * 53) % 100}%`, animationDelay: `${(k % 10) * 0.15}s` }} />)}</div>}
        <button className="sl-pay-btn" style={{ left: px(40), top: py(1420), width: px(250), height: py(80) }} onClick={() => setPay(true)}>Выплаты</button>
        <span className="sl-left num" style={{ left: px(734), top: py(1420), width: px(250), height: py(80) }}>{s.left}/{s.max}</span>
        {/* the machine's own level: xp for every spin, a reward for every level */}
        <span className="sl-level" style={{ left: px(306), top: py(1420), width: px(412), height: py(80) }} title={`Уровень автомата: ${s.level}. До следующего ${s.need - s.into} опыта`}>
          <b className="display num">{s.level}</b>
          <span className="sl-level-bar" style={{ ["--p" as string]: `${Math.round((s.into / Math.max(1, s.need)) * 100)}%` }}><i /><span className="num">{s.into}/{s.need}</span></span>
        </span>
      </div>
      {prize && (
        <div className="sl-paytable sl-prize" onClick={() => setPrize(null)}>
          <div className={`sl-paytable-in ${prize.kind}`} onClick={(e) => e.stopPropagation()}>
            {prize.kind === "jackpot" || prize.kind === "triple" ? (
              <>
                <b className="display sl-prize-title">{prize.kind === "jackpot" ? "КУШ!" : "Выигрыш!"}</b>
                <span className="sl-pay-sym big">{prize.reels.map((x, k) => <Sym key={k} s={x} />)}</span>
                <span className="small">{prize.title}</span>
                {prize.reward && <RewardChips r={prize.reward} size={22} />}
              </>
            ) : <b className="display sl-prize-title">Новый уровень!</b>}
            <i className="sl-xp num">+{prize.xp} опыта автомата</i>
            {prize.levelUps?.map((u) => (
              <div key={u.level} className="sl-prize-lv">
                <b className="display">Уровень {u.level}</b>
                <RewardChips r={u.reward} size={18} />
              </div>
            ))}
            <button className="btn gold block" onClick={() => setPrize(null)}>Забрать</button>
          </div>
        </div>
      )}
      {pay && (
        <div className="sl-paytable" onClick={() => setPay(false)}>
          <div className="sl-paytable-in" onClick={(e) => e.stopPropagation()}>
            <b className="display">Выплаты</b>
            {SLOT_OUTCOMES.filter((o) => o.kind !== "miss").map((o) => (
              <div key={o.id} className="sl-pay-row">
                <span className="sl-pay-sym">{o.triple ? [0, 1, 2].map((k) => <Sym key={k} s={o.triple!} />) : <span className="tiny">любые 2</span>}</span>
                <RewardChips r={o.reward} size={13} />
                <i className="sl-xp num">+{slotXpOf(o.id)}</i>
              </div>
            ))}
            <span className="tiny sl-pay-note">Каждый прокрут — опыт автомата (мимо — +{slotXpOf("miss")}). Уровень 2 — {slotLevelNeed(1)} опыта, дальше каждый на {slotLevelNeed(2) - slotLevelNeed(1)} больше. За каждый уровень — награда: ₽, каждый 5-й — ещё $, каждый 10-й — видеокарта.</span>
            <button className="btn gold block" onClick={() => setPay(false)}>Понятно</button>
          </div>
        </div>
      )}
    </div>
  );
}
