import { Sparkles, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { CaptureProgressBar } from "./CaptureProgressBar";
import { CaptureLevelBadge } from "./CaptureLevelBadge";
import { CaptureComboIndicator } from "./CaptureComboIndicator";
import { CaptureMissionHint } from "./CaptureMissionHint";
import type { LevelTier } from "@/hooks/useCaptureGameState";
import { isSfxEnabled, setSfxEnabled } from "@/lib/captureSfx";
import { Button } from "@/components/ui/button";

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
      canSubmit ? "bg-gradient-to-br from-amber-400/10 via-emerald-500/10 to-amber-400/10 animate-shimmer-gold" : "bg-card/50"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <h3 className="text-sm font-bold truncate">Ficha do Lead</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <CaptureComboIndicator combo={combo} />
          <button
            onClick={() => { const v = !sfx; setSfx(v); setSfxEnabled(v); }}
            className="p-1 rounded hover:bg-secondary text-muted-foreground"
            title={sfx ? "Som ON" : "Som OFF"}
          >
            {sfx ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <CaptureLevelBadge tier={tier} />
        <div className="text-[10px] text-muted-foreground tabular-nums">
          XP <span className="font-bold text-foreground">{xp}</span>
        </div>
      </div>

      <CaptureProgressBar progress={progress} filled={filled} total={total} />
      <CaptureMissionHint label={missionLabel} />
    </div>
  );
}
