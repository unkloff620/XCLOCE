"use client";
/*
 * The exchange kiosk in the yard, drawn in the artist's layers (public/assets/yard/kiosk, tools/yard/kiosk/build.py),
 * every layer on the same box so they stack. Open (the exchanger works today): the dealer inside smokes — the hand goes
 * to the mouth and away, smoke rises from the cigarette, a puff from the mouth when the hand goes away — and taps the
 * counter with his fist now and then. Closed: nobody inside, the shutters are shut and knock in the wind.
 * Night: the same, darker, the window glowing warm.
 */
import { DEALER_BOX } from "./exchange-data.ts";

const K = "/assets/yard/kiosk";

export function KioskArt({ open, night }: { open: boolean; night: boolean }) {
  return (
    <span className={`kz ${open ? "open" : "shut"} ${night ? "night" : ""}`} aria-hidden="true">
      {/* eslint-disable @next/next/no-img-element */}
      <img className="kz-l kz-inside" src={`${K}/inside.webp`} alt="" draggable={false} />
      {/* at night the lamp inside throws a warm light out of the window (behind the dealer) */}
      {night && open && <i className="kz-glow" />}
      {open && (
        <>
          <img className="kz-l kz-man kz-torso" src={`${K}/torso.webp`} alt="" draggable={false} />
          <img className="kz-l kz-man kz-head" src={`${K}/head.webp`} alt="" draggable={false} />
        </>
      )}
      <img className="kz-l kz-shell" src={`${K}/kiosk.webp`} alt="" draggable={false} />
      {open ? (
        <>
          <img className="kz-l kz-man" src={`${K}/forearm.webp`} alt="" draggable={false} />
          <img className="kz-l kz-man kz-fist" src={`${K}/fist.webp`} alt="" draggable={false} />
          {/* the smoking hand: the cigarette's smoke goes with it */}
          <span className="kz-l kz-arm">
            <img className="kz-l kz-man" src={`${K}/arm-smoke.webp`} alt="" draggable={false} />
            <i className="kz-tip"><b /><b /><b /><b /></i>
          </span>
          {/* the puff from the mouth when the hand goes away */}
          <i className="kz-puff"><b /><b /><b /></i>
        </>
      ) : (
        <>
          <img className="kz-l kz-shell kz-sh l" src={`${K}/shutter-l.webp`} alt="" draggable={false} />
          <img className="kz-l kz-shell kz-sh r" src={`${K}/shutter-r.webp`} alt="" draggable={false} />
        </>
      )}
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}

/**
 * The same dealer without his kiosk: behind the table in the exchanger's garage (screens/exchange.tsx) — smokes, taps the table.
 * Two parts on the same box so the table goes between them: "back" — the body and the head (behind the table),
 * "front" — the arms lying on the table, the smoking hand, the smoke. Drawn big there, so the parts are the sharp
 * upscaled ones (public/assets/exchange/dealer-*.webp), each cut to its own box inside a full-box layer — the kiosk's
 * animations (transform origins on the whole box) work the same.
 */
function Part({ id, className }: { id: string; className?: string }) {
  const [l, t, w, h] = DEALER_BOX[id];
  return (
    <span className={`kz-l kz-man ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="kz-crop" src={`/assets/exchange/dealer-${id}.webp`} alt="" draggable={false} style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` }} />
    </span>
  );
}
export function KioskDealer({ part }: { part: "back" | "front" }) {
  return (
    <span className="kz open" aria-hidden="true">
      {part === "back" ? (
        <>
          <Part id="torso" className="kz-torso" />
          <Part id="head" className="kz-head" />
        </>
      ) : (
        <>
          <Part id="forearm" />
          <Part id="fist" className="kz-fist" />
          <span className="kz-l kz-arm">
            <Part id="arm-smoke" />
            <i className="kz-tip"><b /><b /><b /><b /></i>
          </span>
          <i className="kz-puff"><b /><b /><b /></i>
        </>
      )}
    </span>
  );
}
