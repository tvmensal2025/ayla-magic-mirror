import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { ArrowLeft, Plus, AlertTriangle, ExternalLink, Loader2, Sparkles, Wand2, GitBranch, BookOpen, Play } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";

import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";

import StepCard from "@/components/admin/flow-builder/StepCard";
import StepInspector from "@/components/admin/flow-builder/StepInspector";
import WhatsAppPreview from "@/components/admin/flow-builder/WhatsAppPreview";
import FlowTemplatesDialog from "@/components/admin/flow-builder/FlowTemplatesDialog";
import VariantDistributionBar from "@/components/admin/flow-builder/VariantDistributionBar";
import FlowSimulator from "@/components/admin/flow-builder/FlowSimulator";
import { useFlowValidation } from "@/components/admin/flow-builder/useFlowValidation";
import {
  Step, Variant, ALL_VARIANTS, VARIANT_LABEL,
  parseTransitions, parseCaptures, parseFallback,
} from "@/components/admin/flow-builder/flowTypes";

/**
 * Novo editor de fluxos — layout híbrido:
 * - Esquerda: lista de cards drag-and-drop (passos)
 * - Direita: preview WhatsApp ao vivo do passo selecionado
 * - Sheet lateral: inspector para editar o passo
 *
 * Schema do banco é IDÊNTICO ao FluxoCamila legado — backward-compat total.
 */
