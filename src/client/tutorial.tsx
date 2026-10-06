"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useGame } from "./store.tsx";
import type { GameState } from "./api.ts";
import { sfx } from "./sound.ts";
import { haptic } from "./telegram.ts";

/*
 * First-visit tour on the home screen: a spotlight walks over the key places one by one.
 * Shown once (remembered on the server as the "tutorial" help topic), only to newcomers.
 */

interface Step { target?: string; title: string; text: string }

const STEPS: Step[] = [
  { title: "Добро пожаловать в XCLOSE!", text: "Короткая экскурсия по офису — шесть шагов, меньше минуты. Пропустить можно в любой момент." },
  { target: '.nav a[aria-label="Боссы"]', title: "Боссы", text: "Главное здесь. Начни бой и бей оружием: кулак бесплатный и бьёт раз в час, остальное оружие — из магазина и находок. Урон всех игроков общий." },
  { target: ".energy-chip", title: "Энергия", text: "Тратится на задания в локациях и сама восстанавливается: +1 каждые 5 минут. Задания дают рубли, авторитет и вещи." },
  { target: '.nav a[aria-label="Двор"]', title: "Двор", text: "Отсюда — в локации с заданиями, в магазин и к автомату 777. Каждые 5 минут во дворе появляется находка." },
  { target: '[aria-label="Системник"]', title: "Твой компьютер", text: "Системник: его улучшения появятся позже. А таланты за урон по боссам тратятся на оружие — их окно открывается из боя, профиля и инвентаря." },
  { target: '[aria-label="Меню"]', title: "Меню", text: "Здесь всё для дома: гардероб, бонус за вход, задания дня с сундуком, обстановка комнаты и рейтинг. Красная точка — значит, внутри что-то ждёт." },
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

  const finish = useCallback(() => {
    setGone(true);
    setForced(false);
    if (!state?.helpSeen.includes(TUTORIAL)) void act("help_seen", { topic: TUTORIAL });
  }, [act, state]);
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
      ? { top: Math.min(vh - 220, spot.top + spot.height + 14) }
      : { bottom: Math.max(12, vh - spot.top + 14) };

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label="Обучение">
      {spot ? <div className="tour-spot" style={spot} /> : <div className="tour-dim" />}
      <div className="tour-card" style={cardStyle} key={i}>
        <div className="tour-steps" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? "on" : k < i ? "done" : ""} />)}</div>
        <b className="display tour-title">{step.title}</b>
        <p className="tour-text">{step.text}</p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          {i < STEPS.length - 1 ? <button className="btn dark sm" onClick={finish}>Пропустить</button> : <span />}
          <button className="btn gold" onClick={next}>{i === 0 ? "Поехали" : i === STEPS.length - 1 ? "Начать играть" : "Дальше"} ›</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
