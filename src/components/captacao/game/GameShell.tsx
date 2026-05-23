import { ReactNode } from "react";

interface Props { children: ReactNode; }

export function GameShell({ children }: Props) {
  return (
    <div className="relative exec-ambient flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Subtle ambient top glow — executive war room feel */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        <div
          className="absolute top-0 left-1/4 right-1/4 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, hsl(45 85% 52% / 0.3), transparent)",
          }}
        />
      </div>
      <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}