export default function FluxoBuilder() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [userId, setUserId] = useState<string | null>(null);
  const [consultantName, setConsultantName] = useState<string>("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingVariant, setEditingVariant] = useState<Variant>("A");
  const [existingVariants, setExistingVariants] = useState<Variant[]>(["A"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const [showConnections, setShowConnections] = useState(true);
  const [mediaCounts, setMediaCounts] = useState<Record<string, { audio: number; image: number; video: number }>>({});
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async (uid: string, variant: Variant = "A") => {
    setLoading(true);
    const [{ data: cons }, { data: flows }, { data: allFlows }] = await Promise.all([
      supabase.from("consultants").select("conversational_flow_enabled, name").eq("id", uid).maybeSingle(),
      (supabase as any).from("bot_flows").select("id").eq("consultant_id", uid).eq("is_active", true).eq("variant", variant).order("created_at").limit(1),
      supabase.from("bot_flows").select("variant").eq("consultant_id", uid).eq("is_active", true),
    ]);
    
    setConsultantName((cons as any)?.name ?? "");
    const ex = new Set<Variant>(["A"]);
    for (const r of ((allFlows as any[]) || [])) {
      if (ALL_VARIANTS.includes(r.variant)) ex.add(r.variant);
    }
    setExistingVariants(ALL_VARIANTS.filter((v) => ex.has(v)));

    let fid = flows?.[0]?.id ?? null;
    if (!fid && variant === "A") {
      const { data } = await supabase.rpc("seed_default_camila_flow", { _consultant_id: uid });
      fid = (data as string) ?? null;
    }
    setFlowId(fid);

    if (fid) {
      const { data: rows } = await supabase
        .from("bot_flow_steps").select("*").eq("flow_id", fid).order("position");
      const parsed = (rows ?? []).map((r: any) => ({
        ...r,
        icon: r.icon ?? "msg",
        title: r.title ?? "Sem título",
        transitions: parseTransitions(r.transitions),
        captures: parseCaptures(r.captures),
        fallback: parseFallback(r.fallback, r.transitions),
        auto_detect_doc_type: r.auto_detect_doc_type !== false,
      })) as Step[];
      setSteps(parsed);
      if (parsed.length && !selectedId) setSelectedId(parsed[0].id);
    } else {
      setSteps([]);
      setSelectedId(null);
    }

    // Contagem de mídias por slot
    const { data: medias } = await supabase
      .from("ai_media_library")
      .select("kind, slot_key, active, consultant_id, is_public")
      .or(`consultant_id.eq.${uid},is_public.eq.true`)
      .eq("active", true);
    const counts: Record<string, { audio: number; image: number; video: number }> = {};
    for (const m of (medias ?? []) as any[]) {
      const k = m.slot_key as string | null;
      if (!k) continue;
      if (!counts[k]) counts[k] = { audio: 0, image: 0, video: 0 };
      if (m.kind === "audio" || m.kind === "image" || m.kind === "video") {
        counts[k][m.kind as "audio" | "image" | "video"]++;
      }
    }
    setMediaCounts(counts);
    setLoading(false);
  }, [selectedId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) { navigate("/auth"); return; }
      if (!alive) return;
      setUserId(uid);
      await reload(uid, editingVariant);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (userId) reload(userId, editingVariant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingVariant]);

  const selected = useMemo(() => steps.find((s) => s.id === selectedId) ?? null, [steps, selectedId]);
  const inspectorStep = useMemo(() => steps.find((s) => s.id === inspectorId) ?? null, [steps, inspectorId]);

  const validation = useFlowValidation(steps);
  const flowWarnings = validation.total;
  const flowErrors = validation.errors;
  const maxPosition = useMemo(
    () => steps.reduce((m, s) => Math.max(m, s.position), 0),
    [steps],
  );

  async function autoFixAll() {
    if (!validation.autoFixablePatches.length) return;
    const ok = await confirm({
      title: "Auto-corrigir alertas?",
      description: `Vou remover ${validation.autoFixablePatches.reduce(
        (n, p) => n + (Array.isArray((p.patch as any).transitions) ? 1 : 0),
        0,
      )} regra(s) sem destino ou apontando para passos removidos.`,
      confirmText: "Corrigir",
    });
    if (!ok) return;
    for (const p of validation.autoFixablePatches) {
      await patchStep(p.stepId, p.patch);
    }
    toast.success("Alertas corrigidos");
  }


  async function patchStep(id: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error } = await supabase.from("bot_flow_steps").update(patch as any).eq("id", id);
    if (error) toast.error("Erro ao salvar: " + error.message);
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex((s) => s.id === active.id);
    const newIdx = steps.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(steps, oldIdx, newIdx).map((s, i) => ({ ...s, position: i + 1 }));
    setSteps(reordered);
    // Persiste cada nova posição
    await Promise.all(
      reordered.map((s) => supabase.from("bot_flow_steps").update({ position: s.position }).eq("id", s.id)),
    );
  }

  async function addStep() {
    if (!flowId) return;
    const maxPos = steps.reduce((m, s) => Math.max(m, s.position), 0);
    const newKey = `passo_${Date.now().toString(36)}`;
    const { data, error } = await supabase.from("bot_flow_steps").insert({
      flow_id: flowId, position: maxPos + 1, step_type: "message",
      step_key: newKey, title: "Novo passo", summary: "", icon: "msg",
      message_text: "", slot_key: newKey, transitions: [], captures: [],
      fallback: { mode: "repeat" }, is_active: true,
    }).select().maybeSingle();
    if (error || !data) { toast.error(error?.message ?? "Erro"); return; }
    const newStep: Step = {
      ...(data as any),
      icon: (data as any).icon ?? "msg",
      transitions: parseTransitions((data as any).transitions),
      captures: parseCaptures((data as any).captures),
      fallback: parseFallback((data as any).fallback, (data as any).transitions),
    };
    setSteps((prev) => [...prev, newStep]);
    setSelectedId(newStep.id);
    setInspectorId(newStep.id);
    toast.success("Passo adicionado");
  }

  async function duplicateStep(id: string) {
    const orig = steps.find((s) => s.id === id);
    if (!orig || !flowId) return;
    const maxPos = steps.reduce((m, s) => Math.max(m, s.position), 0);
    const { data, error } = await supabase.from("bot_flow_steps").insert({
      flow_id: flowId, position: maxPos + 1, step_type: orig.step_type,
      step_key: `${orig.step_key ?? "passo"}_copy_${Date.now().toString(36).slice(-4)}`,
      title: `${orig.title} (cópia)`, summary: orig.summary, icon: orig.icon,
      message_text: orig.message_text, slot_key: orig.slot_key,
      transitions: orig.transitions as any, captures: orig.captures as any,
      fallback: orig.fallback as any, is_active: orig.is_active,
    }).select().maybeSingle();
    if (error || !data) { toast.error(error?.message ?? "Erro"); return; }
    setSteps((prev) => [...prev, {
      ...(data as any),
      icon: (data as any).icon ?? "msg",
      transitions: parseTransitions((data as any).transitions),
      captures: parseCaptures((data as any).captures),
      fallback: parseFallback((data as any).fallback, (data as any).transitions),
    }]);
    toast.success("Passo duplicado");
  }

  async function deleteStep(id: string) {
    const ok = await confirm({
      title: "Remover este passo?",
      description: "As regras que apontavam para ele serão limpas.",
      confirmText: "Remover",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("bot_flow_steps").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setSteps((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (inspectorId === id) setInspectorId(null);
    // Limpa transitions órfãs
    for (const s of steps) {
      if (s.id === id) continue;
      const filtered = s.transitions.filter((t) => t.goto_step_id !== id);
      if (filtered.length !== s.transitions.length) {
        await patchStep(s.id, { transitions: filtered });
      }
    }
    toast.success("Passo removido");
  }


  if (loading && !steps.length) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-semibold">Editor de Fluxo</h1>
            <p className="text-xs text-muted-foreground">
              Monte como o bot conversa com seus leads — arraste, edite, veja o preview ao vivo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {flowWarnings > 0 && (
              <Badge
                variant={flowErrors > 0 ? "destructive" : "secondary"}
                className="gap-1"
              >
                <AlertTriangle className="h-3 w-3" />
                {flowWarnings} {flowWarnings === 1 ? "alerta" : "alertas"}
              </Badge>
            )}
            {validation.autoFixablePatches.length > 0 && (
              <Button variant="outline" size="sm" onClick={autoFixAll}>
                <Wand2 className="mr-1 h-3 w-3" />
                Auto-corrigir
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/conhecimento")}>
              <BookOpen className="mr-1 h-3 w-3" />
              Conhecimento
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSimulatorOpen(true)}
              disabled={steps.length === 0}
              title={steps.length === 0 ? "Adicione ao menos 1 passo para testar" : "Testar fluxo localmente"}
            >
              <Play className="mr-1 h-3 w-3" />
              🎬 Testar fluxo
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)} disabled={!flowId}>
              <Sparkles className="mr-1 h-3 w-3" />
              Templates
            </Button>
          </div>
        </div>

        {/* Distribuição entre variantes (ativar/pausar/criar) */}
        {userId && (
          <VariantDistributionBar
            consultantId={userId}
            existingVariants={existingVariants}
            editingVariant={editingVariant}
            onSelectVariant={setEditingVariant}
            onChanged={() => userId && reload(userId, editingVariant)}
          />
        )}
      </header>

      {/* Layout 2 colunas */}
      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-6 lg:grid-cols-[1fr_400px]">
        {/* Coluna esquerda — passos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Editando variante <span className="font-semibold text-foreground">{editingVariant}</span> — {VARIANT_LABEL[editingVariant].replace(/^[A-E]\s*/, "")} · {steps.length} {steps.length === 1 ? "passo" : "passos"}
            </h2>
          </div>

          {steps.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum passo ainda. Adicione o primeiro abaixo.
              </p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {steps.map((s) => (
                    <StepCard
                      key={s.id}
                      step={s}
                      steps={steps}
                      selected={selectedId === s.id}
                      mediaCount={s.slot_key ? mediaCounts[s.slot_key] : undefined}
                      showConnections={true}
                      onSelect={() => setSelectedId(s.id)}
                      onEdit={() => { setSelectedId(s.id); setInspectorId(s.id); }}
                      onDelete={() => deleteStep(s.id)}
                      onDuplicate={() => duplicateStep(s.id)}
                      onJumpTo={(targetId) => {
                        setSelectedId(targetId);
                        // Scroll suave até o card destino
                        setTimeout(() => {
                          document.getElementById(`step-card-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }, 50);
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <Button variant="outline" className="w-full" onClick={addStep}>
            <Plus className="mr-1 h-4 w-4" />
            Adicionar passo
          </Button>
        </section>

        {/* Coluna direita — preview WhatsApp */}
        <aside className="hidden lg:block">
          <WhatsAppPreview step={selected} steps={steps} consultantName={consultantName} />
        </aside>
      </main>

      {/* Inspector */}
      {userId && (
        <StepInspector
          step={inspectorStep}
          steps={steps}
          consultantId={userId}
          variant={editingVariant}
          flowId={flowId}
          maxPosition={maxPosition}
          onClose={() => setInspectorId(null)}
          onPatch={(patch) => inspectorStep && patchStep(inspectorStep.id, patch)}
          onReload={() => userId && reload(userId, editingVariant)}
        />
      )}

      {/* Templates dialog */}
      {userId && (
        <FlowTemplatesDialog
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
          flowId={flowId}
          currentMaxPosition={maxPosition}
          onApplied={() => reload(userId, editingVariant)}
        />
      )}

      {/* Simulador de Fluxo (modal) */}
      <FlowSimulator
        open={simulatorOpen}
        onOpenChange={setSimulatorOpen}
        steps={steps}
      />
    </div>
  );
}
