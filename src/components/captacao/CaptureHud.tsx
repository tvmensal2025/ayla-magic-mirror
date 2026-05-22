import { ClipboardList, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { CaptureProgressBar } from "./CaptureProgressBar";
import { CaptureLevelBadge } from "./CaptureLevelBadge";
import { CaptureComboIndicator } from "./CaptureComboIndicator";
import { CaptureMissionHint } from "./CaptureMissionHint";
import type { LevelTier } from "@/hooks/useCaptureGameState";
import { isSfxEnabled, setSfxEnabled } from "@/lib/captureSfx";

interface Props {
  tier: LevelTier;
  combo: number;
  xp: number;
  filled: number;
  total: number;
  progress: number;
  missionLabel: string;
  canSubmit: boolean;
}

export function CaptureHud({ tier, combo, xp, filled, total, progress, missionLabel, canSubmit }: Props) {
  const [sfx, setSfx] = useState(isSfxEnabled());
  return (
    <div className={`p-4 border-b border-border space-y-3 relative overflow-hidden ${
      canSubmit ? "bg-gradient-to-br from-primary/6 via-transparent to-amber-400/6" : "bg-card/40"
    }`}>
      {/* Top accent line when ready */}
      {canSubmit && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-foreground truncate">Ficha do Cliente</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <CaptureComboIndicator combo={combo} />
          <button
            onClick={() => { const v = !sfx; setSfx(v); setSfxEnabled(v); }}
            className="p-1 rounded hover:bg-secondary text-muted-foreground transition-colors"
            title={sfx ? "Som ativado" : "Som desativado"}
          >
            {sfx ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <CaptureLevelBadge tier={tier} />
        <div className="text-[10px] text-muted-foreground tabular-nums">
          <span className="font-bold text-foreground">{xp}</span> pts
        </div>
      </div>

      <CaptureProgressBar progress={progress} filled={filled} total={total} tier={tier} />
      <CaptureMissionHint label={missionLabel} />
    </div>
  );
}
