import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpCircle, Plus, Trash2, X, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

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

export default function FaqSection({ flowId }: { flowId: string }) {
  const [qas, setQas] = useState<QA[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [availableVideos, setAvailableVideos] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: slotsRow }, { data: videoRows }, { data: qaRows }] = await Promise.all([
      supabase.from("ai_agent_slots").select("slot_key, label, video_url").eq("active", true).order("position"),
      supabase
        .from("ai_media_library")
        .select("id, label, url")
        .eq("kind", "video")
        .eq("active", true)
        .not("url", "is", null)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("bot_flow_qa").select("*").eq("flow_id", flowId).order("position"),
    ]);
    setSlots((slotsRow as Slot[]) || []);
    setAvailableVideos(((videoRows as LibraryVideo[]) || []).filter((v) => !!v.url));

    const qaList = (qaRows as any[]) || [];
    const ids = qaList.map((q) => q.id);
    const [{ data: trigs }, { data: meds }] = await Promise.all([
      ids.length ? supabase.from("bot_flow_qa_triggers").select("*").in("qa_id", ids) : Promise.resolve({ data: [] as any[] }),
      ids.length ? supabase.from("bot_flow_qa_media").select("*").in("qa_id", ids).order("position") : Promise.resolve({ data: [] as any[] }),
    ]);
    setQas(
      qaList
        .filter((q) => !q.is_opening && !q.is_closing) // só FAQ do meio
        .map((q) => ({
          ...q,
          triggers: ((trigs as Trigger[]) || []).filter((t) => t.qa_id === q.id),
          medias: ((meds as Media[]) || []).filter((m) => m.qa_id === q.id),
        }))
    );
    setLoading(false);
  }, [flowId]);

  useEffect(() => { load(); }, [load]);

  const addQA = async () => {
    const nextPos = (qas[qas.length - 1]?.position ?? -1) + 1;
    const { data, error } = await supabase
      .from("bot_flow_qa")
      .insert({ flow_id: flowId, position: nextPos, intent_name: "Nova dúvida", is_opening: false, is_closing: false, text_response: null })
      .select().single();
    if (error) return toast.error("Erro ao adicionar");
    setQas([...qas, { ...(data as any), triggers: [], medias: [] }]);
  };

  const updateQA = async (id: string, patch: Partial<QA>) => {
    setQas((cur) => cur.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    const { triggers: _t, medias: _m, ...rest } = patch as any;
    if (Object.keys(rest).length) {
      const { error } = await supabase.from("bot_flow_qa").update(rest).eq("id", id);
      if (error) toast.error("Erro ao salvar");
    }
  };

  const deleteQA = async (id: string) => {
    if (!confirm("Excluir esta dúvida?")) return;
    await supabase.from("bot_flow_qa").delete().eq("id", id);
    setQas((cur) => cur.filter((q) => q.id !== id));
  };

  const moveQA = async (id: string, dir: -1 | 1) => {
    const idx = qas.findIndex((q) => q.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= qas.length) return;
    const a = qas[idx], b = qas[swap];
    const next = [...qas];
    next[idx] = { ...b, position: a.position };
    next[swap] = { ...a, position: b.position };
    setQas(next);
    await Promise.all([
      supabase.from("bot_flow_qa").update({ position: b.position }).eq("id", a.id),
      supabase.from("bot_flow_qa").update({ position: a.position }).eq("id", b.id),
    ]);
  };

  const addTrigger = async (qa: QA, phrase: string) => {
    const p = phrase.trim();
    if (!p) return;
    const { data, error } = await supabase
      .from("bot_flow_qa_triggers").insert({ qa_id: qa.id, phrase: p }).select().single();
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
      .select().single();
    if (error) return toast.error("Erro");
    setQas((cur) => cur.map((q) => (q.id === qa.id ? { ...q, medias: [...q.medias, data as Media] } : q)));
  };
  const updateMedia = async (qa: QA, m: Media, patch: Partial<Media>) => {
    setQas((cur) => cur.map((q) => (q.id === qa.id ? { ...q, medias: q.medias.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) } : q)));
    if (m.id) await supabase.from("bot_flow_qa_media").update(patch).eq("id", m.id);
  };
  const removeMedia = async (qa: QA, m: Media) => {
    if (!m.id) return;
    await supabase.from("bot_flow_qa_media").delete().eq("id", m.id);
    setQas((cur) => cur.map((q) => (q.id === qa.id ? { ...q, medias: q.medias.filter((x) => x.id !== m.id) } : q)));
  };

  return (
    <Card className="p-4 sm:p-5 border-primary/20 bg-card/40">
      <div className="flex items-start gap-2 mb-3">
        <HelpCircle className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h2 className="text-base font-semibold">Perguntas & Respostas</h2>
          <p className="text-xs text-muted-foreground">
            Quando o lead perguntar algo no meio do cadastro, a Camila responde isto e <strong>volta para o passo atual</strong> automaticamente.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="space-y-3">
          {qas.map((qa, i) => (
            <QACard
              key={qa.id}
              qa={qa}
              slots={slots}
              availableVideos={availableVideos}
              onMoveUp={i > 0 ? () => moveQA(qa.id, -1) : undefined}
              onMoveDown={i < qas.length - 1 ? () => moveQA(qa.id, 1) : undefined}
              onUpdate={(p) => updateQA(qa.id, p)}
              onDelete={() => deleteQA(qa.id)}
              onAddTrigger={(p) => addTrigger(qa, p)}
              onRemoveTrigger={(t) => removeTrigger(qa, t)}
              onAddMedia={(k) => addMedia(qa, k)}
              onUpdateMedia={(m, p) => updateMedia(qa, m, p)}
              onRemoveMedia={(m) => removeMedia(qa, m)}
            />
          ))}
          {qas.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nenhuma dúvida cadastrada ainda.</p>
          )}
          <Button variant="outline" onClick={addQA} className="w-full">
            <Plus className="w-4 h-4 mr-1" /> Nova dúvida
          </Button>
        </div>
      )}
    </Card>
  );
}

