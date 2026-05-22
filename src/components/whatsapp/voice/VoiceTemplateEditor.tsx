import { useMemo, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Play, Loader2, User, Mic, KeyRound, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { VoiceClipRecorder } from "./VoiceClipRecorder";
import type { VoiceTemplate, VoiceNameClip } from "@/hooks/useVoiceTemplates";

interface Props {
  consultantId: string;
  template: VoiceTemplate;
  clips: VoiceNameClip[];
  onUpdate: (id: string, patch: any) => Promise<void>;
  onAddBlock: (templateId: string, kind: "fixed_audio" | "name_slot", audioUrl?: string | null) => Promise<void>;
  onUpdateBlockAudio: (blockId: string, templateId: string, audioUrl: string) => Promise<void>;
  onDeleteBlock: (blockId: string, templateId: string) => Promise<void>;
  onMoveBlock: (templateId: string, blockId: string, dir: -1 | 1) => Promise<void>;
  onRender: (templateId: string, name?: string) => Promise<{ url?: string; error?: string; missing_name?: string }>;
  onUpsertNameClip: (display: string, audioUrl: string) => Promise<void>;
}

export function VoiceTemplateEditor({
  consultantId, template, clips, onUpdate,
  onAddBlock, onUpdateBlockAudio, onDeleteBlock, onMoveBlock, onRender, onUpsertNameClip,
}: Props) {
  const [name, setName] = useState(template.name);
  const [shortcut, setShortcut] = useState(template.shortcut || "");
  const [description, setDescription] = useState(template.description || "");
  const [previewName, setPreviewName] = useState(clips[0]?.name_display || "Ana");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [pendingNameRecord, setPendingNameRecord] = useState<string | null>(null);

  const blocks = useMemo(() => [...(template.blocks || [])].sort((a, b) => a.position - b.position), [template.blocks]);
  const hasNameSlot = blocks.some((b) => b.kind === "name_slot");

  async function saveMeta() {
    await onUpdate(template.id, {
      name: name.trim() || template.name,
      shortcut: shortcut.trim() || null,
      description: description.trim() || null,
    });
    toast.success("Template atualizado");
  }

  async function handlePreview() {
    setRendering(true);
    setPreviewUrl(null);
    try {
      const res = await onRender(template.id, hasNameSlot ? previewName : undefined);
      if (res.url) {
        setPreviewUrl(res.url);
      } else if (res.error === "name_not_recorded") {
        setPendingNameRecord(res.missing_name || previewName);
        toast.warning(`Você ainda não gravou o nome "${res.missing_name}". Grave agora aqui embaixo.`);
      } else {
        toast.error(res.error || "Falha ao costurar áudio");
      }
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="space-y-4 border border-border rounded-xl p-4 bg-card/50">
      {/* metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Nome do template</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Boas-vindas personalizada" />
        </div>
        <div>
          <Label className="text-xs">Atalho rápido</Label>
          <Input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="/voz-ola" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Descrição (opcional)</Label>
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quando usar este template" />
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={saveMeta}>Salvar dados</Button>
      </div>

      {/* timeline */}
      <div>
        <Label className="text-xs flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Linha do tempo do áudio
        </Label>
        <p className="text-[11px] text-muted-foreground mb-2">
          Grave as partes fixas (começo, meio, final) e insira o slot do nome onde a pessoa será chamada.
          O sistema costura tudo num áudio único.
        </p>

        <div className="flex flex-wrap gap-2 items-stretch">
          {blocks.length === 0 && (
            <div className="text-xs text-muted-foreground p-3 border border-dashed border-border rounded w-full text-center">
              Nenhum bloco ainda. Adicione abaixo.
            </div>
          )}

          {blocks.map((b, idx) => (
            <div key={b.id} className="flex-1 min-w-[180px] max-w-[260px] border border-border rounded-lg p-2 bg-background/50 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant={b.kind === "name_slot" ? "default" : "secondary"} className="text-[10px]">
                  {b.kind === "name_slot" ? <><User className="w-3 h-3 mr-1" /> Nome do lead</> : <><Mic className="w-3 h-3 mr-1" /> Áudio fixo</>}
                </Badge>
                <div className="flex gap-0.5">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMoveBlock(template.id, b.id, -1)} disabled={idx === 0}><ArrowUp className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMoveBlock(template.id, b.id, 1)} disabled={idx === blocks.length - 1}><ArrowDown className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onDeleteBlock(b.id, template.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>

              {b.kind === "fixed_audio" ? (
                <>
                  {b.audio_url ? (
                    <audio src={b.audio_url} controls className="w-full h-8" />
                  ) : (
                    <p className="text-[10px] text-amber-500">Sem áudio gravado</p>
                  )}
                  <VoiceClipRecorder
                    consultantId={consultantId}
                    slug={`voz-${template.id.slice(0,8)}-bloco-${b.position}`}
                    idleLabel={b.audio_url ? "Regravar" : "Gravar"}
                    onUploaded={(url) => onUpdateBlockAudio(b.id, template.id, url)}
                  />
                </>
              ) : (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-primary" />
                  Palavra-chave: <code className="text-primary">{`{{nome}}`}</code>
                  <br />Será substituído pelo nome gravado do lead.
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={() => onAddBlock(template.id, "fixed_audio")}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Áudio fixo
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAddBlock(template.id, "name_slot")}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Slot do nome
          </Button>
        </div>
      </div>

      {/* preview */}
      <div className="border-t border-border pt-3 space-y-2">
        <Label className="text-xs flex items-center gap-1"><Play className="w-3.5 h-3.5" /> Pré-visualizar emendado</Label>
        <div className="flex gap-2">
          {hasNameSlot && (
            <Input
              value={previewName}
              onChange={(e) => setPreviewName(e.target.value)}
              placeholder="Nome do lead (ex: Ana)"
              className="flex-1"
            />
          )}
          <Button size="sm" onClick={handlePreview} disabled={rendering || blocks.length === 0}>
            {rendering ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Tocar emendado
          </Button>
        </div>
        {previewUrl && <audio src={previewUrl} controls className="w-full h-9" />}

        {pendingNameRecord && (
          <div className="border border-amber-500/40 rounded p-2 bg-amber-500/5 space-y-2">
            <p className="text-xs text-amber-500">
              Grave o nome <strong>"{pendingNameRecord}"</strong> agora:
            </p>
            <VoiceClipRecorder
              consultantId={consultantId}
              slug={`voz-nome-${pendingNameRecord.toLowerCase()}`}
              idleLabel={`Gravar "${pendingNameRecord}"`}
              onUploaded={async (url) => {
                await onUpsertNameClip(pendingNameRecord, url);
                setPendingNameRecord(null);
                toast.success(`Nome "${pendingNameRecord}" gravado. Toque em "Tocar emendado" de novo.`);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
