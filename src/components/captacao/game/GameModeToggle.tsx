import { Gamepad2, Volume2, VolumeX } from "lucide-react";
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
          className="h-8 px-2 gap-1 border-primary/40"
          onClick={onToggleSound}
          title={sound ? "Desligar som" : "Ligar som"}
        >
          {sound ? <Volume2 className="w-3.5 h-3.5 text-primary" /> : <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />}
        </Button>
      )}
      <button
        type="button"
        onClick={onToggle}
        className={`group relative inline-flex items-center gap-2 px-3 h-9 rounded-full border transition-all overflow-hidden ${
          enabled
            ? "border-primary bg-gradient-to-r from-primary to-emerald-500 text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.45)]"
            : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
        }`}
        title={enabled ? "Sair do Modo Game" : "Ligar Modo Game"}
      >
        <Gamepad2 className={`w-4 h-4 ${enabled ? "animate-game-bounce" : ""}`} />
        <span className="text-xs font-bold tracking-wide">
          {enabled ? "MODO GAME ON" : "Modo Game"}
        </span>
        <span className={`relative inline-block w-8 h-4 rounded-full transition-colors ${enabled ? "bg-white/30" : "bg-muted"}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${enabled ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
    </div>
  );
}
