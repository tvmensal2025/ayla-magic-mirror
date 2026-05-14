import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Copy, Power, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

interface DownInstance {
  id: string;
  consultantName: string;
  license: string | null;
  phone: string | null;
  instanceName: string;
  status: string;
  lastSeen: string | null;
}

interface Health {
  pausedGlobal: number;
  instancesNeedReconnect: number;
  errors24h: number;
  decisions24h: number;
  transitions24h: number;
  downInstances: DownInstance[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "sem checagem";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function SystemHealthPanel() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [unpausing, setUnpausing] = useState(false);

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [paused, needReconnect, errors, decisions, trans] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true })
        .eq("bot_paused", true).eq("bot_paused_reason", "manual_global_pause"),
      supabase.from("whatsapp_instances" as any).select("id", { count: "exact", head: true })
        .eq("status", "needs_reconnect"),
      supabase.from("customers").select("id", { count: "exact", head: true })
        .not("error_message", "is", null).gte("updated_at", since),
      supabase.from("ai_decisions" as any).select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabase.from("bot_step_transitions" as any).select("id", { count: "exact", head: true })
        .gte("created_at", since),
    ]);
    setData({
      pausedGlobal: paused.count ?? 0,
      instancesNeedReconnect: needReconnect.count ?? 0,
      errors24h: errors.count ?? 0,
      decisions24h: decisions.count ?? 0,
      transitions24h: trans.count ?? 0,
    });
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  async function unpauseGlobal() {
    if (!confirm(`Religar bot para ${data?.pausedGlobal ?? 0} conversas pausadas globalmente?`)) return;
    setUnpausing(true);
    const { data: affected, error } = await supabase.rpc("admin_unpause_global_bot" as any);
    setUnpausing(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`✅ ${affected} conversas religadas`);
    load();
  }

  if (!data) return null;

  const ok = data.decisions24h > 0 || data.transitions24h > 0;
  const evolutionDown = data.instancesNeedReconnect > 0;
  const globalPaused = data.pausedGlobal > 0;

  return (
    <Card className="p-5 mb-4 bg-card/50 border-border/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Saúde do sistema</h3>
          {ok && !evolutionDown && !globalPaused ? (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/40">🟢 Operacional</Badge>
          ) : (
            <Badge className="bg-red-500/20 text-red-400 border-red-500/40">🔴 Atenção</Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Metric label="Decisões IA / 24h" value={data.decisions24h} good={data.decisions24h > 0} />
        <Metric label="Transições / 24h" value={data.transitions24h} good={data.transitions24h > 0} />
        <Metric label="Erros / 24h" value={data.errors24h} good={data.errors24h === 0} />
        <Metric label="Inst. derrubadas" value={data.instancesNeedReconnect} good={data.instancesNeedReconnect === 0} icon={evolutionDown ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />} />
        <Metric label="Pausa global" value={data.pausedGlobal} good={data.pausedGlobal === 0} />
      </div>

      {globalPaused && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span><strong>{data.pausedGlobal}</strong> conversas estão com bot DESLIGADO (pausa manual global).</span>
          </div>
          <Button size="sm" onClick={unpauseGlobal} disabled={unpausing} className="gap-1">
            <Power className="w-3.5 h-3.5" />
            {unpausing ? "Religando..." : "Religar bot global"}
          </Button>
        </div>
      )}

      {evolutionDown && (
        <div className="flex items-center gap-2 p-3 mt-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm">
          <WifiOff className="w-4 h-4 text-red-400" />
          <span>{data.instancesNeedReconnect} instância(s) Evolution caída(s). Reabrir QR no painel Evolution.</span>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, good, icon }: { label: string; value: number; good: boolean; icon?: React.ReactNode }) {
  return (
    <div className={`p-3 rounded-lg border ${good ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${good ? "text-green-400" : "text-red-400"}`}>{value}</div>
    </div>
  );
}
