import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pause, Play, RefreshCw, ChevronDown, RotateCcw, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { resetLeadConversation } from "@/services/resetConversation";
import { ManualStepDialog } from "./ManualStepDialog";

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

type FlowStep = {
  id: string;
  step_key: string | null;
  step_type: string;
  title: string | null;
  position: number;
};

const LEGACY_STEPS: { value: string; label: string }[] = [
  { value: "aguardando_valor_conta", label: "Aguardando valor da conta" },
  { value: "aguardando_conta", label: "Aguardando foto da conta" },
  { value: "aguardando_doc_auto", label: "Aguardando documento" },
  { value: "confirmando_dados_conta", label: "Confirmar dados da conta" },
  { value: "ask_email", label: "Pedir e-mail" },
  { value: "ask_phone_confirm", label: "Confirmar telefone" },
  { value: "finalizando", label: "Finalizando cadastro" },
];

export function LiveConversationsPanel({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([]);
  const [confirmReset, setConfirmReset] = useState<Row | null>(null);
  const [manualStepFor, setManualStepFor] = useState<Row | null>(null);

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

  async function loadFlowSteps() {
    const { data: flow } = await supabase
      .from("bot_flows")
      .select("id")
      .eq("consultant_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (!flow?.id) { setFlowSteps([]); return; }
    const { data: steps } = await supabase
      .from("bot_flow_steps")
      .select("id, step_key, step_type, title, position")
      .eq("flow_id", flow.id)
      .eq("is_active", true)
      .order("position", { ascending: true });
    setFlowSteps((steps as any) || []);
  }

  useEffect(() => { load(); loadFlowSteps(); }, [userId]);

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

  async function returnToStep(row: Row, stepValue: string | null, label: string) {
    const update: any = {
      bot_paused: false,
      bot_paused_reason: null,
      bot_paused_at: null,
      assigned_human_id: null,
      last_custom_prompt_at: null,
      updated_at: new Date().toISOString(),
    };
    if (stepValue !== null) update.conversation_step = stepValue;
    const { error } = await supabase.from("customers").update(update).eq("id", row.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: `↩️ Devolvido para: ${label}` });
      load();
    }
  }

  async function doReset(row: Row) {
    const res = await resetLeadConversation({ consultantId: userId, customerId: row.id });
    if (!res.ok) toast({ title: "Erro ao resetar", description: (res as any).error, variant: "destructive" });
    else { toast({ title: "🔄 Conversa reiniciada" }); load(); }
    setConfirmReset(null);
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const active = rows.filter((r) => !r.bot_paused);
  const human = rows.filter((r) => r.bot_paused);

  const renderReturnMenu = (r: Row) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="default" className="gap-1.5">
          <Play className="w-4 h-4" /> Devolver para… <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-[420px] overflow-y-auto">
        <DropdownMenuItem onClick={() => returnToStep(r, null, "Continuar de onde parou")}>
          <Play className="w-4 h-4 mr-2 text-primary" /> Continuar de onde parou
        </DropdownMenuItem>
        {flowSteps.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
              Pular para passo do fluxo
            </DropdownMenuLabel>
            {flowSteps.map((s, i) => (
              <DropdownMenuItem key={s.id} onClick={() => returnToStep(r, s.id, s.title || s.step_key || `Passo ${i + 1}`)}>
                <span className="text-xs font-mono text-muted-foreground mr-2 w-6">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate">{s.title || s.step_key || `Passo ${i + 1}`}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Passos clássicos
        </DropdownMenuLabel>
        {LEGACY_STEPS.map((s) => (
          <DropdownMenuItem key={s.value} onClick={() => returnToStep(r, s.value, s.label)}>
            <span className="truncate">{s.label}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setConfirmReset(r)}
          className="text-rose-500 focus:text-rose-500"
        >
          <RotateCcw className="w-4 h-4 mr-2" /> Reiniciar conversa do zero
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

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

      <Section title="👤 Você está atendendo" rows={human} action={renderReturnMenu} />

      <AlertDialog open={!!confirmReset} onOpenChange={(o) => !o && setConfirmReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reiniciar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga o histórico, memória e decisões da IA para <strong>{confirmReset?.name || confirmReset?.phone_whatsapp}</strong>. O lead volta para o início do fluxo. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmReset && doReset(confirmReset)}>
              Reiniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
