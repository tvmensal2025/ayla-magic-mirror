import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bot, User, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Row = {
  id: string;
  name: string | null;
  phone_whatsapp: string;
  conversation_step: string | null;
  bot_paused: boolean;
  bot_paused_reason: string | null;
  assigned_human_id: string | null;
  last_bot_reply_at: string | null;
  updated_at: string;
};

export function LiveConversationsPanel({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone_whatsapp, conversation_step, bot_paused, bot_paused_reason, assigned_human_id, last_bot_reply_at, updated_at")
      .eq("consultant_id", userId)
      .order("updated_at", { ascending: false })
      .limit(80);
    setRows((data as any) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("ai-live-customers")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customers", filter: `consultant_id=eq.${userId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  async function setPaused(id: string, paused: boolean) {
    const { error } = await supabase.from("customers").update({
      bot_paused: paused,
      bot_paused_reason: paused ? "humano_assumiu" : null,
      bot_paused_at: paused ? new Date().toISOString() : null,
      assigned_human_id: paused ? userId : null,
    }).eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: paused ? "🤝 Você assumiu este atendimento" : "🤖 IA reativada" });
      load();
    }
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const active = rows.filter((r) => !r.bot_paused);
  const human = rows.filter((r) => r.bot_paused);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{active.length} com IA · {human.length} com humano</p>
        <Button size="sm" variant="ghost" onClick={load} className="gap-2"><RefreshCw className="w-4 h-4" /> Atualizar</Button>
      </div>

      <Section title="🤖 IA atendendo" rows={active} action={(r) => (
        <Button size="sm" variant="outline" onClick={() => setPaused(r.id, true)} className="gap-2">
          <Pause className="w-4 h-4" /> Assumir
        </Button>
      )} />

      <Section title="👤 Você está atendendo" rows={human} action={(r) => (
        <Button size="sm" variant="default" onClick={() => setPaused(r.id, false)} className="gap-2">
          <Play className="w-4 h-4" /> Devolver para IA
        </Button>
      )} />
    </div>
  );
}

function Section({ title, rows, action }: { title: string; rows: Row[]; action: (r: Row) => React.ReactNode }) {
  if (!rows.length) return (
    <div>
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">Nenhum no momento.</p>
    </div>
  );
  return (
    <div>
      <h3 className="font-semibold text-foreground mb-2">{title} ({rows.length})</h3>
      <div className="grid gap-2">
        {rows.map((r) => (
          <Card key={r.id} className="p-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <p className="font-medium text-foreground text-sm">{r.name || r.phone_whatsapp}</p>
              <p className="text-xs text-muted-foreground">{r.phone_whatsapp}</p>
            </div>
            <Badge variant="secondary" className="text-xs">{r.conversation_step || "—"}</Badge>
            {r.bot_paused_reason && <Badge variant="outline" className="text-xs">{r.bot_paused_reason}</Badge>}
            <span className="text-xs text-muted-foreground">
              {r.last_bot_reply_at ? formatDistanceToNow(new Date(r.last_bot_reply_at), { addSuffix: true, locale: ptBR }) : "—"}
            </span>
            {action(r)}
          </Card>
        ))}
      </div>
    </div>
  );
}