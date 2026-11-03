"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MAINT_EVENT, maintenanceText, reloadFresh } from "./api.ts";

/**
 * «Технические работы» (switched on in the admin panel): any answer of the server says the game is closed — a screen over
 * everything shows the admin's text; «Проверить» reloads the page (the admins themselves are let in by the server).
 */
export function MaintenanceGate() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const on = () => setText(maintenanceText());
    window.addEventListener(MAINT_EVENT, on);
    on();
    return () => window.removeEventListener(MAINT_EVENT, on);
  }, []);
  if (!text) return null;
  return createPortal(
    <div className="update-gate" role="alertdialog" aria-modal="true" aria-labelledby="maint-title">
      <div className="update-card">
        <div className="update-icon" aria-hidden="true">🛠</div>
        <b id="maint-title" className="display update-title">Технические работы</b>
        <p className="update-text">{text}</p>
        <button className="btn gold block" onClick={reloadFresh}>Проверить</button>
      </div>
    </div>,
    document.body,
  );
}
