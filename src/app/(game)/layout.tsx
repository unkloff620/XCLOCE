"use client";
import { useEffect } from "react";
import { GameProvider } from "../../client/store.tsx";
import { Shell } from "../../client/shell.tsx";
import { openedForAdmin } from "../../client/telegram.ts";

export default function GameLayout({ children }: { children: React.ReactNode }) {
  // the admin's «Открыть в Telegram» opens the bot's Mini App with start_param=admin: go straight to the panel
  useEffect(() => {
    if (openedForAdmin()) location.replace("/admin");
  }, []);
  return (
    <GameProvider>
      <Shell>{children}</Shell>
    </GameProvider>
  );
}
