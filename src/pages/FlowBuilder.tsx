import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, GripVertical, Copy, Sparkles, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Flow = {
  id: string;
  consultant_id: string;
  name: string;
  is_active: boolean;
  strict_mode: boolean;
};

type Step = {
  id: string;
  flow_id: string;
  position: number;
  step_type: "audio_slot" | "message" | "question" | "media_request" | "cadastro";
  slot_key: string | null;
  message_text: string | null;
  wait_for: "none" | "reply" | "media" | "timer";
  wait_seconds: number;
  condition_text: string | null;
  // local-only flag for new unsaved steps
  _new?: boolean;
};

type Slot = { slot_key: string; label: string; description: string | null };

const STEP_TYPE_LABELS: Record<Step["step_type"], string> = {
  audio_slot: "🎙️ Áudio (slot)",
  message: "💬 Mensagem",
  question: "❓ Pergunta",
  media_request: "📷 Pedir mídia",
  cadastro: "🔗 Link de cadastro",
};

const WAIT_LABELS: Record<Step["wait_for"], string> = {
  none: "Avança automático",
  reply: "Aguarda resposta do lead",
  media: "Aguarda upload de mídia",
  timer: "Aguarda X segundos",
};

const SUGGESTED_FLOW: Omit<Step, "id" | "flow_id">[] = [
  { position: 1, step_type: "audio_slot", slot_key: "boas_vindas", message_text: null, wait_for: "reply", wait_seconds: 0, condition_text: null },
  { position: 2, step_type: "question", slot_key: null, message_text: "{nome}, qual o valor médio da sua conta de luz?", wait_for: "reply", wait_seconds: 0, condition_text: null },
  { position: 3, step_type: "audio_slot", slot_key: "como_funciona", message_text: null, wait_for: "none", wait_seconds: 0, condition_text: null },
  { position: 4, step_type: "audio_slot", slot_key: "fazenda_solar", message_text: null, wait_for: "none", wait_seconds: 0, condition_text: null },
  { position: 5, step_type: "audio_slot", slot_key: "prova_social", message_text: null, wait_for: "none", wait_seconds: 0, condition_text: null },
  { position: 6, step_type: "media_request", slot_key: null, message_text: "Me envia uma foto da sua conta de luz, por favor 📸", wait_for: "media", wait_seconds: 0, condition_text: null },
  { position: 7, step_type: "audio_slot", slot_key: "confirma_recebimento", message_text: null, wait_for: "none", wait_seconds: 0, condition_text: null },
  { position: 8, step_type: "media_request", slot_key: null, message_text: "Agora me manda um documento com foto (RG ou CNH) 🪪", wait_for: "media", wait_seconds: 0, condition_text: null },
  { position: 9, step_type: "audio_slot", slot_key: "chamada_cadastro", message_text: null, wait_for: "none", wait_seconds: 0, condition_text: null },
  { position: 10, step_type: "cadastro", slot_key: null, message_text: "Pra finalizar, é só preencher seus dados aqui: {link_cadastro}", wait_for: "none", wait_seconds: 0, condition_text: null },
];

