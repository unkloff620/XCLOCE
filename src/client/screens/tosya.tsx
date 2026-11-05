"use client";
/*
 * «Тося» (content/tosya.ts): the kitchen, he stands with the tray; a tap on a pie shows its price, «Купить» buys it
 * and a window shows what was inside. The next pie costs twice as much.
 */
import Link from "next/link";
import { useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Modal, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { TOSYA_ART_V, TosyaRig } from "../art/tosya-rig.tsx";
import { haptic } from "../telegram.ts";
import { money } from "../format.ts";
import { leftText } from "../event-banner.tsx";
import { ItemArt } from "../art/items.tsx";
import type { Granted } from "../api.ts";
import { tosyaLookById } from "../../content/tosya.ts";

export function TosyaScreen() {
  const { state, act, busy } = useGame();
  const now = useNow();
  const t = state?.tosya ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  const [got, setGot] = useState<{ reward: Granted; price: number } | null>(null);
  const usd = state?.wallet.USD ?? 0;
  const buy = async () => {
    if (picked === null) return;
    const r = await act<{ slot: number; price: number; reward: Granted }>("tosya_buy", { slot: picked });
    if (r) {
      haptic.ok();
      setGot({ reward: r.reward, price: r.price });
      setPicked(null);
    }
  };
  const left = t ? t.pies - countBits(t.taken) : 0;
  // his look this visit: what lies on the tray and how it is called
  const look = tosyaLookById(t?.look);
  const w = look.w;
  return (
    <div className="fit-page ts-page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ts-bg" src="/assets/home/room-kitchen.webp?v=1" alt="" draggable={false} />
      <div className="ts-top">
        <div className="title-row">
          <Link href="/" className="back-btn" aria-label="Домой">‹</Link>
          <div className="ts-title">
            <b className="display">Тося</b>
            <span className="small">{t ? <>Проверяет, покушал ли ты. Уедет через <b>{leftText(t.endsAt - now)}</b></> : "Тося уехал. Заедет, когда ему вздумается"}</span>
          </div>
        </div>
        {t && (
          <div className="ts-note small">
            {left > 0
              ? <>{cap(w.many)} на подносе: <b className="num">{left}</b>. Нажми на {w.acc} — что внутри, узнаешь после покупки. Каждый следующий в 2 раза дороже{t.pies === 5 ? ", а первый из пяти — бесплатно" : ""}.</>
              : <>Все {w.pl} твои. {look.full}</>}
          </div>
        )}
        {/* what the pies may hold: a sheet out of the left edge, icons only */}
        {t && (
          <div className="ts-sheet" aria-label={`Что бывает ${w.inMany}`}>
            {["keyboard", "gpu", "rug-pull-gun", "part-gear", "tat-yakuza-chest-l"].map((id) => <ItemArt key={id} id={id} size={30} />)}
            <Icon name="xp" size={28} />
            <Icon name="RUB" size={28} />
            <Icon name="USD" size={28} />
          </div>
        )}
      </div>
      {t && (
        <div className="ts-stage">
          <TosyaRig look={look.art} pies={t.pies} taken={t.taken} picked={picked} onPie={(i) => { haptic.tap(); setPicked(i); }} />
        </div>
      )}
      {picked !== null && t && t.next !== null && (
        <Modal title={w.from} onClose={() => setPicked(null)}>
          <div className="col" style={{ gap: 10, alignItems: "center", textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/assets/tosya/${look.art ? `item${look.art}-c` : "pie-c"}.webp?v=${TOSYA_ART_V}`} alt="" width={140} draggable={false} />
            <button className="btn gold block" disabled={busy === "tosya_buy" || usd < t.next} onClick={buy}>
              {t.next === 0 ? "Взять бесплатно" : <>Купить за <Icon name="USD" size={18} /> {money("USD", t.next)}</>}
            </button>
            {usd < t.next && <span className="tiny muted">Не хватает долларов</span>}
          </div>
        </Modal>
      )}
      {got && (
        <Modal title={`${w.inOne} было`} onClose={() => setGot(null)}>
          <div className="col" style={{ gap: 12, alignItems: "center" }}>
            <RewardChips r={got.reward} size={26} />
            <button className="btn gold block" onClick={() => setGot(null)}>{left > 0 ? `К ${w.next}` : "Спасибо, Тося"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

function countBits(n: number) {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
}
