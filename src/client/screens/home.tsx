"use client";
import Link from "next/link";
import { useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Character } from "../art/character.tsx";
import { RoomScene } from "../art/scenes.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Bar, Modal } from "../ui.tsx";
import { bossById, BOSSES } from "../../content/bosses.ts";
import { ITEMS, WEARABLE_SLOTS, type Slot } from "../../content/items.ts";
import { clock, full } from "../format.ts";
import { BossPhoto } from "./boss-parts.tsx";

const SLOT_NAME: Record<Slot, string> = { BODY: "Тело", PANTS: "Штаны", SHIRT: "Верх", SHOES: "Обувь", HEAD: "Голова", ACCESSORY: "Аксессуар", SPECIAL: "Особое" };

function Wardrobe({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  if (!state) return null;
  const owned = new Set(state.inventory.map((i) => i.id));
  const eq = state.look.equipped;
  return (
    <Modal title="Гардероб" onClose={onClose} wide>
      <div className="wardrobe">
        <div className="wardrobe-preview"><Character equipped={eq} size={260} /></div>
        <div className="col grow" style={{ gap: 10 }}>
          {WEARABLE_SLOTS.filter((s) => s !== "SPECIAL").map((slot) => {
            const items = ITEMS.filter((i) => i.slot === slot && owned.has(i.id));
            return (
              <div key={slot}>
                <div className="tiny muted" style={{ marginBottom: 4 }}>{SLOT_NAME[slot].toUpperCase()}</div>
                <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                  {items.length === 0 && <span className="tiny dim">пока пусто</span>}
                  {items.map((i) => {
                    const on = eq[slot] === i.id;
                    return (
                      <button key={i.id} className={`wear-pick rar-${i.rarity} ${on ? "on" : ""}`} disabled={!!busy} title={i.name}
                        onClick={() => act(on ? "unequip" : "equip", on ? { slot } : { itemId: i.id })}>
                        <ItemArt id={i.id} size={34} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="tiny muted" style={{ margin: 0 }}>Новая одежда — в наградах локаций и в магазине. Скоро: смена комнаты и декор.</p>
        </div>
      </div>
    </Modal>
  );
}

export function HomeScreen() {
  const { state } = useGame();
  const now = useNow();
  const [wardrobe, setWardrobe] = useState(false);
  if (!state) return null;
  const f = state.fight;
  const fb = f ? bossById(f.bossId)! : null;
  return (
    <div className="col" style={{ gap: 12 }}>
      {f && fb ? (
        <Link href={`/bosses/${fb.id}`} className="fight-banner" style={{ ["--acc" as string]: fb.theme.accent }}>
          <div style={{ width: 64, height: 64, flex: "none" }}><BossPhoto boss={fb} round /></div>
          <div className="grow col" style={{ gap: 4 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b className="display">БОЙ: {fb.name}</b>
              <span className="chip gold"><Icon name="clock" size={14} />{clock(f.endsAt - now)}</span>
            </div>
            <Bar value={f.hp} max={f.hpMax} tone="red" label={`${full(f.hp)} / ${full(f.hpMax)} HP`} />
          </div>
        </Link>
      ) : (
        <Link href="/bosses" className="fight-banner idle">
          <div style={{ width: 64, height: 64, flex: "none" }}><BossPhoto boss={BOSSES[0]} round /></div>
          <div className="grow">
            <b className="display">Боссы ждут</b>
            <div className="small muted">Начни бой — 8 часов, урон общий со всеми</div>
          </div>
          <span className="btn red sm">В бой</span>
        </Link>
      )}

      <div className="room">
        <RoomScene room={state.look.room} />
        <div className="room-char"><Character equipped={state.look.equipped} size={300} className="idle" /></div>
        <button className="room-wardrobe btn sm violet" onClick={() => setWardrobe(true)}><Icon name="shirt" size={18} /> Гардероб</button>
      </div>

      <div className="home-grid">
        <Link href="/locations" className="home-btn" style={{ ["--c" as string]: "#3ddc84" }}>
          <Icon name="map" size={40} />
          <b className="display">Локации</b>
          <span className="tiny muted">энергия → награды</span>
        </Link>
        <Link href="/shop" className="home-btn" style={{ ["--c" as string]: "#ff4d6d" }}>
          <Icon name="shop" size={40} />
          <b className="display">Магазин</b>
          <span className="tiny muted">оружие и энергия</span>
        </Link>
        <Link href="/shop?tab=exchange" className="home-btn" style={{ ["--c" as string]: "#3fd2ff" }}>
          <Icon name="exchange" size={40} />
          <b className="display">Обменник</b>
          <span className="tiny muted">RUB ⇄ USD ⇄ SOL ⇄ BTC</span>
        </Link>
        <Link href="/yard" className="home-btn" style={{ ["--c" as string]: "#ffcc33" }}>
          <Icon name="coins" size={40} />
          <b className="display">Двор</b>
          <span className="tiny muted">{state.yard.count}/{state.yard.max} предметов</span>
        </Link>
      </div>
      {wardrobe && <Wardrobe onClose={() => setWardrobe(false)} />}
    </div>
  );
}
