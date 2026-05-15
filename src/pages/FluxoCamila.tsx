import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, MessageSquare, Video, ArrowDown, Sparkles, UserCheck, FileText,
  ChevronUp, ChevronDown, Plus, Trash2, FlaskConical, X, Target, Database, Bot, HelpCircle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import StepMediaPanel from "@/components/admin/fluxo/StepMediaPanel";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type IconKey = "msg" | "video" | "sparkle" | "user" | "file";

type Transition = {
  trigger_intent: string;            // 'afirmacao' | 'negacao' | 'tem_duvida' | 'ja_assistiu_video' | 'quer_cadastrar' | 'valor_brl' | 'nome_proprio' | 'telefone_br' | 'cpf_br' | 'palavra_chave' | string custom
  trigger_phrases: string[];
  goto_step_id: string | null;       // id de outro passo
  goto_special: "cadastro" | "humano" | "repeat" | null;
};

type CaptureField = "name" | "electricity_bill_value" | "phone_whatsapp" | "cpf";

type Capture = {
  field: CaptureField;
  enabled: boolean;
};

type FallbackMode = "repeat" | "goto" | "ai";

type Fallback = {
  mode: FallbackMode;
  goto_step_id?: string | null;
  ai_prompt?: string;
};

type Step = {
  id: string;
  flow_id: string;
  position: number;
  step_type: string;
  step_key: string | null;
  title: string;
  summary: string | null;
  icon: IconKey;
  message_text: string | null;
  slot_key: string | null;
  transitions: Transition[];
  captures: Capture[];
  fallback: Fallback;
  is_active: boolean;
};

const INTENT_OPTIONS: { value: string; label: string }[] = [
  { value: "afirmacao", label: "Disse SIM / quero / vamos" },
  { value: "negacao", label: "Disse NÃO / depois" },
  { value: "tem_duvida", label: "Tem dúvida / pergunta" },
  { value: "ja_assistiu_video", label: "Disse que já assistiu" },
  { value: "quer_cadastrar", label: "Quer cadastrar agora" },
  { value: "valor_brl", label: "Mandou valor da conta (R$)" },
  { value: "nome_proprio", label: "Mandou o nome" },
  { value: "telefone_br", label: "Mandou telefone" },
  { value: "cpf_br", label: "Mandou CPF" },
  { value: "palavra_chave", label: "Palavra específica (use o campo abaixo)" },
];

const CAPTURE_FIELDS: { field: CaptureField; label: string; varName: string; hint: string }[] = [
  { field: "name", label: "Nome do cliente", varName: "{{nome}}", hint: 'Detecta "sou João", "me chamo Maria"' },
  { field: "electricity_bill_value", label: "Valor da conta de luz", varName: "{{valor_conta}}", hint: 'Detecta "R$ 350", "minha conta vem 450"' },
  { field: "phone_whatsapp", label: "Telefone", varName: "{{telefone}}", hint: 'Detecta "(11) 99999-8888"' },
  { field: "cpf", label: "CPF", varName: "{{cpf}}", hint: 'Detecta "123.456.789-00"' },
];

const ICON_OPTIONS: { value: IconKey; label: string }[] = [
  { value: "msg", label: "💬 Mensagem" },
  { value: "video", label: "🎬 Vídeo" },
  { value: "sparkle", label: "✨ Boas-vindas" },
  { value: "user", label: "👤 Humano" },
  { value: "file", label: "📄 Cadastro" },
];

function IconFor({ tipo }: { tipo: IconKey }) {
  const cls = "h-5 w-5";
  if (tipo === "video") return <Video className={cls} />;
  if (tipo === "sparkle") return <Sparkles className={cls} />;
  if (tipo === "user") return <UserCheck className={cls} />;
  if (tipo === "file") return <FileText className={cls} />;
  return <MessageSquare className={cls} />;
}

const ATALHOS = [
  { quando: "Em qualquer passo, o lead diz 'quero cadastrar'", vai_para: "Pula direto para o Cadastro" },
  { quando: "Em qualquer passo, o lead diz 'quero falar com humano'", vai_para: "Marca como 'Aguardando humano' e o bot silencia" },
];

