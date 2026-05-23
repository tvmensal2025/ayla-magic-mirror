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
  ChevronUp, ChevronDown, Plus, Trash2, FlaskConical, X, Target, Database, Bot, HelpCircle, BookOpen,
  AlertTriangle, Play,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import StepMediaPanel from "@/components/admin/fluxo/StepMediaPanel";
import { HelpHint } from "@/components/ui/help-hint";

import { simulateMatch, detectRuleConflicts } from "@/lib/flowSimulator";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type IconKey = "msg" | "video" | "sparkle" | "user" | "file";

type Variant = "A" | "B" | "C" | "D" | "E";
const ALL_VARIANTS: Variant[] = ["A", "B", "C", "D", "E"];
const VARIANT_LABEL: Record<Variant, string> = {
  A: "A (com áudio)",
  B: "B (sem áudio)",
  C: "C (vídeo inicial)",
  D: "D (personalizado)",
  E: "E (personalizado)",
};

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
  text_delay_ms: number | null;
  slot_key: string | null;
  transitions: Transition[];
  captures: Capture[];
  fallback: Fallback;
  is_active: boolean;
  auto_detect_doc_type?: boolean;
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

// Tipos especiais de passo: cada um aciona um trecho do pipeline de cadastro
// já existente (OCR conta / OCR doc / portal + OTP) sem perder nada do fluxo
// conversacional. Quando o lead chega num passo desses, a Camila redireciona
// pro estágio correspondente do cadastro automaticamente.
const STEP_TYPE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "message",            label: "💬 Mensagem comum",                hint: "Texto + mídia + regras (padrão)." },
  { value: "capture_conta",      label: "📸 Captar conta de luz",           hint: "Pede a conta, faz OCR e mostra dados com botão Confirmar/Corrigir." },
  { value: "capture_documento",  label: "🪪 Captar documento (RG/CNH)",     hint: "Pede a foto. A IA detecta automaticamente se é RG ou CNH." },
  { value: "capture_email",      label: "📧 Captar e-mail",                  hint: "Pede o e-mail e mostra botão Confirmar/Corrigir antes de seguir." },
  { value: "confirm_phone",      label: "📱 Confirmar telefone do WhatsApp", hint: "Pergunta se vai usar este número do WhatsApp ou informar outro." },
  { value: "finalizar_cadastro", label: "🎉 Finalizar cadastro + parabéns", hint: "Envia ao portal, trata o OTP e dispara a mensagem de parabéns deste passo." },
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
  const [initialDelaySec, setInitialDelaySec] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testCount, setTestCount] = useState(0);
  const [mediaCounts, setMediaCounts] = useState<Record<string, { audio: number; video: number; image: number }>>({});
  const [showMigrationBanner, setShowMigrationBanner] = useState(
    () => typeof window !== "undefined" && !localStorage.getItem("camila_migration_v2_dismissed")
  );
  // Variantes dinâmicas A..E
  const [editingVariant, setEditingVariant] = useState<Variant>("A");
  const [existingVariants, setExistingVariants] = useState<Variant[]>(["A"]);
  const [activeVariants, setActiveVariantsState] = useState<Variant[]>(["A"]);
  const [variantCounts, setVariantCounts] = useState<Record<Variant, number>>({ A: 0, B: 0, C: 0, D: 0, E: 0 });
  const [cloneBusy, setCloneBusy] = useState<Variant | null>(null);

  const reload = useCallback(async (uid: string, variant: Variant = "A") => {
    const [{ data: cons }, { data: flows }, { count }, { data: allFlows }, { data: allCustomers }] = await Promise.all([
      supabase.from("consultants").select("conversational_flow_enabled, active_variants").eq("id", uid).maybeSingle(),
      (supabase as any).from("bot_flows").select("id, initial_delay_seconds").eq("consultant_id", uid).eq("is_active", true).eq("variant", variant).order("created_at").limit(1),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("consultant_id", uid).eq("conversational_flow_enabled", true),
      supabase.from("bot_flows").select("variant").eq("consultant_id", uid).eq("is_active", true),
      supabase.from("customers").select("flow_variant").eq("consultant_id", uid),
    ]);
    setGlobalAtivo(!!cons?.conversational_flow_enabled);
    const av = (((cons as any)?.active_variants as string[] | null) || ["A"]).filter(
      (x): x is Variant => ALL_VARIANTS.includes(x as Variant)
    );
    setActiveVariantsState(av.length ? av : ["A"]);
    setTestCount(count ?? 0);

    const ex = new Set<Variant>(["A"]);
    for (const r of ((allFlows as any[]) || [])) {
      if (ALL_VARIANTS.includes(r.variant)) ex.add(r.variant);
    }
    setExistingVariants(ALL_VARIANTS.filter((v) => ex.has(v)));

    const vc: Record<Variant, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const r of ((allCustomers as any[]) || [])) {
      const fv = (r.flow_variant || "A") as Variant;
      if (ALL_VARIANTS.includes(fv)) vc[fv]++;
    }
    setVariantCounts(vc);

    let fid = flows?.[0]?.id ?? null;
    if (!fid && variant === "A") {
      // garantia: chama a função de seed (idempotente) — apenas para variante A
      const { data } = await supabase.rpc("seed_default_camila_flow", { _consultant_id: uid });
      fid = (data as string) ?? null;
    }
    setFlowId(fid);
    // Carrega o delay inicial configurado no fluxo
    setInitialDelaySec(Number((flows?.[0] as any)?.initial_delay_seconds ?? 0));
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
        auto_detect_doc_type: r.auto_detect_doc_type !== false,
      })));
    } else {
      setSteps([]);
    }

    // Conta mídias ativas por slot_key (e por step_tags como fallback)
    const { data: medias } = await supabase
      .from("ai_media_library")
      .select("kind, slot_key, step_tags, active, is_public, consultant_id")
      .or(`consultant_id.eq.${uid},is_public.eq.true`)
      .eq("active", true);
    const counts: Record<string, { audio: number; video: number; image: number }> = {};
    const bump = (key: string, kind: string) => {
      if (!key) return;
      if (!counts[key]) counts[key] = { audio: 0, video: 0, image: 0 };
      if (kind === "audio" || kind === "video" || kind === "image") {
        counts[key][kind as "audio" | "video" | "image"]++;
      }
    };
    for (const m of (medias ?? []) as any[]) {
      if (m.slot_key) bump(String(m.slot_key), String(m.kind));
      for (const t of (m.step_tags ?? []) as string[]) bump(String(t), String(m.kind));
    }
    setMediaCounts(counts);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) { navigate("/auth"); return; }
      await reload(uid, editingVariant);
      setLoading(false);
    })();
  }, [navigate, reload, editingVariant]);

  async function setActiveVariants(next: Variant[]) {
    if (!userId) return;
    const arr = next.length ? next : (["A"] as Variant[]);
    const prev = activeVariants;
    setActiveVariantsState(arr);
    const { error } = await supabase.from("consultants").update({ active_variants: arr } as any).eq("id", userId);
    if (error) { toast.error(error.message); setActiveVariantsState(prev); return; }
    toast.success(arr.length > 1 ? `Round-robin ligado: ${arr.join(" + ")}` : "Apenas Fluxo A em uso");
  }

  function toggleActiveVariant(v: Variant, checked: boolean) {
    if (v === "A" && !checked) {
      toast.error("Fluxo A é obrigatório no sorteio.");
      return;
    }
    const set = new Set(activeVariants);
    if (checked) set.add(v); else set.delete(v);
    void setActiveVariants(ALL_VARIANTS.filter((x) => set.has(x)));
  }

  async function cloneFlowAs(v: Variant) {
    if (!userId || v === "A") return;
    const exists = existingVariants.includes(v);
    if (exists && !confirm(`Já existe Fluxo ${v}. Recriar (apaga e copia do A novamente)?`)) return;
    setCloneBusy(v);
    try {
      const { error } = await supabase.rpc("clone_bot_flow_as" as any, { _consultant_id: userId, _variant: v });
      if (error) throw error;
      toast.success(`Fluxo ${v} criado a partir do A.`);
      await reload(userId, editingVariant);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao clonar");
    } finally {
      setCloneBusy(null);
    }
  }


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
      transitions: [],
      captures: [],
      fallback: { mode: "repeat" },
      is_active: true,
    }).select().maybeSingle();
    if (error || !data) { toast.error(error?.message ?? "Erro ao adicionar"); return; }
    setSteps((prev) => [...prev, {
      ...(data as any),
      icon: (data as any).icon ?? "msg",
      transitions: parseTransitions((data as any).transitions),
      captures: parseCaptures((data as any).captures),
      fallback: parseFallback((data as any).fallback, (data as any).transitions),
    }]);
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

  async function saveInitialDelay(sec: number) {
    if (!flowId) return;
    const clamped = Math.max(0, Math.min(300, Math.round(sec)));
    const { error } = await supabase
      .from("bot_flows")
      .update({ initial_delay_seconds: clamped } as any)
      .eq("id", flowId);
    if (error) { toast.error("Erro ao salvar delay: " + error.message); return; }
    setInitialDelaySec(clamped);
    toast.success(clamped === 0 ? "Delay removido — bot responde imediatamente" : `Bot aguarda ${clamped}s antes de responder ao lead`);
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

  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wipeBusy, setWipeBusy] = useState(false);
  async function wipeAllConversations() {
    if (!userId) return;
    setWipeBusy(true);
    try {
      const { data, error } = await supabase.rpc("reset_all_consultant_conversations", { _consultant_id: userId });
      if (error) throw error;
      const d = (data as any)?.deleted ?? {};
      toast.success(`Tudo limpo! ${d.customers ?? 0} leads, ${d.conversations ?? 0} mensagens, ${d.crm_deals ?? 0} deals apagados.`);
      setTestCount(0);
      setWipeConfirm("");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao apagar");
    } finally {
      setWipeBusy(false);
    }
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
            <h1 className="text-lg sm:text-xl font-bold truncate flex items-center gap-2">
              Fluxo da Camila
              <HelpHint
                title="Editor do Fluxo da Camila"
                summary="Configure o que a IA fala, em que ordem, e quando capturar dados"
                details="Aqui você cria os passos do fluxo automático (variantes A/B/C). Cada passo pode ser do tipo 'mensagem' (envia texto/áudio/vídeo/imagem) ou 'captura' (espera o lead responder com nome, valor da conta, foto da conta, etc). A ordem é dada pelo campo posição (1→10) e a UNIQUE no banco garante que não tenha duas posições iguais ou dois fluxos ativos da mesma variante."
                example="Quer testar uma abordagem sem áudio? Crie a Variante B clonando da A e remova os áudios. O sistema vai alternar leads entre A/B/C automaticamente."
              />
            </h1>
            <p className="text-xs text-muted-foreground">Você decide o que ela fala, em que ordem, e pra onde vai depois.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/conhecimento")}
            className="shrink-0"
          >
            <BookOpen className="h-4 w-4 mr-1" /> Conhecimento do bot
          </Button>
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

          {/* Delay inicial antes de responder ao lead */}
          <div className="mt-4 pt-4 border-t border-border/60">
            <div className="flex items-center gap-2 mb-1">
              <Label className="text-sm font-medium">⏱️ Tempo de espera antes de responder (segundos)</Label>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              O bot aguarda esse tempo após a primeira mensagem do lead antes de iniciar o fluxo. Evita parecer robótico. 0 = responde imediatamente.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={300}
                step={1}
                value={initialDelaySec}
                onChange={(e) => setInitialDelaySec(Math.max(0, Math.min(300, Number(e.target.value) || 0)))}
                className="w-20 h-8 px-2 text-sm rounded border border-border bg-background"
              />
              <span className="text-xs text-muted-foreground">seg (máx 300)</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveInitialDelay(initialDelaySec)}
                disabled={!flowId}
              >
                Salvar
              </Button>
              {initialDelaySec > 0 && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  ✓ Bot aguarda {initialDelaySec}s
                </span>
              )}
            </div>
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
              <AlertDialog onOpenChange={(o) => !o && setWipeConfirm("")}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" /> Apagar TUDO
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar TUDO e começar do zero?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isto vai apagar <strong>todos os seus leads</strong>, conversas, deals do CRM, memória da IA e mensagens agendadas.
                      O fluxo, as mídias e os passos continuam intactos. Qualquer número que mandar mensagem depois vai começar do Passo 1 como lead novo.
                      <br /><br />
                      Para confirmar, digite <code className="px-1 bg-muted rounded">APAGAR</code> abaixo:
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Input value={wipeConfirm} onChange={(e) => setWipeConfirm(e.target.value)} placeholder="APAGAR" autoFocus />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={wipeConfirm !== "APAGAR" || wipeBusy}
                      onClick={wipeAllConversations}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {wipeBusy ? "Apagando…" : "Apagar TUDO"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Card>

        {/* Fluxos ativos (A..E) */}
        <Card className="p-4 sm:p-5 border-purple-500/30 bg-purple-500/5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="h-4 w-4 text-purple-500" />
                <Label className="text-base font-semibold">Fluxos ativos no round-robin</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Marque quais variantes participam do sorteio. Novos leads alternam ciclicamente entre as marcadas. Edite cada uma na aba abaixo. Você pode ter até 5 variantes (A–E).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Rodando agora:</span>
              <Badge className={activeVariants.length > 1 ? "bg-emerald-500 text-white" : "bg-muted text-foreground"}>
                {activeVariants.filter((v) => existingVariants.includes(v)).join(" + ") || "A"}
              </Badge>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
            {ALL_VARIANTS.map((v) => {
              const exists = existingVariants.includes(v);
              const isActive = activeVariants.includes(v);
              return (
                <div
                  key={v}
                  className={`flex items-center justify-between gap-2 rounded-md border p-2.5 ${
                    isActive && exists ? "border-emerald-500/60 bg-emerald-500/5" : "border-border bg-background/50"
                  } ${!exists ? "opacity-70" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      id={`av-${v}`}
                      checked={isActive}
                      disabled={!exists}
                      onCheckedChange={(c) => toggleActiveVariant(v, !!c)}
                    />
                    <label htmlFor={`av-${v}`} className="text-sm cursor-pointer min-w-0">
                      <div className="font-semibold truncate">Fluxo {VARIANT_LABEL[v]}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {exists ? `Leads: ${variantCounts[v]}` : "Ainda não criado"}
                      </div>
                    </label>
                  </div>
                  {v !== "A" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={cloneBusy === v}
                      onClick={() => cloneFlowAs(v)}
                    >
                      {cloneBusy === v ? "…" : exists ? "Recriar" : "+ Criar"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {existingVariants.length > 1 && (
            <div className="mt-4 pt-4 border-t border-border/60 flex items-center gap-2 flex-wrap">
              <Label className="text-sm">Editando:</Label>
              <div className="inline-flex rounded-md border border-border overflow-hidden flex-wrap">
                {existingVariants.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`px-3 py-1.5 text-sm border-l first:border-l-0 border-border ${
                      editingVariant === v ? "bg-primary text-primary-foreground" : "bg-background"
                    }`}
                    onClick={() => setEditingVariant(v)}
                  >
                    Fluxo {v}
                  </button>
                ))}
              </div>
              {editingVariant === "B" && (
                <span className="text-xs text-muted-foreground">Fluxo B: áudios são ignorados — use o texto de cada passo.</span>
              )}
              {editingVariant === "C" && (
                <span className="text-xs text-muted-foreground">Fluxo C: adicione um vídeo no primeiro passo.</span>
              )}
            </div>
          )}
        </Card>




        {showMigrationBanner && (
          <Card className="p-4 border-sky-500/30 bg-sky-500/5 flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-sky-500 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-semibold mb-1">Atualizamos o sistema de regras</div>
              <p className="text-muted-foreground text-[13px]">
                Agora cada passo tem 3 blocos: <strong>Regras</strong>, <strong>Capturar dados</strong> e <strong>Plano B</strong>.
                Seus fluxos antigos foram convertidos automaticamente — nada deixou de funcionar.
                Confira o <strong>Plano B</strong> de cada passo para escolher entre repetir, pular ou deixar a IA decidir.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                localStorage.setItem("camila_migration_v2_dismissed", "1");
                setShowMigrationBanner(false);
              }}
            >Entendi</Button>
          </Card>
        )}

        <FlowAuditPanel
          steps={orderedSteps}
          flowId={flowId}
          onRepaired={() => userId && reload(userId, editingVariant)}
        />

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
              mediaCounts={mediaCounts}
              onPatch={(p) => patchStep(step.id, p)}
              onMoveUp={() => moveStep(step.id, -1)}
              onMoveDown={() => moveStep(step.id, +1)}
              onDelete={() => deleteStep(step.id)}
              variant={editingVariant}
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
  mediaCounts: Record<string, { audio: number; video: number; image: number }>;
  onPatch: (p: Partial<Step>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  variant?: Variant;
}) {
  const { step, numero, total, consultantId, allSteps, mediaCounts, onPatch, onMoveUp, onMoveDown, onDelete, variant = "A" } = props;
  const [localText, setLocalText] = useState(step.message_text ?? "");
  const [localTitle, setLocalTitle] = useState(step.title);
  const [localSummary, setLocalSummary] = useState(step.summary ?? "");

  useEffect(() => { setLocalText(step.message_text ?? ""); }, [step.message_text]);
  useEffect(() => { setLocalTitle(step.title); }, [step.title]);
  useEffect(() => { setLocalSummary(step.summary ?? ""); }, [step.summary]);

  const slotKey = step.slot_key || step.step_key || step.id;
  const c = mediaCounts[slotKey] || { audio: 0, video: 0, image: 0 };
  const missing: string[] = [];
  if (c.audio === 0) missing.push("áudio");
  if (c.video === 0) missing.push("vídeo");
  const missingLabel = missing.length === 0
    ? null
    : missing.length === 2 ? "Sem áudio e vídeo" : `Sem ${missing[0]}`;

  return (
    <Card className={`p-4 sm:p-5 ${step.is_active ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <IconFor tipo={step.icon} />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Passo {numero}</div>
            {missingLabel && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400">
                      <AlertTriangle className="h-3 w-3" /> {missingLabel}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] text-xs">
                    Este passo deveria enviar {missing.join(" e ")}, mas nenhuma mídia foi cadastrada com slot_key=<code>{slotKey}</code>. Suba a mídia no painel abaixo para o bot deixar de mandar só texto.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
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

      {/* Tipo do passo */}
      <div className="mb-3 rounded-lg border border-border/60 bg-muted/30 p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Tipo deste passo</Label>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground"><HelpCircle className="h-3.5 w-3.5" /></button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] text-xs">
                Mensagem comum = passo livre que você edita à vontade. Os outros tipos amarram esse passo a uma etapa do cadastro automático (conta, documento, finalização).
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select value={step.step_type || "message"} onValueChange={(v) => onPatch({ step_type: v })}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STEP_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <div className="flex flex-col">
                  <span>{o.label}</span>
                  <span className="text-[10px] text-muted-foreground">{o.hint}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {step.step_type === "capture_documento" && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={step.auto_detect_doc_type !== false}
              onCheckedChange={(v) => onPatch({ auto_detect_doc_type: !!v } as any)}
            />
            <span>Detectar RG/CNH automaticamente pela foto (IA decide). Se desligar, a Camila pergunta ao lead.</span>
          </label>
        )}
        {step.step_type !== "message" && step.step_type && (
          <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 leading-snug">
            ✨ Quando o lead chegar neste passo, a Camila envia o texto/mídia abaixo e em seguida entra automaticamente
            no pipeline de <strong>{
              step.step_type === "capture_conta" ? "captura da conta" :
              step.step_type === "capture_documento" ? "captura do documento" :
              step.step_type === "capture_email" ? "captura do e-mail" :
              step.step_type === "confirm_phone" ? "confirmação do telefone" :
              "finalização (portal + OTP + parabéns)"
            }</strong>.
          </p>
        )}
      </div>

      {/* Mídia */}
      <StepMediaPanel consultantId={consultantId} stepKey={slotKey} slotKeys={[slotKey]} variant={variant} />

      {/* Mensagem de texto */}
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Mensagem de texto</Label>
          <div className="flex items-center gap-2">
            <AiGenerateTextButton
              consultantId={consultantId}
              stepId={step.id}
              variant={variant}
              onGenerated={(t) => { setLocalText(t); onPatch({ message_text: t }); }}
            />
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>⏱️ Aguardar antes:</span>
              <input
                type="number"
                min={0}
                max={60}
                step={0.5}
                defaultValue={((step.text_delay_ms ?? 1500) / 1000).toFixed(1)}
                onBlur={(e) => {
                  const ms = Math.max(0, Math.min(60000, Math.round(parseFloat(e.target.value || "0") * 1000)));
                  if (ms !== (step.text_delay_ms ?? 1500)) onPatch({ text_delay_ms: ms } as any);
                }}
                className="w-14 h-6 px-1.5 text-xs rounded border border-border bg-background"
              />
              <span>seg</span>
            </label>
          </div>
        </div>
        <Textarea
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onBlur={() => localText !== (step.message_text ?? "") && onPatch({ message_text: localText })}
          rows={4}
          placeholder="Texto que a Camila envia neste passo. Use {{nome}}, {{valor_conta}}, {{representante}}."
          className="mt-1"
        />
      </div>

      {/* Botões de resposta rápida (Whapi) — apenas para passos do tipo mensagem */}
      {(step.step_type || "message") === "message" && (
        <ButtonsEditor
          captures={step.captures as any}
          onChange={(novas) => onPatch({ captures: novas as any })}
        />
      )}




      {/* BLOCO 1 — REGRAS */}
      <BlockShell
        icon={<Target className="h-4 w-4" />}
        title="Regras — quando o cliente disser..."
        tooltip="Cada regra escuta uma intenção do cliente (SIM, NÃO, mandou valor, etc.) e leva pra um passo específico. As regras de cima têm prioridade sobre as de baixo."
        accent="emerald"
        action={
          <Button size="sm" variant="ghost" className="h-7" onClick={() => {
            const novas = [...step.transitions, { trigger_intent: "afirmacao", trigger_phrases: [], goto_step_id: null, goto_special: null } as Transition];
            onPatch({ transitions: novas });
          }}><Plus className="h-3 w-3 mr-1" /> Regra</Button>
        }
      >
        {step.transitions.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhuma regra ainda. Sem regras, a Camila usa direto o Plano B abaixo.</p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1">
              <ChevronUp className="h-3 w-3" /> Regras do topo têm prioridade — só a primeira que casar é executada.
            </p>
            <div className="space-y-2">
              {step.transitions.map((t, i) => {
                const conflicts = detectRuleConflicts(step.transitions).filter(c => c.index === i);
                return (
                  <TransitionRow
                    key={i}
                    transition={t}
                    currentStepId={step.id}
                    allSteps={allSteps}
                    conflicts={conflicts.map(c => c.reason)}
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
                );
              })}
            </div>
            <RuleSimulator rules={step.transitions} allSteps={allSteps} />
          </>
        )}
      </BlockShell>

      {/* BLOCO 2 — CAPTURAR DADOS */}
      <BlockShell
        icon={<Database className="h-4 w-4" />}
        title="Capturar dados que o cliente mandou"
        tooltip="Marque o que a Camila deve detectar automaticamente na mensagem do cliente. O dado é salvo no cadastro e fica disponível como variável nas próximas mensagens."
        accent="sky"
      >
        <div className="grid sm:grid-cols-2 gap-2">
          {CAPTURE_FIELDS.map((cf) => {
            const isOn = step.captures.some((c) => c.field === cf.field && c.enabled);
            return (
              <label
                key={cf.field}
                className="flex items-start gap-2 rounded-md border border-border/60 bg-background/60 p-2.5 cursor-pointer hover:border-sky-500/40 transition"
              >
                <Checkbox
                  checked={isOn}
                  onCheckedChange={(v) => {
                    const others = step.captures.filter((c) => c.field !== cf.field);
                    const novas = v ? [...others, { field: cf.field, enabled: true }] : others;
                    onPatch({ captures: novas });
                  }}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight">{cf.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{cf.hint}</div>
                  <code className="text-[10px] text-sky-500 mt-1 block">salva em {cf.varName}</code>
                </div>
              </label>
            );
          })}
        </div>
      </BlockShell>

      {/* BLOCO 3 — PLANO B */}
      <BlockShell
        icon={<Bot className="h-4 w-4" />}
        title="Plano B — quando nada acima funcionar"
        tooltip="Se o cliente mandar algo que nenhuma regra reconhece, o que a Camila faz?"
        accent="amber"
      >
        <FallbackBlock
          fallback={step.fallback}
          currentStepId={step.id}
          allSteps={allSteps}
          onChange={(f) => onPatch({ fallback: f })}
        />
      </BlockShell>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// BlockShell — visual wrapper para os 3 blocos
// ---------------------------------------------------------------------------
function BlockShell({
  icon, title, tooltip, accent, action, children,
}: {
  icon: React.ReactNode;
  title: string;
  tooltip: string;
  accent: "emerald" | "sky" | "amber";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const accentMap = {
    emerald: "border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-500",
    sky:     "border-sky-500/20 bg-sky-500/[0.04] text-sky-500",
    amber:   "border-amber-500/20 bg-amber-500/[0.04] text-amber-500",
  } as const;
  return (
    <div className={`mt-3 rounded-xl border ${accentMap[accent].split(" ").slice(0,2).join(" ")} p-3 sm:p-4`}>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${accentMap[accent].split(" ").slice(0,2).join(" ")} ${accentMap[accent].split(" ")[2]}`}>
            {icon}
          </div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground transition">
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FallbackBlock
// ---------------------------------------------------------------------------
function FallbackBlock({
  fallback, currentStepId, allSteps, onChange,
}: {
  fallback: Fallback;
  currentStepId: string;
  allSteps: Step[];
  onChange: (f: Fallback) => void;
}) {
  const [prompt, setPrompt] = useState(fallback.ai_prompt ?? "");
  useEffect(() => { setPrompt(fallback.ai_prompt ?? ""); }, [fallback.ai_prompt]);

  return (
    <div className="space-y-2.5">
      <RadioGroup
        value={fallback.mode}
        onValueChange={(v) => onChange({ ...fallback, mode: v as FallbackMode })}
        className="space-y-2"
      >
        <label className="flex items-start gap-2.5 rounded-md border border-border/60 bg-background/60 p-2.5 cursor-pointer hover:border-amber-500/40 transition">
          <RadioGroupItem value="repeat" className="mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium">Repetir esse mesmo passo</div>
            <div className="text-[11px] text-muted-foreground">A Camila reenvia a mensagem deste passo. Opção mais segura.</div>
          </div>
        </label>

        <label className="flex items-start gap-2.5 rounded-md border border-border/60 bg-background/60 p-2.5 cursor-pointer hover:border-amber-500/40 transition">
          <RadioGroupItem value="goto" className="mt-0.5" />
          <div className="flex-1 space-y-2">
            <div>
              <div className="text-sm font-medium">Ir para um passo específico</div>
              <div className="text-[11px] text-muted-foreground">Escolha pra qual passo a Camila pula quando nada bater.</div>
            </div>
            {fallback.mode === "goto" && (
              <Select
                value={fallback.goto_step_id ?? ""}
                onValueChange={(v) => onChange({ ...fallback, goto_step_id: v })}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Escolher passo" /></SelectTrigger>
                <SelectContent>
                  {allSteps.filter((s) => s.id !== currentStepId).map((s) => {
                    const num = allSteps.findIndex(x => x.id === s.id) + 1;
                    return <SelectItem key={s.id} value={s.id}>Passo {num} — {s.title}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
        </label>

        <label className="flex items-start gap-2.5 rounded-md border border-border/60 bg-background/60 p-2.5 cursor-pointer hover:border-amber-500/40 transition">
          <RadioGroupItem value="ai" className="mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="text-sm font-medium">Deixar a IA decidir</div>
              <Sparkles className="h-3 w-3 text-amber-500" />
            </div>
            <div className="text-[11px] text-muted-foreground">A IA lê a mensagem do cliente e escolhe o próximo passo seguindo a sua instrução.</div>
            {fallback.mode === "ai" && (
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onBlur={() => onChange({ ...fallback, ai_prompt: prompt })}
                rows={3}
                placeholder='Ex: "Se parecer interessado, vá para o Passo 3. Se tiver dúvida, repita o passo. Se quiser falar com humano, mande para Aguardando humano."'
                className="text-sm"
              />
            )}
          </div>
        </label>
      </RadioGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TransitionRow
// ---------------------------------------------------------------------------
function TransitionRow(props: {
  transition: Transition;
  currentStepId: string;
  allSteps: Step[];
  conflicts?: string[];
  onChange: (t: Transition) => void;
  onRemove: () => void;
}) {
  const { transition, currentStepId, allSteps, conflicts = [], onChange, onRemove } = props;
  const [phrases, setPhrases] = useState(transition.trigger_phrases.join(", "));

  useEffect(() => { setPhrases(transition.trigger_phrases.join(", ")); }, [transition.trigger_phrases]);

  const destValue =
    transition.goto_special ? `special:${transition.goto_special}` :
    transition.goto_step_id ? `step:${transition.goto_step_id}` : "";

  return (
    <div className={`rounded-lg border p-3 bg-muted/20 space-y-2 ${conflicts.length ? "border-amber-500/50" : "border-border/60"}`}>
      {conflicts.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{conflicts.join(" · ")}</span>
        </div>
      )}
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

// ---------------------------------------------------------------------------
// RuleSimulator — testa uma mensagem contra as regras do passo
// ---------------------------------------------------------------------------
function RuleSimulator({ rules, allSteps }: { rules: Transition[]; allSteps: Step[] }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const result = msg ? simulateMatch(msg, rules) : null;

  const destLabel = (r: Transition | undefined) => {
    if (!r) return "—";
    if (r.goto_special === "repeat") return "Repetir o passo";
    if (r.goto_special === "cadastro") return "→ Cadastro";
    if (r.goto_special === "humano") return "→ Aguardando humano";
    if (r.goto_step_id) {
      const s = allSteps.find(x => x.id === r.goto_step_id);
      const num = allSteps.findIndex(x => x.id === r.goto_step_id) + 1;
      return s ? `→ Passo ${num} — ${s.title}` : "→ Passo removido";
    }
    return "—";
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
        >
          <Play className="h-3 w-3" /> Testar uma mensagem
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder='Ex: "minha conta vem uns 350"'
              className="h-8 text-sm"
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setOpen(false); setMsg(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {msg && (
            <div className={`text-xs rounded-md p-2 ${result ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
              {result ? (
                <>✓ <strong>Regra #{result.index + 1}</strong> dispara → {destLabel(rules[result.index])}</>
              ) : (
                <>Nenhuma regra casa — vai cair no <strong>Plano B</strong>.</>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FlowAuditPanel — detecta problemas de configuração antes do consultor testar
// ---------------------------------------------------------------------------
type Issue = { severity: "high" | "medium" | "low"; step: string; detail: string };

function auditFlow(steps: Step[]): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(steps.map((s) => [s.id, s]));
  const active = steps.filter((s) => s.is_active);

  if (active.length === 0) {
    issues.push({ severity: "high", step: "—", detail: "Nenhum passo ativo. O bot não tem o que enviar." });
    return issues;
  }

  for (const s of active) {
    const label = `${s.position}. ${s.title || s.step_key || s.id.slice(0, 6)}`;
    const hasText = !!(s.message_text && s.message_text.trim());
    const fb = s.fallback;
    const hasCaptures = s.captures.some((c) => c.enabled);
    const hasTransitionGoto = s.transitions.some((t) => !!t.goto_step_id || !!t.goto_special);

    // Passo sem texto e sem mídia configurada (slot_key vazio) é silencioso
    if (!hasText && !s.slot_key) {
      issues.push({ severity: "high", step: label, detail: "Sem texto nem mídia (slot vazio). O passo não envia nada." });
    }

    // Sprint B — empty_reply: passo que espera resposta mas tem corpo vazio (sem texto E sem slot)
    if (!hasText && !s.slot_key && (hasCaptures || hasTransitionGoto)) {
      issues.push({ severity: "high", step: label, detail: "Espera resposta mas não envia nada para o lead. Adicione texto ou mídia." });
    }

    // Sprint B — dead_cascade: sem captura, sem transição, fallback=repeat → loop infinito sem saída
    if (!hasCaptures && !hasTransitionGoto && fb?.mode === "repeat") {
      issues.push({ severity: "high", step: label, detail: "Cascata morta: sem regra, sem captura e Plano B = repetir. O lead trava aqui." });
    }

    // Sprint B — terminal_with_ai_fallback: passo final não pode ter fallback IA (pode jogar lead pra trás)
    if (s.step_type === "finalizar_cadastro" && fb?.mode === "ai") {
      issues.push({ severity: "medium", step: label, detail: "Passo final com Plano B = IA decide. Pode mandar o lead de volta no funil. Use 'repetir' ou 'ir para'." });
    }

    // Plano B aponta para passo inexistente/inativo
    if (fb?.mode === "goto" && fb.goto_step_id) {
      const target = byId.get(fb.goto_step_id);
      if (!target) {
        issues.push({ severity: "high", step: label, detail: "Plano B aponta para um passo que não existe mais." });
      } else if (!target.is_active) {
        issues.push({ severity: "high", step: label, detail: `Plano B aponta para "${target.title}" que está inativo.` });
      }
    }

    // Passos cascata (wait_for=none) sem Plano B → conversa pode travar
    // (apenas alerta se o passo tem captura: aí pode parar mesmo)
    if (hasCaptures) {
      const hasGoto = fb?.mode === "goto" && !!fb.goto_step_id;
      if (!hasGoto && !hasTransitionGoto) {
        issues.push({ severity: "medium", step: label, detail: "Captura dados mas não tem para onde ir depois (sem regra nem Plano B)." });
      }
    }

    // Transições apontando para passo inexistente
    for (const t of s.transitions) {
      if (t.goto_step_id && !byId.get(t.goto_step_id)) {
        issues.push({ severity: "medium", step: label, detail: `Regra "${t.trigger_intent}" aponta para um passo apagado.` });
      }
    }
  }

  return issues;
}

function FlowAuditPanel({ steps, flowId, onRepaired }: { steps: Step[]; flowId: string | null; onRepaired?: () => void }) {
  const issues = useMemo(() => auditFlow(steps), [steps]);
  const [repairing, setRepairing] = useState(false);

  async function handleRepair() {
    if (!flowId) return;
    setRepairing(true);
    try {
      const { data, error } = await supabase.rpc("repair_bot_flow", { _flow_id: flowId });
      if (error) throw error;
      const patched = (data as any)?.patched ?? 0;
      toast.success(patched > 0 ? `${patched} passo(s) reparado(s) automaticamente` : "Nada para reparar — fluxo já está consistente");
      onRepaired?.();
    } catch (e: any) {
      toast.error("Erro ao reparar: " + (e?.message ?? String(e)));
    } finally {
      setRepairing(false);
    }
  }

  if (issues.length === 0) {
    return (
      <Card className="p-3 sm:p-4 border-emerald-500/30 bg-emerald-500/5 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center text-sm">✓</div>
        <div className="text-sm flex-1">
          <div className="font-semibold">Fluxo pronto para teste</div>
          <div className="text-muted-foreground text-xs">Nenhum problema de configuração detectado.</div>
        </div>
      </Card>
    );
  }
  const high = issues.filter((i) => i.severity === "high").length;
  return (
    <Card className="p-3 sm:p-4 border-amber-500/40 bg-amber-500/5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-semibold flex-1">
          {issues.length} problema(s) detectado(s){high > 0 ? ` — ${high} crítico(s)` : ""}
        </span>
        {flowId && (
          <Button size="sm" variant="default" onClick={handleRepair} disabled={repairing}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {repairing ? "Reparando…" : "Reparar automaticamente"}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">
        O botão "Reparar" preenche capturas, transições e Plano B padrão nos passos vazios (sem sobrescrever o que você já configurou).
      </p>
      <ul className="space-y-1.5 text-xs">
        {issues.map((i, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className={
              i.severity === "high"
                ? "mt-0.5 inline-block h-2 w-2 rounded-full bg-red-500 shrink-0"
                : "mt-0.5 inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0"
            } />
            <span><strong>{i.step}:</strong> {i.detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AiGenerateTextButton({
  consultantId, stepId, variant, onGenerated,
}: { consultantId: string; stepId: string; variant: Variant; onGenerated: (t: string) => void }) {
  const [loading, setLoading] = useState(false);
  async function gen() {
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-step-text", {
        body: { consultantId, stepId, variant },
      });
      const text = (data as any)?.text;
      if (error || (data as any)?.error || !text) {
        const msg = (data as any)?.message || error?.message || "Falha ao gerar texto";
        toast.error(msg);
        return;
      }
      onGenerated(String(text).trim());
      toast.success("Texto gerado com IA");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao chamar a IA");
    } finally {
      setLoading(false);
    }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-[11px] border-primary/40 text-primary hover:bg-primary/10"
        onClick={gen}
        disabled={loading || !consultantId || !stepId}
        title={`Gerar texto persuasivo (variante ${variant})`}
      >
        <Sparkles className={`h-3.5 w-3.5 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "Gerando..." : "Gerar texto (IA)"}
      </Button>
      <HelpHint
        title="Gerar texto com IA (Gemini)"
        summary="A IA escreve uma versão persuasiva do texto do passo"
        details="Usa o Gemini para criar uma mensagem alinhada ao tom da Camila e ao objetivo deste passo (boas-vindas, captura, fechamento, etc). Você pode editar livremente depois. O texto leva em conta a variante (A/B/C) — versões 'sem áudio' tendem a ficar mais explicativas no texto."
        example="Passo de boas-vindas em branco? Clique e a IA cria uma saudação calorosa que cita o consultor pelo nome."
      />
    </span>
  );
}
