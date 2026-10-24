"use client";
/*
 * The newcomer's first steps: not a slideshow — a short chain of real actions, each one a picture and a few words in a
 * small card at the bottom, with a pulsing ring and a bouncing arrow over the very thing to tap on the current screen.
 * A step is done when its action goes through (api.ts fires ACTION_EVENT), then the next one starts. At the end —
 * a gift (server: starter_gift, once; it also marks the "first-steps" help topic). Progress is kept on this device.
 */
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useGame } from "./store.tsx";
import { ACTION_EVENT, type GameState } from "./api.ts";
import { RewardChips } from "./ui.tsx";
import { sfx } from "./sound.ts";
import { haptic } from "./telegram.ts";
import { usedUrl } from "./preload.ts";
import { FIRST_STEPS_GIFT } from "../content/home.ts";

const DONE_TOPIC = "first-steps";
const KEY = "xc-first-steps";

/** where to point on a screen: the first rule whose path matches and whose element is on the page wins */
interface Aim { at: (path: string) => boolean; sel: string }
interface Step { id: string; title: string; pic: string; done: string[]; aims: Aim[] }

/** the bottom-bar button to the screen — not while already on it (then the screen's own aims or nothing) */
const navTo = (label: string, path: string): Aim => ({ at: (p) => p !== path && !p.startsWith(path + "/"), sel: `.nav a[aria-label="${label}"]` });
const STEPS: Step[] = [
  {
    id: "yard", title: "Подбери находку", pic: "/assets/items/lost-wallet.webp", done: ["yard_pick"],
    aims: [{ at: (p) => p === "/yard", sel: ".yard-item" }, { at: (p) => p === "/yard", sel: ".yard-timer" }, navTo("Двор", "/yard")],
  },
  {
    id: "task", title: "Выполни задание", pic: "/assets/yard/court-entrance.webp", done: ["task"],
    aims: [
      { at: (p) => p.startsWith("/locations/"), sel: ".task-go:not([disabled])" },
      { at: (p) => p === "/locations", sel: ".loc-card.current" },
      { at: (p) => p === "/yard", sel: ".yard-entrance" },
      navTo("Двор", "/yard"),
    ],
  },
  {
    id: "boss", title: "Ударь босса", pic: "/bosses/datsik/portrait.webp", done: ["attack"],
    aims: [
      { at: (p) => p.startsWith("/bosses/"), sel: ".weapon:not(.empty):not(.cd)" },
      { at: (p) => p.startsWith("/bosses/"), sel: ".door-leaf:not([disabled])" },
      { at: (p) => p === "/bosses", sel: '.bcard[href="/bosses/datsik"]' },
      navTo("Боссы", "/bosses"),
    ],
  },
  {
    id: "zonk", title: "Брось кости", pic: "/assets/yard/game-zonk.webp", done: ["game_start", "zonk_move"],
    aims: [
      { at: (p) => p === "/yard", sel: ".zb-lvl:not([disabled])" },
      { at: (p) => p === "/yard", sel: '.game-tile[data-game="zonk"]' },
      { at: (p) => p === "/yard", sel: ".yard-table" },
      navTo("Двор", "/yard"),
    ],
  },
];

/** a newcomer who has not finished (or skipped) the first steps — players who saw the old tour are not newcomers */
export function firstStepsPending(state: GameState | null): boolean {
  return !!state && state.player.level <= 3 && !state.helpSeen.includes(DONE_TOPIC) && !state.helpSeen.includes("tutorial");
}

function readStep(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? Math.min(v, STEPS.length) : 0;
  } catch {
    return 0;
  }
}
function writeStep(n: number) {
  try {
    localStorage.setItem(KEY, String(n));
  } catch {
    /* storage blocked: progress lasts this session */
  }
}

/** the element to point at now: re-checked often, screens and windows come and go */
function useAim(aims: Aim[] | null, path: string) {
  const [r, setR] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!aims) return setR(null);
    const find = () => {
      for (const a of aims) {
        if (!a.at(path)) continue;
        const el = Array.from(document.querySelectorAll(a.sel)).find((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.height > 0;
        });
        if (el) {
          const b = el.getBoundingClientRect();
          setR((old) => (old && Math.abs(old.left - b.left) < 1 && Math.abs(old.top - b.top) < 1 && Math.abs(old.width - b.width) < 1 ? old : b));
          return;
        }
      }
      setR(null);
    };
    find();
    const t = setInterval(find, 400);
    window.addEventListener("resize", find);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", find);
    };
  }, [aims, path]);
  return r;
}