function parseTransitions(raw: unknown): Transition[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[])
    // remove o antigo "default" — virou bloco Plano B
    .filter((t) => String(t?.trigger_intent ?? "") !== "default")
    .map((t) => ({
      trigger_intent: String(t?.trigger_intent ?? "afirmacao"),
      trigger_phrases: Array.isArray(t?.trigger_phrases) ? t.trigger_phrases.map(String) : [],
      goto_step_id: t?.goto_step_id ?? null,
      goto_special: (t?.goto_special as Transition["goto_special"]) ?? null,
    }));
}

function parseCaptures(raw: unknown): Capture[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[])
    .filter((c) => c && typeof c.field === "string")
    .map((c) => ({ field: c.field as CaptureField, enabled: c.enabled !== false }));
}

function parseFallback(raw: unknown, transitions: unknown): Fallback {
  // 1) usa coluna nova se preenchida
  if (raw && typeof raw === "object") {
    const r = raw as any;
    if (r.mode === "goto" || r.mode === "ai" || r.mode === "repeat") {
      return {
        mode: r.mode,
        goto_step_id: r.goto_step_id ?? null,
        ai_prompt: typeof r.ai_prompt === "string" ? r.ai_prompt : "",
      };
    }
  }
  // 2) migração: se nas transitions antigas tinha um item "default", vira fallback
  if (Array.isArray(transitions)) {
    const def = (transitions as any[]).find((t) => t?.trigger_intent === "default");
    if (def) {
      if (def.goto_special === "repeat" || (!def.goto_step_id && !def.goto_special)) {
        return { mode: "repeat" };
      }
      if (def.goto_step_id) return { mode: "goto", goto_step_id: def.goto_step_id };
    }
  }
  return { mode: "repeat" };
}

