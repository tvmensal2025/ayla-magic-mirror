import { ReactNode } from "react";

interface Props { children: ReactNode; }

export function GameShell({ children }: Props) {
  return (
    <div className="relative game-shell">
      {/* Animated aurora bg */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        <div className="absolute -inset-[20%] game-aurora opacity-60" />
        <div className="absolute inset-0 game-stars opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
