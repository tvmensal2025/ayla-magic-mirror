import { BarChart2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  enabled: boolean;
  onToggle: () => void;
  sound: boolean;
  onToggleSound: () => void;
}

export function GameModeToggle({ enabled, onToggle, sound, onToggleSound }: Props) {
  return (
    <div className="flex items-center gap-2">
      {enabled && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 gap-1 border-border/60"
          onClick={onToggleSound}
          title={sound ? "Desligar som" : "Ligar som"}
        >
          {sound ? <Volume2 className="w-3.5 h-3.5 text-primary" /> : <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />}
        </Button>
      )}
      <button
        type="button"
        onClick={onToggle}
        className={`group relative inline-flex items-center gap-2 px-3 h-9 rounded-lg border transition-all ${
          enabled
            ? "border-amber-400/50 bg-gradient-to-r from-primary/15 to-amber-400/15 text-amber-300 exec-toggle-on"
            : "border-border/60 bg-card hover:border-primary/30 hover:bg-primary/5 text-muted-foreground"
        }`}
        title={enabled ? "Desativar painel de performance" : "Ativar painel de performance"}
      >
        <BarChart2 className={`w-4 h-4 ${enabled ? "text-amber-400" : ""}`} strokeWidth={1.5} />
        <span className={`text-xs font-bold tracking-wider ${enabled ? "uppercase" : ""}`}>
          {enabled ? "Performance ON" : "Performance"}
        </span>
        <span className={`relative inline-block w-8 h-4 rounded-full transition-colors ${enabled ? "bg-amber-400/40" : "bg-muted"}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${enabled ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>

    </div>
  );
}