export default function FlowBuilder() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const selectedFlow = useMemo(() => flows.find((f) => f.id === selectedFlowId) || null, [flows, selectedFlowId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Auth + initial load
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUserId(session.user.id);

      const [flowsRes, slotsRes] = await Promise.all([
        supabase.from("bot_flows").select("*").eq("consultant_id", session.user.id).order("created_at"),
        supabase.from("ai_agent_slots").select("slot_key, label, description").eq("active", true).order("position"),
      ]);

      let list = (flowsRes.data || []) as Flow[];
      // If empty, create a default flow now
      if (list.length === 0) {
        const { data: newFlow } = await supabase.from("bot_flows").insert({
          consultant_id: session.user.id, name: "Fluxo Padrão", is_active: true, strict_mode: false,
        }).select().single();
        if (newFlow) {
          list = [newFlow as Flow];
          await seedDefaultSteps(newFlow.id);
        }
      }
      setFlows(list);
      setSlots((slotsRes.data || []) as Slot[]);
      setSelectedFlowId(list[0]?.id || null);
      setLoading(false);
    })();
  }, [navigate]);

  // Load steps when flow changes
  useEffect(() => {
    if (!selectedFlowId) { setSteps([]); return; }
    (async () => {
      const { data } = await supabase
        .from("bot_flow_steps")
        .select("*")
        .eq("flow_id", selectedFlowId)
        .order("position");
      setSteps((data || []) as Step[]);
    })();
  }, [selectedFlowId]);

  async function seedDefaultSteps(flowId: string) {
    const rows = SUGGESTED_FLOW.map((s) => ({ ...s, flow_id: flowId }));
    await supabase.from("bot_flow_steps").insert(rows);
  }

  async function createFlow() {
    if (!userId) return;
    const { data, error } = await supabase.from("bot_flows").insert({
      consultant_id: userId, name: `Fluxo ${flows.length + 1}`, is_active: false, strict_mode: false,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setFlows((p) => [...p, data as Flow]);
    setSelectedFlowId((data as Flow).id);
    toast.success("Fluxo criado");
  }

  async function duplicateFlow(flow: Flow) {
    if (!userId) return;
    const { data: nf, error } = await supabase.from("bot_flows").insert({
      consultant_id: userId, name: `${flow.name} (cópia)`, is_active: false, strict_mode: flow.strict_mode,
    }).select().single();
    if (error || !nf) { toast.error(error?.message || "Erro"); return; }
    const { data: srcSteps } = await supabase.from("bot_flow_steps").select("*").eq("flow_id", flow.id).order("position");
    if (srcSteps && srcSteps.length) {
      const rows = srcSteps.map((s: any) => ({
        flow_id: nf.id, position: s.position, step_type: s.step_type, slot_key: s.slot_key,
        message_text: s.message_text, wait_for: s.wait_for, wait_seconds: s.wait_seconds, condition_text: s.condition_text,
      }));
      await supabase.from("bot_flow_steps").insert(rows);
    }
    setFlows((p) => [...p, nf as Flow]);
    setSelectedFlowId((nf as Flow).id);
    toast.success("Fluxo duplicado");
  }

  async function deleteFlow(flow: Flow) {
    if (!confirm(`Excluir "${flow.name}"?`)) return;
    const { error } = await supabase.from("bot_flows").delete().eq("id", flow.id);
    if (error) { toast.error(error.message); return; }
    setFlows((p) => p.filter((f) => f.id !== flow.id));
    if (selectedFlowId === flow.id) setSelectedFlowId(flows.find((f) => f.id !== flow.id)?.id || null);
    toast.success("Fluxo excluído");
  }

  async function updateFlowField(field: keyof Flow, value: any) {
    if (!selectedFlow) return;
    setFlows((p) => p.map((f) => f.id === selectedFlow.id ? { ...f, [field]: value } : f));
    const { error } = await supabase.from("bot_flows").update({ [field]: value }).eq("id", selectedFlow.id);
    if (error) toast.error(error.message);
  }

  async function activateFlow(flow: Flow) {
    if (!userId) return;
    // Deactivate others first
    await supabase.from("bot_flows").update({ is_active: false }).eq("consultant_id", userId).neq("id", flow.id);
    const { error } = await supabase.from("bot_flows").update({ is_active: true }).eq("id", flow.id);
    if (error) { toast.error(error.message); return; }
    setFlows((p) => p.map((f) => ({ ...f, is_active: f.id === flow.id })));
    toast.success("Fluxo ativado");
  }

  function addStep(type: Step["step_type"]) {
    if (!selectedFlowId) return;
    const newStep: Step = {
      id: `tmp-${Date.now()}`,
      flow_id: selectedFlowId,
      position: steps.length + 1,
      step_type: type,
      slot_key: type === "audio_slot" ? slots[0]?.slot_key || null : null,
      message_text: type === "audio_slot" ? null : "",
      wait_for: type === "question" ? "reply" : type === "media_request" ? "media" : "none",
      wait_seconds: 0,
      condition_text: null,
      _new: true,
    };
    setSteps((p) => [...p, newStep]);
  }

  function updateStep(id: string, patch: Partial<Step>) {
    setSteps((p) => p.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  function removeStep(id: string) {
    setSteps((p) => p.filter((s) => s.id !== id).map((s, idx) => ({ ...s, position: idx + 1 })));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex((s) => s.id === active.id);
    const newIdx = steps.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(steps, oldIdx, newIdx).map((s, idx) => ({ ...s, position: idx + 1 }));
    setSteps(reordered);
  }

  async function saveSteps() {
    if (!selectedFlowId) return;
    setSaving(true);
    try {
      // Delete all existing then re-insert (simple + atomic enough for flow size)
      await supabase.from("bot_flow_steps").delete().eq("flow_id", selectedFlowId);
      if (steps.length) {
        const rows = steps.map((s, idx) => ({
          flow_id: selectedFlowId,
          position: idx + 1,
          step_type: s.step_type,
          slot_key: s.slot_key,
          message_text: s.message_text,
          wait_for: s.wait_for,
          wait_seconds: s.wait_seconds || 0,
          condition_text: s.condition_text,
        }));
        const { data, error } = await supabase.from("bot_flow_steps").insert(rows).select();
        if (error) throw error;
        setSteps((data || []) as Step[]);
      }
      toast.success("Fluxo salvo");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function applySuggested() {
    if (!selectedFlowId) return;
    if (!confirm("Substituir os passos atuais pelo fluxo sugerido?")) return;
    setSaving(true);
    await supabase.from("bot_flow_steps").delete().eq("flow_id", selectedFlowId);
    const rows = SUGGESTED_FLOW.map((s) => ({ ...s, flow_id: selectedFlowId }));
    const { data } = await supabase.from("bot_flow_steps").insert(rows).select();
    setSteps((data || []) as Step[]);
    setShowDiff(false);
    setSaving(false);
    toast.success("Fluxo sugerido aplicado");
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Construtor de Fluxos do Bot</h1>
            <p className="text-xs text-muted-foreground">Monte a conversa do início até o cadastro</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowDiff((v) => !v)}>
            <Sparkles className="w-4 h-4 mr-1" /> Antes → Depois
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        {/* Sidebar */}
        <aside className="space-y-2">
          <Button onClick={createFlow} className="w-full" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Novo fluxo
          </Button>
          <div className="space-y-1">
            {flows.map((f) => (
              <Card
                key={f.id}
                className={`p-3 cursor-pointer transition ${selectedFlowId === f.id ? "border-primary bg-primary/5" : "hover:border-muted-foreground/40"}`}
                onClick={() => setSelectedFlowId(f.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{f.name}</div>
                    <div className="flex gap-1 mt-1">
                      {f.is_active && <Badge variant="default" className="text-[10px] h-4">Ativo</Badge>}
                      {f.strict_mode && <Badge variant="secondary" className="text-[10px] h-4">100%</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateFlow(f); }}
                      className="text-muted-foreground hover:text-foreground p-1"
                      title="Duplicar"
                    ><Copy className="w-3.5 h-3.5" /></button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFlow(f); }}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title="Excluir"
                    ><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </aside>

        {/* Editor */}
        <main className="space-y-4 min-w-0">
          {showDiff && <BeforeAfterDiff currentSteps={steps} suggested={SUGGESTED_FLOW} slots={slots} onApply={applySuggested} onClose={() => setShowDiff(false)} />}

          {selectedFlow ? (
            <>
              <Card className="p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    value={selectedFlow.name}
                    onChange={(e) => updateFlowField("name", e.target.value)}
                    className="text-lg font-semibold flex-1 min-w-[200px]"
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      id="strict"
                      checked={selectedFlow.strict_mode}
                      onCheckedChange={(v) => updateFlowField("strict_mode", v)}
                    />
                    <Label htmlFor="strict" className="cursor-pointer text-sm">
                      Seguir 100% este fluxo
                    </Label>
                  </div>
                  {selectedFlow.is_active ? (
                    <Badge className="gap-1"><CheckCircle2 className="w-3 h-3" /> Ativo</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => activateFlow(selectedFlow)}>Ativar</Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando "Seguir 100%" está ligado, o bot executa exatamente os passos abaixo em ordem. Caso contrário, o LLM escolhe livremente entre os slots.
                </p>
              </Card>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {steps.map((step, idx) => (
                      <SortableStepCard
                        key={step.id}
                        step={step}
                        index={idx}
                        slots={slots}
                        onChange={(patch) => updateStep(step.id, patch)}
                        onRemove={() => removeStep(step.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <Card className="p-3">
                <div className="text-xs text-muted-foreground mb-2">Adicionar passo</div>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(STEP_TYPE_LABELS) as Step["step_type"][]).map((t) => (
                    <Button key={t} size="sm" variant="outline" onClick={() => addStep(t)}>
                      <Plus className="w-3 h-3 mr-1" /> {STEP_TYPE_LABELS[t]}
                    </Button>
                  ))}
                </div>
              </Card>

              <div className="sticky bottom-4 flex justify-end">
                <Button onClick={saveSteps} disabled={saving} size="lg" className="shadow-lg">
                  <Save className="w-4 h-4 mr-2" /> {saving ? "Salvando…" : "Salvar fluxo"}
                </Button>
              </div>
            </>
          ) : (
            <Card className="p-8 text-center text-muted-foreground">
              Selecione um fluxo ou crie um novo.
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}

// ───────────── Sortable Step Card ─────────────
function SortableStepCard({
  step, index, slots, onChange, onRemove,
}: {
  step: Step;
  index: number;
  slots: Slot[];
  onChange: (patch: Partial<Step>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <Card ref={setNodeRef} style={style} className="p-3">
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground touch-none cursor-grab active:cursor-grabbing pt-1">
          <GripVertical className="w-5 h-5" />
        </button>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={step.step_type} onValueChange={(v) => onChange({ step_type: v as Step["step_type"] })}>
              <SelectTrigger className="h-8 w-auto text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STEP_TYPE_LABELS) as Step["step_type"][]).map((t) => (
                  <SelectItem key={t} value={t}>{STEP_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={step.wait_for} onValueChange={(v) => onChange({ wait_for: v as Step["wait_for"] })}>
              <SelectTrigger className="h-8 w-auto text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(WAIT_LABELS) as Step["wait_for"][]).map((w) => (
                  <SelectItem key={w} value={w}>{WAIT_LABELS[w]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {step.wait_for === "timer" && (
              <Input
                type="number"
                value={step.wait_seconds}
                onChange={(e) => onChange({ wait_seconds: parseInt(e.target.value) || 0 })}
                className="h-8 w-20 text-xs"
                placeholder="seg"
              />
            )}

            <button onClick={onRemove} className="ml-auto text-muted-foreground hover:text-destructive p-1">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {step.step_type === "audio_slot" ? (
            <Select value={step.slot_key || ""} onValueChange={(v) => onChange({ slot_key: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha o slot de áudio" /></SelectTrigger>
              <SelectContent>
                {slots.map((s) => (
                  <SelectItem key={s.slot_key} value={s.slot_key}>{s.label} <span className="opacity-50">({s.slot_key})</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Textarea
              value={step.message_text || ""}
              onChange={(e) => onChange({ message_text: e.target.value })}
              placeholder={step.step_type === "cadastro" ? "Use {link_cadastro} para incluir o link" : "Texto da mensagem"}
              className="text-sm min-h-[60px]"
            />
          )}

          <Input
            value={step.condition_text || ""}
            onChange={(e) => onChange({ condition_text: e.target.value || null })}
            placeholder="Condição opcional (ex.: 'só se o lead perguntar como funciona')"
            className="h-8 text-xs"
          />
        </div>
      </div>
    </Card>
  );
}

// ───────────── Before/After Panel ─────────────
function BeforeAfterDiff({
  currentSteps, suggested, slots, onApply, onClose,
}: {
  currentSteps: Step[];
  suggested: Omit<Step, "id" | "flow_id">[];
  slots: Slot[];
  onApply: () => void;
  onClose: () => void;
}) {
  const labelOf = (s: Pick<Step, "step_type" | "slot_key" | "message_text">) => {
    if (s.step_type === "audio_slot") {
      const slot = slots.find((x) => x.slot_key === s.slot_key);
      return `🎙️ ${slot?.label || s.slot_key || "(slot vazio)"}`;
    }
    return `${STEP_TYPE_LABELS[s.step_type]}: ${(s.message_text || "").slice(0, 60)}`;
  };

  return (
    <Card className="p-4 border-primary/40">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Antes → Depois</h3>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">fechar</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div>
          <div className="font-medium mb-2 text-muted-foreground">Como está agora ({currentSteps.length} passos)</div>
          <ol className="space-y-1">
            {currentSteps.length === 0 && <li className="text-muted-foreground italic">— vazio —</li>}
            {currentSteps.map((s, i) => <li key={s.id} className="border-l-2 border-muted pl-2">{i + 1}. {labelOf(s)}</li>)}
          </ol>
        </div>
        <div>
          <div className="font-medium mb-2 text-primary">Fluxo sugerido (10 passos)</div>
          <ol className="space-y-1">
            {suggested.map((s, i) => <li key={i} className="border-l-2 border-primary/40 pl-2">{i + 1}. {labelOf(s)}</li>)}
          </ol>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Button size="sm" onClick={onApply}><Sparkles className="w-3 h-3 mr-1" /> Aplicar fluxo sugerido</Button>
      </div>
    </Card>
  );
}
