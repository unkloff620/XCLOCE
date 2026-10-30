"use client";
/*
 * The exchange kiosk in the yard, drawn in the artist's layers (public/assets/yard/kiosk, tools/yard/kiosk/build.py),
 * every layer on the same box so they stack. Open (the exchanger works today): the dealer inside smokes — the hand goes
 * to the mouth and away, smoke rises from the cigarette, a puff from the mouth when the hand goes away — and taps the
 * counter with his fist now and then. Closed: nobody inside, the shutters are shut and knock in the wind.
 * Night: the same, darker, the window glowing warm.
 */
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
