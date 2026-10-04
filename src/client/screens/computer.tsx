"use client";
/* The system unit in the room: the open case with its parts; each part (GPU, cooler, PSU) opens its own upgrade window.
   Parts are paid with talents, which are earned by damage within one boss fight. */
import { useState } from "react";
import { useGame } from "../store.tsx";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { PC_ART } from "../art/pc-data.ts";
import { PC_PARTS, pcPartById, pcPartCost, talentThreshold, type PcPartDef } from "../../content/home.ts";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

export function TalentChip({ n }: { n: number }) {
  return (
    <span className="chip talent-chip" title="Таланты">
      <Icon name="talent" size={18} /> <b className="num">{n}</b>
    </span>
  );
}

export function ComputerHelp() {
  return (
    <Help topic="computer" title="Компьютер и таланты">
      <p>Нажми на деталь в корпусе — откроется её окно улучшения. Каждая деталь добавляет урон любому оружию в бою с боссом.</p>
      <div className="help-nav">
        {PC_PARTS.map((p) => (
          <div key={p.id} className="help-nav-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pc-help-img" src={PC_ART.parts[p.id as keyof typeof PC_ART.parts].src} alt="" />
            <div><b>{p.name}</b><div className="small muted">+{pct(p.damagePerLevel)} урона за уровень, до {p.maxLevel} уровня.</div></div>
          </div>
        ))}
      </div>
      <b>Таланты</b>
      <div className="help-nav">
        <div className="help-nav-row">
          <Icon name="talent" size={40} />
          <div>
            <div className="small">Таланты дают за урон по боссу в одном бою: 1-й — за {talentThreshold(1)} урона, 2-й — за {talentThreshold(2)}, 3-й — за {talentThreshold(3)}, 4-й — за {talentThreshold(4)} и так далее.</div>
            <div className="small muted">Бой закончился победой, поражением или побегом — набитый урон сгорает. Не добил до следующего таланта — он не засчитается.</div>
          </div>
        </div>
      </div>
      <p className="small muted">Уровень 1 детали стоит 1 талант, уровень 2 — 2 таланта и так далее.</p>
    </Help>
  );
}

/** The open case: tap a part to upgrade it. */
export function ComputerWindow({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const [part, setPart] = useState<string | null>(null);
  if (!state) return null;
  const talents = state.player.talents ?? 0;
  const lv = (id: string) => state.home.levels[id] ?? 0;
  const pcDamage = PC_PARTS.reduce((s, p) => s + Math.min(lv(p.id), p.maxLevel) * p.damagePerLevel, 0);
  return (
    <>
      <Modal title="Компьютер" onClose={onClose}>
        <div className="pc-top">
          <TalentChip n={talents} />
          <span className="chip green">урон +{pct(pcDamage)}</span>
          <span className="grow" />
          <ComputerHelp />
        </div>
        <div className="pc-case" style={{ aspectRatio: PC_ART.aspect }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pc-case-img" src="/assets/pc/case.webp" alt="Системный блок" draggable={false} />
          {PC_PARTS.map((p) => {
            const a = PC_ART.parts[p.id as keyof typeof PC_ART.parts];
            const l = lv(p.id);
            const can = l < p.maxLevel && talents >= pcPartCost(l + 1);
            return (
              <button key={p.id} className={`pc-hot ${can ? "can" : ""}`} aria-label={p.name} onClick={() => setPart(p.id)}
                style={{ left: `${a.hot.x}%`, top: `${a.hot.y}%`, width: `${a.hot.w}%`, height: `${a.hot.h}%` }}>
                <span className="pc-lv">{l}/{p.maxLevel}</span>
              </button>
            );
          })}
        </div>
        <div className="col" style={{ gap: 6 }}>
          {PC_PARTS.map((p) => {
            const l = lv(p.id);
            const can = l < p.maxLevel && talents >= pcPartCost(l + 1);
            return (
              <button key={p.id} className="pc-row" onClick={() => setPart(p.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={PC_ART.parts[p.id as keyof typeof PC_ART.parts].src} alt="" />
                <span className="grow col" style={{ gap: 2, alignItems: "flex-start", minWidth: 0 }}>
                  <b>{p.name}</b>
                  <span className="tiny muted">ур. {l}/{p.maxLevel} · урон +{pct(l * p.damagePerLevel)}</span>
                </span>
                {can && <i className="side-dot pc-dot" />}
                <span className="boss-go display">›</span>
              </button>
            );
          })}
        </div>
      </Modal>
      {part && <PartWindow id={part} onClose={() => setPart(null)} />}
    </>
  );
}

function PartWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, act, busy } = useGame();
  const def = pcPartById(id) as PcPartDef;
  if (!state || !def) return null;
  const talents = state.player.talents ?? 0;
  const l = Math.min(state.home.levels[def.id] ?? 0, def.maxLevel);
  const max = l >= def.maxLevel;
  const cost = pcPartCost(l + 1);
  const up = async () => {
    const r = await act<{ level: number }>("pc_upgrade", { id: def.id }, (x) => `${def.name}: уровень ${x.level}`);
    if (r) haptic.ok();
  };
  return (
    <Modal title={def.name} onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        <div className="pc-part-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PC_ART.parts[def.id as keyof typeof PC_ART.parts].src} alt="" draggable={false} />
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>Уровень {l}/{def.maxLevel}</b>
          <span className="equip-lv">{Array.from({ length: def.maxLevel }, (_, i) => <i key={i} className={i < l ? "on" : ""} />)}</span>
        </div>
        <div className="tiny muted">{def.description}</div>
        <div className="pc-bonus">
          <div><span className="tiny muted">Сейчас</span><b className="num">урон +{pct(l * def.damagePerLevel)}</b></div>
          {!max && <span className="pc-arrow">→</span>}
          {!max && <div><span className="tiny muted">Уровень {l + 1}</span><b className="num" style={{ color: "var(--green)" }}>урон +{pct((l + 1) * def.damagePerLevel)}</b></div>}
        </div>
        {max ? (
          <div className="chip green" style={{ alignSelf: "center" }}>Максимальный уровень</div>
        ) : (
          <button className="btn gold block" disabled={talents < cost || busy === "pc_upgrade"} onClick={up}>
            Улучшить · <Icon name="talent" size={18} /> {cost}
          </button>
        )}
        <div className="row tiny" style={{ justifyContent: "center", gap: 6 }}>
          <span className="muted">У тебя:</span> <TalentChip n={talents} />
          {!max && talents < cost && <span style={{ color: "#ff8a9e" }}>не хватает {cost - talents}</span>}
        </div>
        <div className="tiny muted center">Таланты — за урон по боссу в одном бою: {talentThreshold(1)} урона — 1-й, {talentThreshold(2)} — 2-й, {talentThreshold(3)} — 3-й…</div>
      </div>
    </Modal>
  );
}
