import { TrendingUp } from "lucide-react";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: "primary" | "accent";
  subtitle?: string;
}

export function StatCard({ icon, label, value, color, subtitle }: StatCardProps) {
  const gradientClass = color === "primary"
    ? "from-primary/15 to-primary/5 dark:from-primary/20 dark:to-primary/5"
    : "from-accent/15 to-accent/5 dark:from-accent/20 dark:to-accent/5";
  const iconBg = color === "primary"
    ? "bg-primary/10 text-primary ring-1 ring-primary/20"
    : "bg-accent/10 text-accent ring-1 ring-accent/20";
  const glowClass = color === "primary"
    ? "group-hover:shadow-[0_0_30px_hsl(130,100%,36%,0.08)]"
    : "group-hover:shadow-[0_0_30px_hsl(30,100%,50%,0.08)]";

  return (
    <div className={`group relative rounded-2xl border border-border bg-card p-3 sm:p-5 flex items-center gap-2.5 sm:gap-4 
      transition-all duration-300 hover:border-primary/20 overflow-hidden ${glowClass}`}>
      {/* Subtle gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradientClass} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      <div className={`relative w-9 h-9 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg} transition-transform duration-300 group-hover:scale-110 [&>svg]:w-4 [&>svg]:h-4 sm:[&>svg]:w-5 sm:[&>svg]:h-5`}>
        {icon}
      </div>
      <div className="relative min-w-0 flex-1">
        <p
          className="text-base sm:text-2xl font-bold font-heading text-foreground truncate tracking-tight"
          title={typeof value === "number" ? value.toLocaleString("pt-BR") : String(value)}
        >
          {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
        </p>
        <p className="text-[10px] sm:text-xs text-muted-foreground font-medium leading-tight">{label}</p>
        {subtitle && <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">{subtitle}</p>}
      </div>
    </div>
  );
}
