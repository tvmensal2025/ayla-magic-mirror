

interface Props { progress: number; filled: number; total: number; }

export function CaptureProgressBar({ progress, filled, total }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-muted-foreground tracking-wide uppercase">XP do Lead</span>
        <span className="font-bold text-primary tabular-nums">{filled}/{total}</span>
      </div>
      <div className="relative h-3 rounded-full bg-secondary overflow-hidden border border-border">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 via-green-500 to-lime-400"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        />
        {progress === 100 && (
          <div className="absolute inset-0 animate-pulse bg-white/20 mix-blend-overlay" />
        )}
      </div>
    </div>
  );
}
