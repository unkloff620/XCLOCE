"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "./ui.tsx";
import { EXCHANGE_EVERY_DAYS, exchangeWindow } from "../content/currencies.ts";
import { haptic } from "./telegram.ts";

const seenKey = (day: string) => `xc-ex-open-${day}`;

/**
 * The exchanger is an event (one Moscow day out of three). On the day it opens, the first visit to the home screen
 * shows a notice once: «Обменник снова работает».
 */
export function ExchangeNotice({ wait }: { wait: boolean }) {
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    if (wait || day) return;
    const w = exchangeWindow(Date.now());
    if (!w.open) return;
    try {
      if (localStorage.getItem(seenKey(w.day))) return;
      localStorage.setItem(seenKey(w.day), "1");
    } catch {
      /* storage blocked: show it anyway */
    }
    haptic.ok();
    setDay(w.day);
  }, [wait, day]);
  if (!day) return null;
  const close = () => setDay("");
  return (
    <Modal onClose={close}>
      <div className="ex-notice">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/ui/exchange.webp" alt="" draggable={false} />
        <b className="display">Обменник снова работает!</b>
        <span className="muted small">Сегодня он готов обменять тебе валюту. Работает один день из {EXCHANGE_EVERY_DAYS} — не упусти.</span>
        <div className="row" style={{ gap: 8, width: "100%" }}>
          <button className="btn grow" onClick={close}>Позже</button>
          <Link className="btn gold grow" href="/exchange" onClick={close}>В обменник</Link>
        </div>
      </div>
    </Modal>
  );
}
