"use client";
/*
 * The newcomer's first steps: not a slideshow — a short chain of real actions, each one a picture and a few words in a
 * small card at the bottom, with a pulsing ring and a bouncing arrow over the very thing to tap on the current screen.
 * A step is done when its action goes through (api.ts fires ACTION_EVENT), then the next one starts. At the end —
 * a gift (server: starter_gift, once; it also marks the "first-steps" help topic). Progress is kept on this device.
 */
import { uiZoom, zoomRect } from "./phone-mode.ts";
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
/** «Пройти обучение заново»: Баба Зина from the start */
export const GUIDE_REPLAY = "xc-guide-replay";
const KEY = "xc-first-steps";

/** where to point on a screen: the first rule whose path matches and whose element is on the page wins */
interface Aim { at: (path: string) => boolean; sel: string }
interface Step { id: string; title: string; say: string; pic: string; done: string[]; aims: Aim[]; talk?: boolean }

/** the bottom-bar button to the screen — not while already on it (then the screen's own aims or nothing) */
const navTo = (label: string, path: string): Aim => ({ at: (p) => p !== path && !p.startsWith(path + "/"), sel: `.nav a[aria-label="${label}"]` });
/*
 * Баба Зина leads the newcomer: each step is her line in a bubble at the bottom. A «do» step waits for its action
 * (the ring and the arrow show where); a «talk» step is read and «Дальше» (its ring shows what she talks about).
 */