function QACard(props: {
  qa: QA;
  slots: Slot[];
  availableVideos: LibraryVideo[];
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
  const { qa, slots, availableVideos } = props;
  const [phraseInput, setPhraseInput] = useState("");
  const [name, setName] = useState(qa.intent_name);
  const [text, setText] = useState(qa.text_response ?? "");

  useEffect(() => setName(qa.intent_name), [qa.intent_name]);
  useEffect(() => setText(qa.text_response ?? ""), [qa.text_response]);

  return (
    <Card className="p-4 space-y-3 bg-background/60">
      <div className="flex items-start gap-2">
        <div className="flex-1">
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
                e.preventDefault();
                props.onAddTrigger(phraseInput);
                setPhraseInput("");
              }
            }}
            placeholder="Palavra-chave + Enter"
            className="h-8 w-48"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">💬 Resposta</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== (qa.text_response ?? "") && props.onUpdate({ text_response: text || null })}
          placeholder="Ex.: 'É super seguro! A iGreen é uma empresa autorizada…' — use {{nome}}"
          className="mt-2"
          rows={3}
        />
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">🎙️ Mídias opcionais</Label>
        <div className="space-y-2 mt-2">
          {qa.medias.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
              <Badge>{i + 1}</Badge>
              <Badge variant="secondary">{m.media_kind === "audio" ? "🎙️ Áudio" : "🎬 Vídeo"}</Badge>
              {m.media_kind === "video" ? (
                <Select value={m.media_id ?? ""} onValueChange={(v) => props.onUpdateMedia(m, { media_id: v, slot_key: null })}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Escolha o vídeo…" /></SelectTrigger>
                  <SelectContent>
                    {availableVideos.map((v) => (<SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={m.slot_key ?? ""} onValueChange={(v) => props.onUpdateMedia(m, { slot_key: v, media_id: null })}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Escolha o áudio…" /></SelectTrigger>
                  <SelectContent>
                    {slots.map((s) => (<SelectItem key={s.slot_key} value={s.slot_key}>{s.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}
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
    </Card>
  );
}
