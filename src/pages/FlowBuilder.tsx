import { useEffect, useState, useCallback } from "react";
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
import { ArrowLeft, Plus, Trash2, X, Save, MessageSquare, HelpCircle, Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

type Flow = {
  id: string;
  consultant_id: string;
  name: string;
  is_active: boolean;
  strict_mode: boolean;
};

type Trigger = { id?: string; qa_id?: string; phrase: string };
type Media = {
  id?: string;
  qa_id?: string;
  position: number;
  media_kind: "audio" | "video" | "image";
  media_id: string | null;
  slot_key: string | null;
};
type QA = {
  id: string;
  flow_id: string;
  position: number;
  intent_name: string;
  is_opening: boolean;
  is_closing: boolean;
  text_response: string | null;
  triggers: Trigger[];
  medias: Media[];
};
type Slot = { slot_key: string; label: string; video_url: string | null };
type LibraryVideo = { id: string; label: string; url: string | null };

export default function FlowBuilder() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [qas, setQas] = useState<QA[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [availableVideos, setAvailableVideos] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const loadAll = useCallback(async (uid: string) => {
    setLoading(true);
    // Slots e vídeos disponíveis
    const [{ data: slotsRow }, { data: videoRows }] = await Promise.all([
      supabase
        .from("ai_agent_slots")
        .select("slot_key, label, video_url")
        .eq("active", true)
        .order("position"),
      supabase
        .from("ai_media_library")
        .select("id, label, url")
        .eq("kind", "video")
        .eq("active", true)
        .not("url", "is", null)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    setSlots((slotsRow as Slot[]) || []);
    setAvailableVideos(((videoRows as LibraryVideo[]) || []).filter((video) => !!video.url));

    // Fluxo ativo (ou pega o primeiro / cria um)
    let { data: flowRows } = await supabase
      .from("bot_flows")
      .select("*")
      .eq("consultant_id", uid)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    let f: Flow | null = (flowRows as Flow[])?.[0] ?? null;
    if (!f) {
      const { data: created } = await supabase
        .from("bot_flows")
        .insert({ consultant_id: uid, name: "Meu fluxo", is_active: true, strict_mode: false })
        .select()
        .single();
      f = created as Flow;
    }
    setFlow(f);

    if (f) {
      const { data: qaRows } = await supabase
        .from("bot_flow_qa")
        .select("*")
        .eq("flow_id", f.id)
        .order("position");
      const qaList = (qaRows as any[]) || [];
      const ids = qaList.map((q) => q.id);
      const [{ data: trigs }, { data: meds }] = await Promise.all([
        ids.length
          ? supabase.from("bot_flow_qa_triggers").select("*").in("qa_id", ids)
          : Promise.resolve({ data: [] as any[] }),
        ids.length
          ? supabase.from("bot_flow_qa_media").select("*").in("qa_id", ids).order("position")
          : Promise.resolve({ data: [] as any[] }),
      ]);
      setQas(
        qaList.map((q) => ({
          ...q,
          triggers: (trigs as Trigger[] || []).filter((t) => t.qa_id === q.id),
          medias: (meds as Media[] || []).filter((m) => m.qa_id === q.id),
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (userId) loadAll(userId);
  }, [userId, loadAll]);

  const updateFlow = async (patch: Partial<Flow>) => {
    if (!flow) return;
    const next = { ...flow, ...patch };
    setFlow(next);
    const { error } = await supabase.from("bot_flows").update(patch).eq("id", flow.id);
    if (error) toast.error("Erro ao salvar fluxo");
  };

  const addQA = async (opts?: Partial<QA>) => {
    if (!flow) return;
    const nextPos = (qas[qas.length - 1]?.position ?? -1) + 1;
    const { data, error } = await supabase
      .from("bot_flow_qa")
      .insert({
        flow_id: flow.id,
        position: nextPos,
        intent_name: opts?.intent_name ?? "Nova pergunta",
        is_opening: opts?.is_opening ?? false,
        is_closing: opts?.is_closing ?? false,
        text_response: opts?.text_response ?? null,
      })
      .select()
      .single();
    if (error) return toast.error("Erro ao adicionar");
    setQas([...qas, { ...(data as any), triggers: [], medias: [] }]);
  };

  const updateQA = async (id: string, patch: Partial<QA>) => {
    setQas((cur) => cur.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    const { triggers, medias, ...rest } = patch as any;
    if (Object.keys(rest).length) {
      await supabase.from("bot_flow_qa").update(rest).eq("id", id);
    }
  };

  const deleteQA = async (id: string) => {
    if (!confirm("Excluir esta pergunta?")) return;
    await supabase.from("bot_flow_qa").delete().eq("id", id);
    setQas((cur) => cur.filter((q) => q.id !== id));
  };

  const moveQA = async (id: string, dir: -1 | 1) => {
    const idx = qas.findIndex((q) => q.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= qas.length) return;
    const a = qas[idx], b = qas[swap];
    const newQas = [...qas];
    newQas[idx] = { ...b, position: a.position };
    newQas[swap] = { ...a, position: b.position };
    setQas(newQas);
    await Promise.all([
      supabase.from("bot_flow_qa").update({ position: b.position }).eq("id", a.id),
      supabase.from("bot_flow_qa").update({ position: a.position }).eq("id", b.id),
    ]);
  };

  const addTrigger = async (qa: QA, phrase: string) => {
    const p = phrase.trim();
    if (!p) return;
    const { data, error } = await supabase
      .from("bot_flow_qa_triggers")
      .insert({ qa_id: qa.id, phrase: p })
      .select()
      .single();
    if (error) return toast.error("Erro");
    setQas((cur) => cur.map((q) => (q.id === qa.id ? { ...q, triggers: [...q.triggers, data as Trigger] } : q)));
  };
  const removeTrigger = async (qa: QA, t: Trigger) => {
    if (!t.id) return;
    await supabase.from("bot_flow_qa_triggers").delete().eq("id", t.id);
    setQas((cur) => cur.map((q) => (q.id === qa.id ? { ...q, triggers: q.triggers.filter((x) => x.id !== t.id) } : q)));
  };

  const addMedia = async (qa: QA, kind: "audio" | "video") => {
    const pos = qa.medias.length;
    const { data, error } = await supabase
      .from("bot_flow_qa_media")
      .insert({ qa_id: qa.id, position: pos, media_kind: kind, slot_key: null, media_id: null })
      .select()
      .single();
    if (error) return toast.error("Erro");
    setQas((cur) => cur.map((q) => (q.id === qa.id ? { ...q, medias: [...q.medias, data as Media] } : q)));
  };
  const updateMedia = async (qa: QA, m: Media, patch: Partial<Media>) => {
    setQas((cur) =>
      cur.map((q) => (q.id === qa.id ? { ...q, medias: q.medias.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) } : q))
    );
    if (m.id) await supabase.from("bot_flow_qa_media").update(patch).eq("id", m.id);
  };
  const removeMedia = async (qa: QA, m: Media) => {
    if (!m.id) return;
    await supabase.from("bot_flow_qa_media").delete().eq("id", m.id);
    setQas((cur) => cur.map((q) => (q.id === qa.id ? { ...q, medias: q.medias.filter((x) => x.id !== m.id) } : q)));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando construtor…</p>
      </div>
    );
  }
  if (!flow) return null;

  const opening = qas.find((q) => q.is_opening);
  const closing = qas.find((q) => q.is_closing);
  const middle = qas.filter((q) => !q.is_opening && !q.is_closing);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="container max-w-5xl py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div className="flex-1">
            <Input
              value={flow.name}
              onChange={(e) => setFlow({ ...flow, name: e.target.value })}
              onBlur={(e) => updateFlow({ name: e.target.value })}
              className="text-lg font-semibold border-0 focus-visible:ring-0 px-0 h-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={flow.is_active} onCheckedChange={(v) => updateFlow({ is_active: v })} />
            <Label className="text-sm">Ativo</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={flow.strict_mode} onCheckedChange={(v) => updateFlow({ strict_mode: v })} />
            <Label className="text-sm">IA segue 100%</Label>
          </div>
        </div>
      </div>

      <div className="container max-w-5xl py-6 space-y-6">
        <Card className="p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground">
            💡 Cadastre as <strong>perguntas que os clientes costumam fazer</strong> e a <strong>resposta da IA</strong> (áudio, vídeo ou texto).
            Quando "IA segue 100%" está ligado, ao bater uma pergunta cadastrada, a IA envia exatamente as mídias da resposta.
          </p>
        </Card>

        {/* Abertura */}
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Abertura da conversa
          </h2>
          {opening ? (
            <QACard
              qa={opening}
              slots={slots}
                availableVideos={availableVideos}
              isFixed
              fixedLabel="Abertura (primeira mensagem)"
              onUpdate={(p) => updateQA(opening.id, p)}
              onDelete={() => deleteQA(opening.id)}
              onAddTrigger={(p) => addTrigger(opening, p)}
              onRemoveTrigger={(t) => removeTrigger(opening, t)}
              onAddMedia={(k) => addMedia(opening, k)}
              onUpdateMedia={(m, p) => updateMedia(opening, m, p)}
              onRemoveMedia={(m) => removeMedia(opening, m)}
            />
          ) : (
            <Button variant="outline" onClick={() => addQA({ intent_name: "Boas-vindas", is_opening: true, text_response: "Olá! Tudo bem? Pra começar, qual seu nome?" })}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar abertura
            </Button>
          )}
        </section>

        {/* Q&A no meio */}
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" /> Perguntas & Respostas
          </h2>
          <div className="space-y-4">
            {middle.map((qa, i) => (
              <QACard
                key={qa.id}
                qa={qa}
                slots={slots}
                availableVideos={availableVideos}
                onMoveUp={i > 0 ? () => moveQA(qa.id, -1) : undefined}
                onMoveDown={i < middle.length - 1 ? () => moveQA(qa.id, 1) : undefined}
                onUpdate={(p) => updateQA(qa.id, p)}
                onDelete={() => deleteQA(qa.id)}
                onAddTrigger={(p) => addTrigger(qa, p)}
                onRemoveTrigger={(t) => removeTrigger(qa, t)}
                onAddMedia={(k) => addMedia(qa, k)}
                onUpdateMedia={(m, p) => updateMedia(qa, m, p)}
                onRemoveMedia={(m) => removeMedia(qa, m)}
              />
            ))}
            <Button variant="outline" onClick={() => addQA()}>
              <Plus className="w-4 h-4 mr-1" /> Nova pergunta
            </Button>
          </div>
        </section>

        {/* Encerramento */}
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" /> Encerramento (cadastro)
          </h2>
          {closing ? (
            <QACard
              qa={closing}
              slots={slots}
              availableVideos={availableVideos}
              isFixed
              fixedLabel="Encerramento — envia o link de cadastro"
              onUpdate={(p) => updateQA(closing.id, p)}
              onDelete={() => deleteQA(closing.id)}
              onAddTrigger={(p) => addTrigger(closing, p)}
              onRemoveTrigger={(t) => removeTrigger(closing, t)}
              onAddMedia={(k) => addMedia(closing, k)}
              onUpdateMedia={(m, p) => updateMedia(closing, m, p)}
              onRemoveMedia={(m) => removeMedia(closing, m)}
            />
          ) : (
            <Button variant="outline" onClick={() => addQA({ intent_name: "Quero me cadastrar", is_closing: true, text_response: "Perfeito! Pra finalizar é só preencher seus dados aqui: {link_cadastro}" })}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar encerramento
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────

function QACard(props: {
  qa: QA;
  slots: Slot[];
  isFixed?: boolean;
  fixedLabel?: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onUpdate: (p: Partial<QA>) => void;
  onDelete: () => void;
  onAddTrigger: (phrase: string) => void;
  onRemoveTrigger: (t: Trigger) => void;
  onAddMedia: (kind: "audio" | "video") => void;
  onUpdateMedia: (m: Media, p: Partial<Media>) => void;
  onRemoveMedia: (m: Media) => void;
}) {
  const { qa, slots, isFixed, fixedLabel } = props;
  const [phraseInput, setPhraseInput] = useState("");
  const [name, setName] = useState(qa.intent_name);
  const [text, setText] = useState(qa.text_response ?? "");

  useEffect(() => setName(qa.intent_name), [qa.intent_name]);
  useEffect(() => setText(qa.text_response ?? ""), [qa.text_response]);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          {isFixed && <Badge variant="secondary" className="text-xs">{fixedLabel}</Badge>}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== qa.intent_name && props.onUpdate({ intent_name: name })}
            placeholder="Nome curto (ex.: Preço)"
            className="font-semibold"
          />
        </div>
        <div className="flex items-center gap-1">
          {props.onMoveUp && <Button size="icon" variant="ghost" onClick={props.onMoveUp}><ChevronUp className="w-4 h-4" /></Button>}
          {props.onMoveDown && <Button size="icon" variant="ghost" onClick={props.onMoveDown}><ChevronDown className="w-4 h-4" /></Button>}
          <Button size="icon" variant="ghost" onClick={props.onDelete}><Trash2 className="w-4 h-4 text-destructive" /></Button>
        </div>
      </div>

      {!isFixed && (
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">❓ Quando o cliente disser…</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {qa.triggers.map((t) => (
              <Badge key={t.id} variant="outline" className="gap-1 py-1">
                {t.phrase}
                <button onClick={() => props.onRemoveTrigger(t)} className="hover:text-destructive ml-1">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            <Input
              value={phraseInput}
              onChange={(e) => setPhraseInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && phraseInput.trim()) {
                  props.onAddTrigger(phraseInput);
                  setPhraseInput("");
                }
              }}
              placeholder="Adicionar variação + Enter"
              className="h-8 w-48"
            />
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">💬 A IA responde com…</Label>
        <div className="space-y-2 mt-2">
          {qa.medias.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
              <Badge>{i + 1}</Badge>
              <Badge variant="secondary">{m.media_kind === "audio" ? "🎙️ Áudio" : "🎬 Vídeo"}</Badge>
              <Select
                value={m.slot_key ?? ""}
                onValueChange={(v) => props.onUpdateMedia(m, { slot_key: v })}
              >
                <SelectTrigger className="flex-1"><SelectValue placeholder="Escolha o slot…" /></SelectTrigger>
                <SelectContent>
                  {slots.map((s) => (
                    <SelectItem key={s.slot_key} value={s.slot_key}>
                      {s.label} {s.video_url ? "🎬" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" onClick={() => props.onRemoveMedia(m)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => props.onAddMedia("audio")}>
              <Plus className="w-3 h-3 mr-1" /> Áudio
            </Button>
            <Button size="sm" variant="outline" onClick={() => props.onAddMedia("video")}>
              <Plus className="w-3 h-3 mr-1" /> Vídeo
            </Button>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">📝 Texto opcional (junto com a mídia)</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== (qa.text_response ?? "") && props.onUpdate({ text_response: text || null })}
          placeholder="Ex.: 'Veja esse vídeo rapidinho 👇' — use {nome} ou {link_cadastro}"
          className="mt-2"
          rows={2}
        />
      </div>
    </Card>
  );
}
