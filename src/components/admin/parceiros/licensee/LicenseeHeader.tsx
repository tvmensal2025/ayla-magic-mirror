import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Check,
  Copy,
  ExternalLink,
  Phone,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { LicenseeStats } from "../hooks/useLicenseeStats";

interface Props {
  name: string;
  phone: string;
  igreenId: string;
  slug: string;
  stats: LicenseeStats;
}

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const noCountry = digits.startsWith("55") ? digits.slice(2) : digits;
  if (noCountry.length === 11) {
    return `+55 (${noCountry.slice(0, 2)}) ${noCountry.slice(2, 7)}-${noCountry.slice(7)}`;
  }
  if (noCountry.length === 10) {
    return `+55 (${noCountry.slice(0, 2)}) ${noCountry.slice(2, 6)}-${noCountry.slice(6)}`;
  }
  return phone || "";
}

export function LicenseeHeader({ name, phone, igreenId, slug, stats }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const lpUrl =
    slug && slug !== "sua-licenca"
      ? `https://igreen.cloud/${slug}`
      : "";

  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleCopy = async () => {
    if (!lpUrl) {
      toast({
        title: "Defina seu slug de licença em Dados",
        variant: "destructive",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(lpUrl);
      setCopied(true);
      toast({ title: "Link da sua LP copiado!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const trendPositive = stats.trend >= 0;

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/[0.03] to-transparent" />
      <div className="relative p-4 sm:p-5 flex flex-col lg:flex-row gap-5 lg:items-center lg:justify-between">
        {/* Identidade */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-primary/15 text-primary flex items-center justify-center text-lg font-bold ring-1 ring-primary/30">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-heading font-bold tracking-tight truncate">
                {name || "Licenciado"}
              </h2>
              <Badge className="gap-1 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
                <BadgeCheck className="h-3 w-3" /> Você
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {igreenId && (
                <span className="font-mono">ID iGreen {igreenId}</span>
              )}
              {phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {formatPhoneDisplay(phone)}
                </span>
              )}
            </div>
            {lpUrl && (
              <p className="text-[11px] text-muted-foreground font-mono mt-1 truncate">
                {lpUrl}
              </p>
            )}
          </div>
        </div>

        {/* KPIs do licenciado */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[420px]">
          <Kpi
            label="Leads (30d)"
            value={stats.leads30d}
            trend={
              <span
                className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                  trendPositive ? "text-emerald-500" : "text-destructive"
                }`}
              >
                {trendPositive ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                {Math.abs(stats.trend)}%
              </span>
            }
          />
          <Kpi label="Conversão" value={`${stats.conversion}%`} />
          <Kpi
            label="Parceiros"
            value={stats.activePartners}
            icon={<Users className="h-3 w-3" />}
          />
        </div>

        {/* Ações */}
        <div className="flex gap-2 lg:flex-col lg:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleCopy}
            disabled={!lpUrl}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Copiar LP
          </Button>
          {lpUrl && (
            <Button asChild size="sm" className="gap-1.5">
              <a href={lpUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </a>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Kpi({
  label,
  value,
  trend,
  icon,
}: {
  label: string;
  value: string | number;
  trend?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 backdrop-blur px-3 py-2">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
          {icon}
          {label}
        </p>
        {trend}
      </div>
      <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
    </div>
  );
}
