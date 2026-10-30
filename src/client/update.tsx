"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { UPDATE_EVENT, checkVersion, isOutdated, reloadFresh } from "./api.ts";

/*
 * A new release is out (the server's version differs from this page's, src/version.ts): a screen over everything
 * says so and blocks the game until the page is reloaded — old code must not keep sending actions to the new server.
 * Learned from any API answer, and from /api/version once a minute and whenever the app comes back to the front.
 */
const POLL_MS = 60_000;

export function UpdateGate() {
  const [due, setDue] = useState(false);
  useEffect(() => {
    const on = () => setDue(true);
    window.addEventListener(UPDATE_EVENT, on);
    if (isOutdated()) setDue(true);
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/version", { cache: "no-store" }).then((r) => checkVersion(r.headers.get("x-app-version"))).catch(() => undefined);
    };
    const t = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.removeEventListener(UPDATE_EVENT, on);
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);
  if (!due) return null;
  return createPortal(
    <div className="update-gate" role="alertdialog" aria-modal="true" aria-labelledby="update-title">
      <div className="update-card">
        <div className="update-icon" aria-hidden="true">⟳</div>
        <b id="update-title" className="display update-title">Вышло обновление!</b>
        <p className="update-text">Игра обновилась. Обнови страницу, чтобы продолжить — до этого действия недоступны.</p>
        <button className="btn gold block" onClick={reloadFresh}>Обновить</button>
      </div>
    </div>,
    document.body,
  );
}
