"use client";
import { invQty, liveEnergy, useGame, useNow } from "../store.tsx";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { clock, money } from "../format.ts";
import { haptic } from "../telegram.ts";
import { ENERGY_DRINKS_MAX, ENERGY_REFILL } from "../../content/items.ts";

/**
 * Opened from the energy chip in the HUD (the user 2026-11-22: the only energy drink is the blue one, at most 20 in the bag,
 * bought only here): the energy, the drinks «N / 20 шт.», «Выпить» one (energy to the limit) and «Пополнить» them all
 * back to 20 for ENERGY_REFILL.
 */
export function EnergyWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const now = useNow();
  if (!state) return null;
  const e = liveEnergy(state, now);
  const have = invQty(state, "energy-drink");
  const full = e.energy >= state.player.energyMax;
  const canPay = (state.wallet[ENERGY_REFILL.currency] ?? 0) >= ENERGY_REFILL.amount;
  return (
    <Modal title="Энергия" onClose={onClose}>
      <div className="col" style={{ gap: 12 }}>
        <div className="energy-head">
          <Icon name="energy" size={44} />
          <div>
            <div className="display" style={{ fontSize: 26 }}>
              {e.energy}<span className="muted" style={{ fontSize: 16 }}> / {state.player.energyMax}</span>
            </div>
            <div className="tiny muted">
              {e.nextIn > 0 ? <>+1 через {clock(e.nextIn)}</> : e.energy > state.player.energyMax ? "Сверх лимита" : "Полная"}
            </div>
          </div>
        </div>
        <div className="energy-drinks">
          <ItemArt id="energy-drink" size={84} />
          <b className="display energy-drinks-n">У тебя {have} / {ENERGY_DRINKS_MAX} шт.</b>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn green grow" disabled={have < 1 || full || busy === "use"}
            onClick={() => { haptic.tap(); void act("use", { itemId: "energy-drink" }, "Энергия до полной"); }}>
            <ItemArt id="energy-drink" size={20} /> Выпить
          </button>
          <button className="btn gold grow" disabled={have >= ENERGY_DRINKS_MAX || !canPay || busy === "energy_refill"}
            onClick={() => { haptic.tap(); void act("energy_refill", {}, `Энергетиков ${ENERGY_DRINKS_MAX} / ${ENERGY_DRINKS_MAX}`); }}>
            <Icon name={ENERGY_REFILL.currency} size={18} />{money(ENERGY_REFILL.currency, ENERGY_REFILL.amount)} Пополнить
          </button>
        </div>
      </div>
    </Modal>
  );
}
