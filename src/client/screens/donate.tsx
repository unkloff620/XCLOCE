"use client";
/*
 * «Донат» (content/donate.ts): the artist's wooden board with the currency tabs on top (the open one lifted) and the
 * 9 packs of the tab as wooden cells — the goods, the amount, a button with the price in Telegram Stars. A tap makes the
 * invoice (/api/donate) and opens it in Telegram; the currency comes by the bot's webhook, the state is refreshed after.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { DONATE_PACKS, DONATE_TABS, type DonatePack } from "../../content/donate.ts";
import type { Currency } from "../../content/currencies.ts";
import { Icon } from "../art/icons.tsx";
import { api } from "../api.ts";
import { full } from "../format.ts";
import { useGame } from "../store.tsx";
import { haptic, tg } from "../telegram.ts";

const ART = "/assets/shop/donate";
/** bump when the art in public/assets/shop/donate changes */
const V = "?v=6";
/** the picture of each of the 9 packs: generated from one coin to a heap of sacks (tools/shop/build-donate.py) */
const packPic = (p: DonatePack) => `${ART}/${p.cur.toLowerCase()}-${p.idx}.webp${V}`;

/** the Telegram Stars mark */
export function Star({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", display: "block" }}>
      <path d="M12 1.8l3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.2l-6.2 3.5 1.4-6.9L2 9l7-.8z" fill="#ffc21a" stroke="#5a3306" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 4.6l2.1 4.5 4.6.5" fill="none" stroke="#fff4b8" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function DonateWindow({ cur, onClose }: { cur: Currency; onClose: () => void }) {
  const { refresh, toast } = useGame();
  const [tab, setTab] = useState<Currency>(cur);
  const [busy, setBusy] = useState<string | null>(null);
  const packs = DONATE_PACKS.filter((p) => p.cur === tab);
  const buy = async (p: DonatePack) => {
    const w = tg();
    if (!w?.openInvoice) { toast("Покупка за звёзды работает только в Telegram", "err"); return; }
    haptic.tap();
    setBusy(p.id);
    try {
      const { url } = await api.post<{ url: string }>("/api/donate", { pack: p.id });
      w.openInvoice(url, (status) => {
        setBusy(null);
        if (status !== "paid") return;
        haptic.ok();
        toast(<>+{full(p.amount)} <Icon name={p.cur} size={16} /></>, "ok");
        // the currency comes by the webhook a moment later
        for (const ms of [800, 2500, 6000]) setTimeout(() => void refresh(), ms);
      });
    } catch (e) {
      setBusy(null);
      toast(e instanceof Error ? e.message : "Ошибка", "err");
    }
  };
  const box = (
    <div className="modal-back dn-back" style={{ zIndex: 85 }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Донат">
      <div className="dn-win" onClick={(e) => e.stopPropagation()}>
        <div className="dn-tabs" role="tablist">
          {DONATE_TABS.map((t) => (
            <button key={t.cur} type="button" role="tab" aria-selected={tab === t.cur} aria-label={t.name} title={t.name} className={`dn-tab ${tab === t.cur ? "on" : ""}`}
              onClick={() => { haptic.tap(); setTab(t.cur); }} style={{ backgroundImage: `url(${ART}/tab.webp${V})` }}>
              <Icon name={t.cur} size={30} />
            </button>
          ))}
        </div>
        <div className="dn-board" style={{ backgroundImage: `url(${ART}/board.webp${V})` }}>
          <button type="button" className="dn-x" onClick={onClose} aria-label="Закрыть">×</button>
          <div className="dn-grid">
            {packs.map((p) => {
              return (
                <div key={p.id} className="dn-cell" style={{ backgroundImage: `url(${ART}/cell.webp${V})` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="dn-pic" src={packPic(p)} alt="" draggable={false} />
                  <b className="dn-amount num">{full(p.amount)} <Icon name={p.cur} size={14} /></b>
                  <button type="button" className="btn gold dn-buy" disabled={!!busy} onClick={() => void buy(p)}>
                    <Star size={15} /><span className="num">{full(p.stars)}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? box : createPortal(box, document.body);
}