const STEPS: Step[] = [
  { id: "hi", talk: true, title: "Здорово, внучок!", say: "Я Баба Зина. В этом дворе я всё знаю: кто кому должен, где что лежит и почему Дацкоу сидит в холодильнике. Держись меня — не пропадёшь.", pic: "", done: [], aims: [] },
  {
    id: "yard", title: "Подбери находку", say: "Начнём с простого. Во дворе вечно что-то валяется — иди во двор и подбери находку. Кошелёк найдёшь — мне половину.", pic: "/assets/items/lost-wallet.webp", done: ["yard_pick"],
    aims: [{ at: (p) => p === "/yard", sel: ".yard-item" }, { at: (p) => p === "/yard", sel: ".yard-timer" }, navTo("Двор", "/yard")],
  },
  { id: "yard-talk", talk: true, title: "Находки", say: "Находки появляются сами, со временем. Ненужное барыга купит, а что-то пригодится в крафте. Ничего не выбрасывай — я вот пакеты 30 лет храню.", pic: "", done: [], aims: [] },
  {
    id: "task", title: "Выполни задание", say: "Теперь работа. Зайди в подъезд — там задания для жильцов. Каждое тратит энергию, зато платит рублями и авторитетом.", pic: "/assets/yard/court-entrance.webp", done: ["task"],
    aims: [
      { at: (p) => p.startsWith("/locations/"), sel: ".lp-stop.now" },
      { at: (p) => p === "/locations", sel: ".loc-card.current" },
      { at: (p) => p === "/yard", sel: ".yard-entrance" },
      navTo("Двор", "/yard"),
    ],
  },
  { id: "energy", talk: true, title: "Энергия", say: "Вот твоя энергия — она сверху. Кончилась — подожди, она сама копится. Или энергетик выпей. Только не банку за банкой, как Петрович.", pic: "", done: [], aims: [{ at: () => true, sel: ".energy-chip" }] },
  {
    id: "boss", title: "Ударь босса", say: "А теперь главное — боссы. Дацкоу опять в холодильнике заперся. Иди открой дверь и врежь ему, для профилактики.", pic: "/bosses/datsik/portrait.webp", done: ["attack"],
    aims: [
      { at: (p) => p.startsWith("/bosses/"), sel: ".weapon:not(.empty):not(.cd)" },
      { at: (p) => p.startsWith("/bosses/"), sel: ".door-leaf:not([disabled])" },
      { at: (p) => p === "/bosses", sel: '.bcard[href="/bosses/datsik"]' },
      navTo("Боссы", "/bosses"),
    ],
  },
  { id: "boss-talk", talk: true, title: "Оружие и пропуска", say: "Каждое оружие бьёт и уходит на перезарядку — клавиатуры, видеокарты, всё в магазине. Победишь босса — дадут пропуска к следующему. В «Блатном» режиме с боссов падают шмотки, а в «Авторитетном» — наколки.", pic: "", done: [], aims: [] },
  {
    id: "zonk", title: "Брось кости", say: "Отдохни — сыграй в кости во дворе. Зонк — моя молодость! Я весь подъезд обыгрывала. Ну, почти весь.", pic: "/assets/yard/game-zonk.webp", done: ["game_start", "zonk_move"],
    aims: [
      { at: (p) => p === "/yard", sel: ".zb-lvl:not([disabled])" },
      { at: (p) => p === "/yard", sel: '.game-tile[data-game="zonk"]' },
      { at: (p) => p === "/yard", sel: ".yard-table" },
      navTo("Двор", "/yard"),
    ],
  },
  { id: "shop", talk: true, title: "Магазин", say: "Магазин — тут оружие, энергия и шмотки. А валюту меняет барыга в гараже во дворе. Торгуйся, он это любит.", pic: "", done: [], aims: [{ at: () => true, sel: '.nav a[aria-label="Магазин"]' }] },
  { id: "home", talk: true, title: "Твоя хата", say: "Дома — твоя хата. Нажми на героя — переоденешься, набьёшь наколки, обставишь комнату. Красота — она для своих.", pic: "", done: [], aims: [{ at: () => true, sel: '.nav a[aria-label="Дом"]' }] },
  { id: "menu", talk: true, title: "Бонус и задания", say: "В меню дома — бонус за вход и задания дня. Заходи каждый день, я проверю. У меня всё записано.", pic: "", done: [], aims: [{ at: (p) => p === "/", sel: '[aria-label="Меню"]' }] },
  { id: "talents", talk: true, title: "Таланты и кланы", say: "Растёшь в уровнях — получаешь таланты, вкладывай их в личном деле. А с кланом боссов бить веселее — вступай, это как семья, только с бицухой.", pic: "", done: [], aims: [{ at: () => true, sel: '.nav a[aria-label="Кланы"]' }] },
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
        const all = Array.from(document.querySelectorAll(a.sel)).filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.height > 0;
        });
        // the one a finger can really reach first (not under the leaders strip or the step card)
        const reachable = (e: Element) => {
          const b = e.getBoundingClientRect();
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return !!hit && (hit === e || e.contains(hit));
        };
        const el = all.find(reachable) ?? all[0];
        if (el) {
          const b = zoomRect(el.getBoundingClientRect());
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
  // «Пройти обучение заново» (the profile settings) shows her again, for anyone
  const [replay, setReplay] = useState(false);
  const pending = mounted && (firstStepsPending(state) || replay);
  // the gift was taken already (a replay): the end only says goodbye
  const gifted = !!state?.helpSeen.includes(DONE_TOPIC);
  useEffect(() => {
    setMounted(true);
    const k = readStep();
    if (k > 0) setI(k);
    const again = () => { setI(-1); writeStep(0); setReplay(true); };
    window.addEventListener(GUIDE_REPLAY, again);
    return () => window.removeEventListener(GUIDE_REPLAY, again);
  }, []);

  // a step's action went through: a short cheer, then the next step
  useEffect(() => {
    if (!pending || i < 0 || i >= STEPS.length) return;
    const on = (e: Event) => {
      const type = (e as CustomEvent<string>).detail;
      if (STEPS[i].talk || !STEPS[i].done.includes(type)) return;
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
    setReplay(false);
    writeStep(0);
    if (!gifted) void act("help_seen", { topic: DONE_TOPIC });
  };
  const next = () => {
    haptic.tap();
    sfx("step");
    setI((k) => {
      writeStep(k + 1);
      return k + 1;
    });
  };
  const done = () => {
    haptic.tap();
    setReplay(false);
    writeStep(0);
  };
  const start = () => {
    haptic.tap();
    sfx("step");
    setI(0);
    writeStep(0);
  };
  const gift = async () => {
    const r = await act("starter_gift", {}, "Подарок получен!");
    if (r) { haptic.big(); writeStep(0); setReplay(false); }
  };

  const dots = <div className="fs-dots" aria-hidden="true">{STEPS.map((s, k) => <i key={s.id} className={k < i ? "done" : k === i ? "on" : ""} />)}</div>;

  return createPortal(
    <>
      {/* the welcome: Баба Зина */}
      {i < 0 && (
        <div className="fs-back" role="dialog" aria-modal="true" aria-label="Обучение">
          <div className="fs-hello zn-hello">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="zn-big" src="/assets/guide/zina.webp?v=1" alt="Баба Зина" draggable={false} />
            <b className="display fs-hello-t">Баба Зина</b>
            <p className="zn-hello-t">Ты новенький? Вижу, что новенький. Пойдём, покажу тебе наш двор — а в конце подарочек дам.</p>
            <div className="fs-hello-gift">
              <span className="tiny muted">в конце — подарок</span>
              <RewardChips r={FIRST_STEPS_GIFT} size={16} />
            </div>
            <button className="btn gold big block" onClick={start}>Пойдём, Баба Зина!</button>
            <button className="fs-skip" onClick={skip}>Я уже всё знаю</button>
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
        <div className={`zn-card ${cheer ? "cheer" : ""} ${rect && rect.bottom > (window.innerHeight / uiZoom()) * 0.55 ? "top" : ""}`} key={step.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="zn-face" src="/assets/guide/zina.webp?v=1" alt="" draggable={false} />
          <div className="zn-bubble">
            <b className="display zn-title">{cheer ? "Молодец, внучок!" : step.title}</b>
            <p className="zn-say">{cheer ? "Вот видишь — всё получается. Идём дальше." : step.say}</p>
            <div className="zn-foot">
              {dots}
              {step.talk && !cheer && <button className="btn gold sm" onClick={next}>Дальше ›</button>}
            </div>
          </div>
          {!cheer && <button className="fs-x" onClick={skip} aria-label="Закрыть обучение">×</button>}
        </div>
      )}

      {/* done: the gift */}
      {i >= STEPS.length && (
        <div className="fs-back" role="dialog" aria-modal="true" aria-label="Подарок">
          <div className="fs-hello fs-done">
            <div className="fs-boom" aria-hidden="true">{Array.from({ length: 12 }, (_, k) => <i key={k} style={{ ["--k" as string]: k }} />)}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="zn-big small" src="/assets/guide/zina.webp?v=1" alt="" draggable={false} />
            <b className="display fs-hello-t">Ты в теме!</b>
            <p className="zn-hello-t">Держи подарочек. А ещё у меня для тебя задания на 3 дня — кнопка «Новичок» на главном экране. Сделаешь — озолочу!</p>
            {gifted ? <button className="btn gold big block" onClick={done}>Играть</button> : (
              <>
                <RewardChips r={FIRST_STEPS_GIFT} size={18} />
                <button className="btn gold big block" disabled={busy === "starter_gift"} onClick={gift}>Забрать подарок</button>
              </>
            )}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
