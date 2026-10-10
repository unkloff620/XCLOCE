"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGame } from "./store.tsx";
import type { GameState } from "./api.ts";
import { sfx } from "./sound.ts";
import { haptic } from "./telegram.ts";
import { usedUrl } from "./preload.ts";

/*
 * First-visit tour on the home screen: a spotlight walks over the key places one by one, each step a picture and a
 * short text (bosses, weapons, passes, boss things, talents, energy, locations, нычки, yard, shop, authority, room, clans).
 * Shown once (remembered on the server as the "tutorial" help topic), only to newcomers.
 */

/** a picture on a step: an asset from public/ and an optional short caption under it */
interface Pic { src: string; cap?: string }
/** `wide` — one landscape picture across the card (a location card); otherwise a row of square pictures */
interface Step { target?: string; title: string; text: string; pics?: Pic[]; wide?: boolean }

const item = (id: string, cap?: string): Pic => ({ src: `/assets/items/${id}.webp`, cap });
const ui = (id: string, cap?: string): Pic => ({ src: `/assets/ui/${id}.webp`, cap });
const nav = (id: string, cap: string): Pic => ({ src: `/assets/nav/${id}.webp`, cap });

const STEPS: Step[] = [
  {
    title: "Добро пожаловать в XCLOSE!", pics: [nav("home", "Дом"), nav("yard", "Двор"), nav("bosses", "Боссы"), nav("shop", "Магазин")],
    text: "Короткая экскурсия: что где лежит и как тут всё устроено. Пропустить можно в любой момент, а пройти заново — в профиле.",
  },
  {
    target: '.nav a[aria-label="Боссы"]', title: "Боссы",
    pics: [{ src: "/bosses/datsik/portrait.webp", cap: "Дацкоу" }, { src: "/bosses/kedr/portrait.webp", cap: "Кедр" }, { src: "/bosses/bebyakyan/portrait.webp", cap: "Командате" }],
    text: "Главное в игре. Начни бой и бей босса оружием — урон всех игроков общий.",
  },
  {
    title: "Оружие",
    pics: [item("fist", "кулак"), item("mouse", "мышь"), item("red-candle", "свеча"), item("keyboard", "клава"), item("gpu", "GPU"), item("rug-pull-gun", "пушка")],
    text: "Кулак, мышь и свеча — бесплатные, бьют раз в 5 часов. Остальное оружие тратится за удар, зато бьёт сильнее.",
  },
  {
    title: "Пропуски", pics: [item("card-bronze", "бронза"), item("card-silver", "серебро"), item("card-gold", "золото")],
    text: "Побеждай босса — получай его пропуски. Пропуски открывают бой со следующим боссом.",
  },
  {
    title: "Вещи с боссов", pics: [item("tee-pump"), item("slippers"), item("bottle-komandate"), item("hand-drum")],
    text: "С боссов выпадают вещи. Выпавшую вещь можно купить в магазине.",
  },
  {
    title: "Таланты", pics: [ui("tech")],
    text: "Наноси урон боссам, получай таланты, улучшай оружие.",
  },
  {
    target: ".energy-chip", title: "Энергия", pics: [ui("energy-can"), item("energy-drink", "энергетик"), item("energy-pack", "пачка")],
    text: "Тратится на задания и сама восстанавливается: +1 каждые 5 минут. Энергетики из двора и магазина дают энергию сразу — даже сверх лимита.",
  },
  {
    title: "Локации и задания", pics: [{ src: "/assets/yard/court-entrance.webp", cap: "подъезд" }],
    text: "Подъезд во дворе ведёт в локации: опенспейс, крипто-рынок, серверная, майнинг-подвал, совет директоров. Задания дают рубли, авторитет и вещи. Прошёл все задания локации — забери её награду.",
  },
  {
    title: "Нычки", pics: [{ src: "/assets/stash/set-1.webp", cap: "набор из 4 нычек" }],
    text: "В заданиях иногда находятся нычки, а за закрытую локацию одна выпадает точно. Собери все 4 нычки набора и нажми на набор в «Нычках» — получишь его награду.",
  },
  {
    target: '.nav a[aria-label="Двор"]', title: "Двор",
    pics: [{ src: "/assets/yard/court-entrance.webp", cap: "подъезд" }, { src: "/assets/yard/court-slot.webp", cap: "777" }, { src: "/assets/yard/court-upgrader.webp", cap: "апгрейдер" }, { src: "/assets/yard/court-table.webp", cap: "блэкджек, зонк" }],
    text: "Каждые 5 минут во дворе появляется находка — собирай. Тут же автомат 777 с бесплатными прокрутками, апгрейдер вещей, блэкджек и зонк.",
  },
  {
    target: '.nav a[aria-label="Магазин"]', title: "Магазин и обменник", pics: [ui("shop", "магазин"), ui("exchange", "обменник")],
    text: "В магазине — оружие, энергия и одежда за рубли, доллары и SOL. Не хватает нужной валюты — обменник во дворе поменяет одну на другую.",
  },
  {
    title: "Авторитет и достижения", pics: [ui("authority", "авторитет"), ui("ach-chests", "награды")],
    text: "Авторитет — опыт за задания и победы, с ним растёт уровень. Достижения дают награды и очки-солнца, а лучшие в рейтинге недели получают призы.",
  },
  {
    target: '[aria-label="Персонаж: гардероб"]', title: "Твой герой", pics: [ui("slot-head"), ui("slot-shirt"), ui("slot-pants"), ui("slot-shoes")],
    text: "Нажми на героя — откроется редактор: одежда, причёска, цвет кожи. Нажми на мониторы — обстановка комнаты, она даёт бонусы к урону.",
  },
  {
    target: '.nav a[aria-label="Кланы"]', title: "Кланы", pics: [nav("clans", "кланы")],
    text: "Вступи в клан или создай свой — вместе бить боссов веселее, а клан видно в рейтинге.",
  },
  {
    target: '[aria-label="Меню"]', title: "Меню", pics: [ui("bonus", "бонус"), ui("tasks", "задания дня")],
    text: "Здесь всё для дома: бонус за вход, задания дня с сундуком, обстановка и рейтинг. Красная точка — значит, внутри что-то ждёт. Удачи!",
  },
];

