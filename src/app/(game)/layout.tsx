"use client";
import { GameProvider } from "../../client/store.tsx";
import { Shell } from "../../client/shell.tsx";

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <GameProvider>
      <Shell>{children}</Shell>
    </GameProvider>
  );
}
