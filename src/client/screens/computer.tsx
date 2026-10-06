"use client";
/* The system unit in the room: the open case with its parts (GPU, cooler, PSU). Their upgrades are coming later —
   for now each part only shows what it is. Talents are spent in the talent window (TalentWindow), not here. */
import { useState } from "react";
import { Modal } from "../ui.tsx";
import { PC_ART } from "../art/pc-data.ts";

const PARTS = [
  { id: "pc-gpu", name: "Видеокарта", description: "Больше ядер — больше урона. Главная деталь системника." },
  { id: "pc-cooler", name: "Кулер процессора", description: "Холодный процессор — горячие удары." },
  { id: "pc-psu", name: "Блок питания", description: "Стабильные вольты под нагрузкой." },
] as const;

export function ComputerWindow({ onClose }: { onClose: () => void }) {
  const [part, setPart] = useState<string | null>(null);
  const def = PARTS.find((p) => p.id === part);
  return (
    <>
      <Modal title="Компьютер" onClose={onClose}>
        <div className="pc-case" style={{ aspectRatio: PC_ART.aspect }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pc-case-img" src="/assets/pc/case.webp" alt="Системный блок" draggable={false} />
          {PARTS.map((p) => {
            const a = PC_ART.parts[p.id];
            return (
              <button key={p.id} className="pc-hot" aria-label={p.name} onClick={() => setPart(p.id)}
                style={{ left: `${a.hot.x}%`, top: `${a.hot.y}%`, width: `${a.hot.w}%`, height: `${a.hot.h}%` }}>
                <span className="pc-lv">скоро</span>
              </button>
            );
          })}
        </div>
        <div className="col" style={{ gap: 6 }}>
          {PARTS.map((p) => (
            <button key={p.id} className="pc-row" onClick={() => setPart(p.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PC_ART.parts[p.id].src} alt="" />
              <span className="grow col" style={{ gap: 2, alignItems: "flex-start", minWidth: 0 }}>
                <b>{p.name}</b>
                <span className="tiny muted">улучшения появятся позже</span>
              </span>
              <span className="boss-go display">›</span>
            </button>
          ))}
        </div>
      </Modal>
      {def && (
        <Modal title={def.name} onClose={() => setPart(null)}>
          <div className="col" style={{ gap: 10 }}>
            <div className="pc-part-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PC_ART.parts[def.id].src} alt="" draggable={false} />
            </div>
            <div className="tiny muted">{def.description}</div>
            <div className="chip" style={{ alignSelf: "center" }}>Улучшения появятся позже</div>
          </div>
        </Modal>
      )}
    </>
  );
}