export const TUTORIAL = "tutorial";
const REPLAY = "xc-tour";
/** Starts the tour again (from the profile settings); the home screen shows it. */
export function replayTutorial() {
  window.dispatchEvent(new Event(REPLAY));
}
/** a newcomer who has not finished (or skipped) the tour */
export function tutorialPending(state: GameState | null): boolean {
  return !!state && state.player.level <= 3 && !state.helpSeen.includes(TUTORIAL);
}

function useRect(selector: string | undefined, tick: number) {
  const [r, setR] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) return setR(null);
    const measure = () => {
      const el = document.querySelector(selector);
      setR(el ? el.getBoundingClientRect() : null);
    };
    measure();
    // the room scene can settle a moment later: re-measure briefly, and on resize
    const t = [setTimeout(measure, 120), setTimeout(measure, 500)];
    window.addEventListener("resize", measure);
    return () => {
      t.forEach(clearTimeout);
      window.removeEventListener("resize", measure);
    };
  }, [selector, tick]);
  return r;
}

export function Tutorial() {
  const { state, act } = useGame();
  const path = usePathname();
  const [i, setI] = useState(0);
  const [gone, setGone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [forced, setForced] = useState(false);
  useEffect(() => {
    setMounted(true);
    const again = () => {
      setI(0);
      setGone(false);
      setForced(true);
    };
    window.addEventListener(REPLAY, again);
    return () => window.removeEventListener(REPLAY, again);
  }, []);
  const active = mounted && !gone && path === "/" && (forced || tutorialPending(state));
  const step = STEPS[i];
  const rect = useRect(active ? step.target : undefined, i);
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(260);
  useLayoutEffect(() => {
    if (!card.current) return;
    const el = card.current;
    const measure = () => setCardH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, i]);

  const finish = useCallback(() => {
    setGone(true);
    setForced(false);
    if (!state?.helpSeen.includes(TUTORIAL)) void act("help_seen", { topic: TUTORIAL });
  }, [act, state]);
  const back = () => {
    haptic.tap();
    sfx("step");
    setI((k) => Math.max(0, k - 1));
  };
  const next = () => {
    haptic.tap();
    if (i >= STEPS.length - 1) {
      sfx("reward");
      return finish();
    }
    sfx("step");
    setI(i + 1);
  };

  if (!active) return null;
  const pad = 8;
  const spot = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  // the card goes under the target when the target is in the upper half, above it otherwise
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const below = !spot || spot.top + spot.height / 2 < vh / 2;
  const cardStyle = !spot
    ? { top: "50%", transform: "translateY(-50%)" }
    : below
      ? { top: Math.max(12, Math.min(vh - cardH - 12, spot.top + spot.height + 14)) }
      : { bottom: Math.max(12, vh - spot.top + 14) };

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label="Обучение">
      {spot ? <div className="tour-spot" style={spot} /> : <div className="tour-dim" />}
      <div className="tour-card" style={cardStyle} key={i} ref={card}>
        <div className="tour-top">
          <div className="tour-steps" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? "on" : k < i ? "done" : ""} />)}</div>
          {i < STEPS.length - 1 && <button className="tour-skip" onClick={finish}>Пропустить</button>}
        </div>
        <b className="display tour-title">{step.title}</b>
        {step.pics && (
          <div className={`tour-pics${step.wide ? " wide" : ""}${step.pics.length > 4 ? " many" : ""}`}>
            {step.pics.map((p) => (
              <figure key={p.src}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={usedUrl(p.src)} alt="" draggable={false} />
                {p.cap && <figcaption>{p.cap}</figcaption>}
              </figure>
            ))}
          </div>
        )}
        <p className="tour-text">{step.text}</p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          {i > 0 ? <button className="btn dark" onClick={back}>‹ Назад</button> : <span />}
          <button className="btn gold" onClick={next}>{i === 0 ? "Поехали" : i === STEPS.length - 1 ? "Играть" : "Дальше"} ›</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