export function FirstSteps() {
  const { state, act, busy } = useGame();
  const path = usePathname();
  const [mounted, setMounted] = useState(false);
  // -1: the welcome card; 0…n-1: the steps; n: the gift
  const [i, setI] = useState(-1);
  const [cheer, setCheer] = useState(false);
  const pending = mounted && firstStepsPending(state);
  useEffect(() => {
    setMounted(true);
    const k = readStep();
    if (k > 0) setI(k);
  }, []);

  // a step's action went through: a short cheer, then the next step
  useEffect(() => {
    if (!pending || i < 0 || i >= STEPS.length) return;
    const on = (e: Event) => {
      const type = (e as CustomEvent<string>).detail;
      if (!STEPS[i].done.includes(type)) return;
      haptic.ok();
      sfx("levelup");
      setCheer(true);
      setTimeout(() => {
        setCheer(false);
        setI((k) => {
          writeStep(k + 1);
          return k + 1;
        });
      }, 1300);
    };
    window.addEventListener(ACTION_EVENT, on);
    return () => window.removeEventListener(ACTION_EVENT, on);
  }, [pending, i]);

  const step = i >= 0 && i < STEPS.length ? STEPS[i] : null;
  const rect = useAim(pending && step && !cheer ? step.aims : null, path);
  if (!pending) return null;

  const skip = () => {
    haptic.tap();
    void act("help_seen", { topic: DONE_TOPIC });
  };
  const start = () => {
    haptic.tap();
    sfx("step");
    setI(0);
    writeStep(0);
  };
  const gift = async () => {
    const r = await act("starter_gift", {}, "Подарок получен!");
    if (r) { haptic.big(); writeStep(0); }
  };

  const dots = <div className="fs-dots" aria-hidden="true">{STEPS.map((s, k) => <i key={s.id} className={k < i ? "done" : k === i ? "on" : ""} />)}</div>;

  return createPortal(
    <>
      {/* the welcome: who we are and four pictures of what is ahead */}
      {i < 0 && (
        <div className="fs-back" role="dialog" aria-modal="true" aria-label="Первые шаги">
          <div className="fs-hello">
            <b className="display fs-hello-t">Добро пожаловать!</b>
            <div className="fs-hello-pics">
              {STEPS.map((s, k) => (
                <figure key={s.id} style={{ ["--k" as string]: k }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={usedUrl(s.pic)} alt="" draggable={false} />
                  <figcaption>{s.title}</figcaption>
                </figure>
              ))}
            </div>
            <div className="fs-hello-gift">
              <span className="tiny muted">за 4 шага — подарок</span>
              <RewardChips r={FIRST_STEPS_GIFT} size={16} />
            </div>
            <button className="btn gold big block" onClick={start}>Поехали!</button>
            <button className="fs-skip" onClick={skip}>Я уже умею</button>
          </div>
        </div>
      )}

      {/* a step: the ring and the arrow over the thing to tap */}
      {step && rect && !cheer && (
        <div className="fs-aim" aria-hidden="true" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}>
          <svg className="fs-arrow" viewBox="0 0 40 48" width="40" height="48">
            <path d="M20 46 L4 26 H13 V4 H27 V26 H36 Z" fill="#ffd25a" stroke="#2e1c00" strokeWidth="3" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      {step && (
        <div className={`fs-card ${cheer ? "cheer" : ""}`} key={step.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="fs-pic" src={usedUrl(step.pic)} alt="" draggable={false} />
          <span className="fs-main">
            <b className="display">{cheer ? "Есть!" : step.title}</b>
            {dots}
          </span>
          {!cheer && <button className="fs-x" onClick={skip} aria-label="Закрыть обучение">×</button>}
        </div>
      )}

      {/* done: the gift */}
      {i >= STEPS.length && (
        <div className="fs-back" role="dialog" aria-modal="true" aria-label="Подарок">
          <div className="fs-hello fs-done">
            <div className="fs-boom" aria-hidden="true">{Array.from({ length: 12 }, (_, k) => <i key={k} style={{ ["--k" as string]: k }} />)}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="fs-gift-pic" src={usedUrl("/assets/items/poker-chip.webp")} alt="" draggable={false} />
            <b className="display fs-hello-t">Ты в теме!</b>
            <RewardChips r={FIRST_STEPS_GIFT} size={18} />
            <button className="btn gold big block" disabled={busy === "starter_gift"} onClick={gift}>Забрать подарок</button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
