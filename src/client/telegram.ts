"use client";
/* Thin wrapper over window.Telegram.WebApp (present only inside Telegram). */

interface TgWebApp {
  initData: string;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  HapticFeedback?: { impactOccurred(s: "light" | "medium" | "heavy" | "rigid" | "soft"): void; notificationOccurred(t: "error" | "success" | "warning"): void };
  BackButton?: { show(): void; hide(): void; onClick(f: () => void): void; offClick(f: () => void): void };
}

export function tg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  const w = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return w && w.initData ? w : null;
}

export function initTelegram() {
  const w = tg();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    w.disableVerticalSwipes?.();
    w.setHeaderColor?.("#0c0e1c");
    w.setBackgroundColor?.("#0c0e1c");
  } catch {
    /* older clients */
  }
}

export const haptic = {
  tap: () => tg()?.HapticFeedback?.impactOccurred("light"),
  hit: () => tg()?.HapticFeedback?.impactOccurred("medium"),
  ok: () => tg()?.HapticFeedback?.notificationOccurred("success"),
  err: () => tg()?.HapticFeedback?.notificationOccurred("error"),
};

/** Shows Telegram's back button while `on`; returns a cleanup. */
export function telegramBack(on: boolean, go: () => void) {
  const b = tg()?.BackButton;
  if (!b) return () => undefined;
  if (on) {
    b.show();
    b.onClick(go);
  } else b.hide();
  return () => {
    b.offClick(go);
  };
}