export default function FluxoCamila() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [globalAtivo, setGlobalAtivo] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testCount, setTestCount] = useState(0);

  const reload = useCallback(async (uid: string) => {
    const [{ data: cons }, { data: flows }, { count }] = await Promise.all([
      supabase.from("consultants").select("conversational_flow_enabled").eq("id", uid).maybeSingle(),
      supabase.from("bot_flows").select("id").eq("consultant_id", uid).eq("is_active", true).order("created_at").limit(1),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("consultant_id", uid).eq("conversational_flow_enabled", true),
    ]);
    setGlobalAtivo(!!cons?.conversational_flow_enabled);
    setTestCount(count ?? 0);

    let fid = flows?.[0]?.id ?? null;
    if (!fid) {
      // garantia: chama a função de seed (idempotente)
      const { data } = await supabase.rpc("seed_default_camila_flow", { _consultant_id: uid });
      fid = (data as string) ?? null;
    }
    setFlowId(fid);
    if (fid) {
      const { data: rows } = await supabase
        .from("bot_flow_steps").select("*").eq("flow_id", fid).order("position");
      setSteps((rows ?? []).map((r: any) => ({
        ...r,
        icon: (r.icon ?? "msg") as IconKey,
        title: r.title ?? "Sem título",
        transitions: parseTransitions(r.transitions),
        captures: parseCaptures(r.captures),
        fallback: parseFallback(r.fallback, r.transitions),
      })));
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) { navigate("/auth"); return; }
      await reload(uid);
      setLoading(false);
    })();
  }, [navigate, reload]);

  // ---------------------------------------------------------------------------
  // Mutadores otimistas
  // ---------------------------------------------------------------------------
  async function patchStep(id: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const dbPatch: any = { ...patch };
    if (dbPatch.transitions) dbPatch.transitions = patch.transitions;
    const { error } = await supabase.from("bot_flow_steps").update(dbPatch).eq("id", id);
    if (error) toast.error("Erro ao salvar: " + error.message);
  }

  async function moveStep(id: string, dir: -1 | 1) {
    const ordered = [...steps].sort((a, b) => a.position - b.position);
    const idx = ordered.findIndex((s) => s.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const a = ordered[idx], b = ordered[swapIdx];
    const newSteps = ordered.map((s) =>
      s.id === a.id ? { ...s, position: b.position } :
      s.id === b.id ? { ...s, position: a.position } : s
    );
    setSteps(newSteps);
    await Promise.all([
      supabase.from("bot_flow_steps").update({ position: b.position }).eq("id", a.id),
      supabase.from("bot_flow_steps").update({ position: a.position }).eq("id", b.id),
    ]);
  }

  async function addStep() {
    if (!flowId) return;
    const maxPos = steps.reduce((m, s) => Math.max(m, s.position), 0);
    const newKey = `passo_${Date.now().toString(36)}`;
    const { data, error } = await supabase.from("bot_flow_steps").insert({
      flow_id: flowId,
      position: maxPos + 1,
      step_type: "message",
      step_key: newKey,
      title: "Novo passo",
      summary: "Descreva aqui o que esse passo faz.",
      icon: "msg",
      message_text: "",
      slot_key: newKey,
      transitions: [{ trigger_intent: "default", trigger_phrases: [], goto_step_id: null, goto_special: "repeat" }],
      is_active: true,
    }).select().maybeSingle();
    if (error || !data) { toast.error(error?.message ?? "Erro ao adicionar"); return; }
    setSteps((prev) => [...prev, { ...(data as any), icon: (data as any).icon ?? "msg", transitions: parseTransitions((data as any).transitions) }]);
    toast.success("Passo adicionado");
  }

  async function deleteStep(id: string) {
    if (!confirm("Apagar este passo? A Camila não vai mais usar essa etapa.")) return;
    const { error } = await supabase.from("bot_flow_steps").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setSteps((prev) => prev.filter((s) => s.id !== id));
    // Limpa qualquer transição que apontava pra esse id
    for (const s of steps) {
      const filtered = s.transitions.filter((t) => t.goto_step_id !== id);
      if (filtered.length !== s.transitions.length) {
        await patchStep(s.id, { transitions: filtered });
      }
    }
    toast.success("Passo removido");
  }

  async function toggleGlobal(v: boolean) {
    if (!userId) return;
    setGlobalAtivo(v);
    const { error } = await supabase.from("consultants").update({ conversational_flow_enabled: v }).eq("id", userId);
    if (error) { toast.error(error.message); setGlobalAtivo(!v); }
    else toast.success(v ? "Fluxo ativo para TODOS os seus leads" : "Fluxo desligado (só leads de teste)");
  }

  async function addTestNumber() {
    if (!userId) return;
    const phone = testPhone.replace(/\D/g, "");
    if (phone.length < 10) { toast.error("Telefone inválido"); return; }
    const { data, error } = await supabase
      .from("customers").update({ conversational_flow_enabled: true })
      .eq("consultant_id", userId).eq("phone_whatsapp", phone).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("Nenhum lead encontrado com esse número"); return; }
    toast.success(`Fluxo ligado para ${data.length} lead(s)`);
    setTestCount((c) => c + data.length);
    setTestPhone(""); setTestOpen(false);
  }

  async function clearTestNumbers() {
    if (!userId) return;
    if (!confirm("Desligar o fluxo para todos os leads de teste?")) return;
    const { error, count } = await supabase
      .from("customers").update({ conversational_flow_enabled: false }, { count: "exact" })
      .eq("consultant_id", userId).eq("conversational_flow_enabled", true);
    if (error) { toast.error(error.message); return; }
    toast.success(`${count ?? 0} lead(s) removido(s)`);
    setTestCount(0);
  }

  const orderedSteps = useMemo(() => [...steps].sort((a, b) => a.position - b.position), [steps]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold truncate">Fluxo da Camila</h1>
            <p className="text-xs text-muted-foreground">Você decide o que ela fala, em que ordem, e pra onde vai depois.</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Global */}
        <Card className="p-4 sm:p-5 border-primary/30 bg-primary/5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <Label htmlFor="global" className="text-base font-semibold">Ativar para TODOS os meus leads</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Quando ligado, qualquer lead novo seu cai automaticamente neste fluxo. Quando desligado, só os números marcados como teste usam.
              </p>
            </div>
            <Switch id="global" checked={globalAtivo} onCheckedChange={toggleGlobal} />
          </div>
          <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Em teste com <Badge variant="secondary">{testCount}</Badge> número(s)</span>
            </div>
            <div className="flex gap-2">
              {testCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearTestNumbers}>
                  <X className="h-4 w-4 mr-1" /> Limpar testes
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>Testar com 1 número</Button>
            </div>
          </div>
        </Card>

        {/* Atalhos */}
        <Card className="p-4 sm:p-5 border-amber-500/30 bg-amber-500/5">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" /> Atalhos sempre disponíveis
          </h2>
          <ul className="text-sm space-y-1.5">
            {ATALHOS.map((a, i) => (
              <li key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span className="text-muted-foreground">{a.quando}</span>
                <span className="hidden sm:inline">→</span>
                <span className="font-medium">{a.vai_para}</span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="text-center text-sm text-muted-foreground">(0) Lead manda a primeira mensagem no WhatsApp</div>
        <div className="flex justify-center"><ArrowDown className="h-5 w-5 text-muted-foreground" /></div>

        {/* Passos */}
        {orderedSteps.map((step, idx) => (
          <div key={step.id}>
            <StepCard
              step={step}
              numero={idx + 1}
              total={orderedSteps.length}
              consultantId={userId!}
              allSteps={orderedSteps}
              onPatch={(p) => patchStep(step.id, p)}
              onMoveUp={() => moveStep(step.id, -1)}
              onMoveDown={() => moveStep(step.id, +1)}
              onDelete={() => deleteStep(step.id)}
            />
            {idx < orderedSteps.length - 1 && (
              <div className="flex justify-center my-2"><ArrowDown className="h-5 w-5 text-muted-foreground" /></div>
            )}
          </div>
        ))}

        <Button onClick={addStep} className="w-full" variant="outline" size="lg">
          <Plus className="h-4 w-4 mr-2" /> Adicionar passo
        </Button>
      </main>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Testar com 1 número</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Digite o WhatsApp de um lead que já existe no seu CRM. O fluxo será ligado só pra ele.
          </p>
          <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="11999998888" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestOpen(false)}>Cancelar</Button>
            <Button onClick={addTestNumber}>Ligar fluxo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepCard
// ---------------------------------------------------------------------------
function StepCard(props: {
  step: Step;
  numero: number;
  total: number;
  consultantId: string;
  allSteps: Step[];
  onPatch: (p: Partial<Step>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const { step, numero, total, consultantId, allSteps, onPatch, onMoveUp, onMoveDown, onDelete } = props;
  const [localText, setLocalText] = useState(step.message_text ?? "");
  const [localTitle, setLocalTitle] = useState(step.title);
  const [localSummary, setLocalSummary] = useState(step.summary ?? "");

  useEffect(() => { setLocalText(step.message_text ?? ""); }, [step.message_text]);
  useEffect(() => { setLocalTitle(step.title); }, [step.title]);
  useEffect(() => { setLocalSummary(step.summary ?? ""); }, [step.summary]);

  const slotKey = step.slot_key || step.step_key || step.id;

  return (
    <Card className={`p-4 sm:p-5 ${step.is_active ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <IconFor tipo={step.icon} />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Passo {numero}</div>
          <Input
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={() => localTitle !== step.title && onPatch({ title: localTitle })}
            className="text-base sm:text-lg font-semibold h-9"
          />
          <Textarea
            value={localSummary}
            onChange={(e) => setLocalSummary(e.target.value)}
            onBlur={() => localSummary !== (step.summary ?? "") && onPatch({ summary: localSummary })}
            placeholder="Resumo curto do que esse passo faz"
            className="text-sm text-muted-foreground min-h-[40px]"
            rows={1}
          />
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" disabled={numero === 1} onClick={onMoveUp}><ChevronUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" disabled={numero === total} onClick={onMoveDown}><ChevronDown className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{step.is_active ? "Ativo" : "Inativo"}</span>
            <Switch checked={step.is_active} onCheckedChange={(v) => onPatch({ is_active: v })} />
          </div>
          <Select value={step.icon} onValueChange={(v) => onPatch({ icon: v as IconKey })}>
            <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>{ICON_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Mídia */}
      <StepMediaPanel consultantId={consultantId} stepKey={slotKey} slotKeys={[slotKey]} />

      {/* Mensagem de texto */}
      <div className="mt-4">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Mensagem de texto</Label>
        <Textarea
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onBlur={() => localText !== (step.message_text ?? "") && onPatch({ message_text: localText })}
          rows={4}
          placeholder="Texto que a Camila envia neste passo. Use {{nome}}, {{valor_conta}}, {{representante}}."
          className="mt-1"
        />
      </div>

      {/* Transições */}
      <div className="mt-4 pt-4 border-t border-border/60">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Para onde vai depois</Label>
          <Button size="sm" variant="outline" onClick={() => {
            const novas = [...step.transitions, { trigger_intent: "default", trigger_phrases: [], goto_step_id: null, goto_special: "repeat" } as Transition];
            onPatch({ transitions: novas });
          }}><Plus className="h-3 w-3 mr-1" /> Regra</Button>
        </div>
        <div className="space-y-2">
          {step.transitions.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nenhuma regra. A Camila vai repetir esse passo.</p>
          )}
          {step.transitions.map((t, i) => (
            <TransitionRow
              key={i}
              transition={t}
              currentStepId={step.id}
              allSteps={allSteps}
              onChange={(nt) => {
                const novas = [...step.transitions];
                novas[i] = nt;
                onPatch({ transitions: novas });
              }}
              onRemove={() => {
                const novas = step.transitions.filter((_, idx) => idx !== i);
                onPatch({ transitions: novas });
              }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TransitionRow
// ---------------------------------------------------------------------------
function TransitionRow(props: {
  transition: Transition;
  currentStepId: string;
  allSteps: Step[];
  onChange: (t: Transition) => void;
  onRemove: () => void;
}) {
  const { transition, currentStepId, allSteps, onChange, onRemove } = props;
  const [phrases, setPhrases] = useState(transition.trigger_phrases.join(", "));

  useEffect(() => { setPhrases(transition.trigger_phrases.join(", ")); }, [transition.trigger_phrases]);

  const destValue =
    transition.goto_special ? `special:${transition.goto_special}` :
    transition.goto_step_id ? `step:${transition.goto_step_id}` : "";

  return (
    <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Quando</span>
        <Select value={transition.trigger_intent} onValueChange={(v) => onChange({ ...transition, trigger_intent: v })}>
          <SelectTrigger className="h-8 flex-1 min-w-[180px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {INTENT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" onClick={onRemove}><X className="h-4 w-4" /></Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Palavras-chave (opcional)</span>
        <Input
          value={phrases}
          onChange={(e) => setPhrases(e.target.value)}
          onBlur={() => {
            const arr = phrases.split(",").map((s) => s.trim()).filter(Boolean);
            onChange({ ...transition, trigger_phrases: arr });
          }}
          placeholder="sim, quero, vamos"
          className="h-8 text-sm"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Vai para</span>
        <Select
          value={destValue}
          onValueChange={(v) => {
            if (v.startsWith("special:")) onChange({ ...transition, goto_special: v.slice(8) as Transition["goto_special"], goto_step_id: null });
            else if (v.startsWith("step:")) onChange({ ...transition, goto_step_id: v.slice(5), goto_special: null });
          }}
        >
          <SelectTrigger className="h-8 flex-1 min-w-[200px] text-sm"><SelectValue placeholder="Escolher destino" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="special:repeat">↻ Repetir esse mesmo passo</SelectItem>
            <SelectItem value="special:cadastro">→ Cadastro (OCR + portal)</SelectItem>
            <SelectItem value="special:humano">→ Aguardando humano (silenciar bot)</SelectItem>
            {allSteps.filter((s) => s.id !== currentStepId).map((s) => {
              const num = allSteps.findIndex(x => x.id === s.id) + 1;
              return <SelectItem key={s.id} value={`step:${s.id}`}>Passo {num} — {s.title}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
