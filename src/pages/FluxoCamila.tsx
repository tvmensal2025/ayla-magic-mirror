import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, MessageSquare, Video, ArrowDown, Sparkles, UserCheck, FileText, Pencil, FlaskConical, X } from "lucide-react";
import { toast } from "sonner";
import StepMediaPanel from "@/components/admin/fluxo/StepMediaPanel";

// ---------------------------------------------------------------------------
// Espelha 1-para-1 supabase/functions/whapi-webhook/handlers/conversational/state-machine.ts
// Se o state-machine mudar, ajuste aqui também.
// ---------------------------------------------------------------------------
type TemplateRef = { step_key: string; template_key: string; titulo: string; ajuda: string };
type Branch = { quando: string; vai_para: string };
type Passo = {
  id: string;
  numero: number;
  titulo: string;
  resumo: string;
  icone: "msg" | "video" | "sparkle" | "user" | "file";
  video_slot?: { key: string; descricao: string };
  templates: TemplateRef[];
  ramificacoes: Branch[];
  /** slot_keys da ai_media_library aceitos neste passo (áudio/imagem/vídeo) */
  slots: string[];
};

const FLUXO: Passo[] = [
  {
    id: "welcome",
    numero: 1,
    titulo: "Boas-vindas",
    resumo: "Primeira mensagem que a Camila envia quando o lead chama no WhatsApp.",
    icone: "sparkle",
    templates: [
      { step_key: "welcome", template_key: "saudacao", titulo: "Mensagem de saudação", ajuda: "Use {{nome}} e {{representante}} para personalizar." },
    ],
    ramificacoes: [
      { quando: "Lead responde 'oi' / 'sim' / qualquer saudação", vai_para: "Passo 2 — Vídeo + qualificação" },
    ],
    slots: ["boas_vindas"],
  },
  {
    id: "qualificacao",
    numero: 2,
    titulo: "Vídeo explicativo + pergunta da conta",
    resumo: "Manda o vídeo principal e pergunta o valor da conta de luz.",
    icone: "video",
    video_slot: { key: "explainer", descricao: "Vídeo enviado automaticamente antes da pergunta." },
    templates: [
      { step_key: "qualificacao", template_key: "pergunta_conta", titulo: "Pergunta sobre a conta", ajuda: "Pergunta direta para qualificar o lead." },
    ],
    ramificacoes: [
      { quando: "Lead diz 'já assisti'", vai_para: "Passo 3 — Check-in" },
      { quando: "Lead responde qualquer outra coisa", vai_para: "Repete a pergunta" },
    ],
    slots: ["explainer", "como_funciona"],
  },
  {
    id: "checkin_pos_video",
    numero: 3,
    titulo: "Check-in pós-vídeo",
    resumo: "Confere se o lead viu o vídeo e o que ele achou.",
    icone: "msg",
    templates: [
      { step_key: "checkin_pos_video", template_key: "reforco_checkin", titulo: "Reforço do check-in", ajuda: "Mensagem que tira o lead da inércia." },
      { step_key: "checkin_pos_video", template_key: "pedir_conta", titulo: "Pedir conta de luz (entra no Cadastro)", ajuda: "Disparada quando o lead já quer cadastrar." },
    ],
    ramificacoes: [
      { quando: "Lead diz 'sim, gostei'", vai_para: "Passo 4 — Pitch do Conexão Club" },
      { quando: "Lead diz 'tenho dúvida'", vai_para: "Passo 5 — Tirar dúvidas" },
      { quando: "Lead diz 'não / depois'", vai_para: "Repete o reforço" },
    ],
    slots: ["checkin"],
  },
  {
    id: "pitch_conexao_club",
    numero: 4,
    titulo: "Pitch do Conexão Club",
    resumo: "Apresenta o cashback e o programa Conexão Club.",
    icone: "video",
    video_slot: { key: "club", descricao: "Vídeo do Conexão Club." },
    templates: [
      { step_key: "pitch_conexao_club", template_key: "apresentar", titulo: "Mensagem do Club", ajuda: "Texto que acompanha o vídeo do Club." },
    ],
    ramificacoes: [
      { quando: "Sempre depois do vídeo", vai_para: "Passo 5 — Tirar dúvidas" },
    ],
    slots: ["club"],
  },
  {
    id: "duvidas_pos_club",
    numero: 5,
    titulo: "Tirar dúvidas",
    resumo: "Última etapa antes do cadastro: responde dúvidas finais.",
    icone: "msg",
    templates: [
      { step_key: "duvidas_pos_club", template_key: "pode_perguntar", titulo: "Convite para perguntar", ajuda: "Sinaliza que está aberto para qualquer dúvida." },
      { step_key: "duvidas_pos_club", template_key: "rumo_cadastro", titulo: "Empurrão para o cadastro", ajuda: "Disparada quando o lead reluta em seguir." },
    ],
    ramificacoes: [
      { quando: "Lead diz 'quero seguir'", vai_para: "FIM — entra no Cadastro" },
      { quando: "Lead diz 'não quero'", vai_para: "Mensagem de empurrão e segue ouvindo" },
    ],
    slots: ["duvidas", "objecao_preco", "objecao_distribuidora", "prova_social", "fazenda_solar"],
  },
  {
    id: "cadastro",
    numero: 6,
    titulo: "Cadastro (fluxo antigo, intacto)",
    resumo: "A Camila pede a foto da conta de luz e segue o cadastro normal (OCR + portal iGreen).",
    icone: "file",
    templates: [],
    ramificacoes: [],
    slots: ["cadastro_pedir_conta"],
  },
];

const ATALHOS = [
  { quando: "Em qualquer passo, o lead diz 'quero cadastrar'", vai_para: "Pula direto para o Cadastro" },
  { quando: "Em qualquer passo, o lead diz 'quero falar com humano'", vai_para: "Marca como 'Aguardando humano' e o bot silencia" },
];

const FALLBACK = { step_key: "fallback", template_key: "nao_entendi", titulo: "Mensagem quando a Camila não entende", ajuda: "Resposta padrão quando nenhuma intenção bate." };
const HUMANO = { step_key: "aguardando_humano", template_key: "avisado", titulo: "Mensagem ao acionar humano", ajuda: "Mostrada quando o lead pede um humano." };

type BotMessage = { id: string; step_key: string; template_key: string; variant: string; text: string; active: boolean };

function IconFor({ tipo }: { tipo: Passo["icone"] }) {
  const cls = "h-5 w-5";
  if (tipo === "video") return <Video className={cls} />;
  if (tipo === "sparkle") return <Sparkles className={cls} />;
  if (tipo === "user") return <UserCheck className={cls} />;
  if (tipo === "file") return <FileText className={cls} />;
  return <MessageSquare className={cls} />;
}

export default function FluxoCamila() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [globalAtivo, setGlobalAtivo] = useState(false);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [editing, setEditing] = useState<TemplateRef | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testCount, setTestCount] = useState(0);
  const [stepOrders, setStepOrders] = useState<Record<string, ("audio" | "image" | "video" | "text")[]>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        navigate("/auth");
        return;
      }
      const [{ data: cons }, { data: msgs }, { count }] = await Promise.all([
        supabase.from("consultants").select("conversational_flow_enabled, flow_step_media_order").eq("id", uid).maybeSingle(),
        supabase.from("bot_messages").select("id, step_key, template_key, variant, text, active").eq("active", true),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("consultant_id", uid).eq("conversational_flow_enabled", true),
      ]);
      setGlobalAtivo(!!cons?.conversational_flow_enabled);
      setStepOrders((cons?.flow_step_media_order as Record<string, ("audio" | "image" | "video" | "text")[]>) ?? {});
      setMessages((msgs as BotMessage[]) ?? []);
      setTestCount(count ?? 0);
    })();
  }, [navigate]);

  const msgIndex = useMemo(() => {
    const m = new Map<string, BotMessage>();
    for (const x of messages) m.set(`${x.step_key}::${x.template_key}::${x.variant ?? "default"}`, x);
    return m;
  }, [messages]);

  function findMsg(step_key: string, template_key: string): BotMessage | undefined {
    return msgIndex.get(`${step_key}::${template_key}::default`)
      ?? messages.find(m => m.step_key === step_key && m.template_key === template_key);
  }

  async function toggleGlobal(v: boolean) {
    if (!userId) return;
    setGlobalAtivo(v);
    const { error } = await supabase.from("consultants").update({ conversational_flow_enabled: v }).eq("id", userId);
    if (error) {
      toast.error("Não consegui salvar: " + error.message);
      setGlobalAtivo(!v);
    } else {
      toast.success(v ? "Fluxo ativo para TODOS os seus leads" : "Fluxo desligado (só leads de teste)");
    }
  }

  function openEdit(t: TemplateRef) {
    const cur = findMsg(t.step_key, t.template_key);
    setEditing(t);
    setDraft(cur?.text ?? "");
  }

  async function saveEdit() {
    if (!editing) return;
    const cur = findMsg(editing.step_key, editing.template_key);
    setSaving(true);
    let error;
    if (cur) {
      const r = await supabase.from("bot_messages").update({ text: draft }).eq("id", cur.id).select().maybeSingle();
      error = r.error;
      if (!error && r.data) setMessages(prev => prev.map(m => m.id === r.data!.id ? { ...m, text: draft } : m));
    } else {
      const r = await supabase.from("bot_messages").insert({
        step_key: editing.step_key, template_key: editing.template_key, variant: "default", text: draft, active: true,
      }).select().maybeSingle();
      error = r.error;
      if (!error && r.data) setMessages(prev => [...prev, r.data as BotMessage]);
    }
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else { toast.success("Mensagem salva"); setEditing(null); }
  }

  async function addTestNumber() {
    if (!userId) return;
    const phone = testPhone.replace(/\D/g, "");
    if (phone.length < 10) { toast.error("Telefone inválido"); return; }
    const { data, error } = await supabase
      .from("customers").update({ conversational_flow_enabled: true })
      .eq("consultant_id", userId).eq("phone_whatsapp", phone).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) { toast.error("Nenhum lead encontrado com esse número"); return; }
    toast.success(`Fluxo ligado para ${data.length} lead(s)`);
    setTestCount(c => c + data.length);
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold truncate">Fluxo da Camila</h1>
            <p className="text-xs text-muted-foreground">Passo a passo do que a Camila faz no WhatsApp</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Configuração global */}
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
              <span className="text-sm">
                Em teste com <Badge variant="secondary">{testCount}</Badge> número(s)
              </span>
            </div>
            <div className="flex gap-2">
              {testCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearTestNumbers}>
                  <X className="h-4 w-4 mr-1" /> Limpar testes
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
                Testar com 1 número
              </Button>
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

        {/* Entrada */}
        <div className="text-center text-sm text-muted-foreground">
          (0) Lead manda a primeira mensagem no WhatsApp
        </div>
        <div className="flex justify-center"><ArrowDown className="h-5 w-5 text-muted-foreground" /></div>

        {/* Passos */}
        {FLUXO.map((passo, idx) => (
          <div key={passo.id}>
            <Card className="p-4 sm:p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <IconFor tipo={passo.icone} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Passo {passo.numero}</div>
                  <h3 className="text-base sm:text-lg font-semibold">{passo.titulo}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{passo.resumo}</p>
                </div>
              </div>

              {passo.video_slot && (
                <div className="mb-3 rounded-lg border border-border/60 bg-muted/30 p-3 flex items-start gap-3">
                  <Video className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Vídeo: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{passo.video_slot.key}</code></div>
                    <div className="text-xs text-muted-foreground">{passo.video_slot.descricao}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Para trocar este vídeo, vá em <button onClick={() => navigate("/assistente")} className="underline text-primary">Assistente IA</button>.
                    </div>
                  </div>
                </div>
              )}

              {passo.templates.map(t => {
                const cur = findMsg(t.step_key, t.template_key);
                return (
                  <div key={t.template_key} className="mb-3 rounded-lg border border-border/60 p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{t.titulo}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                    </div>
                    <div className="text-sm bg-muted/40 rounded p-2 whitespace-pre-wrap break-words text-muted-foreground italic">
                      {cur?.text || <span className="text-destructive not-italic">⚠ Sem mensagem cadastrada — clique em Editar.</span>}
                    </div>
                  </div>
                );
              })}

              {userId && passo.slots.length > 0 && (
                <StepMediaPanel
                  consultantId={userId}
                  stepKey={passo.id}
                  slotKeys={passo.slots}
                  initialOrder={stepOrders[passo.id]}
                  onOrderChange={(o) => setStepOrders(prev => ({ ...prev, [passo.id]: o }))}
                />
              )}

              {passo.ramificacoes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/60">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Para onde vai depois</div>
                  <ul className="space-y-1.5 text-sm">
                    {passo.ramificacoes.map((r, i) => (
                      <li key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="text-muted-foreground">{r.quando}</span>
                        <span className="hidden sm:inline text-primary">→</span>
                        <span className="font-medium">{r.vai_para}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
            {idx < FLUXO.length - 1 && (
              <div className="flex justify-center my-2"><ArrowDown className="h-5 w-5 text-muted-foreground" /></div>
            )}
          </div>
        ))}

        {/* Mensagens transversais */}
        <Card className="p-4 sm:p-5">
          <h3 className="text-base font-semibold mb-3">Mensagens auxiliares</h3>
          {[FALLBACK, HUMANO].map(t => {
            const cur = findMsg(t.step_key, t.template_key);
            return (
              <div key={t.template_key} className="mb-3 rounded-lg border border-border/60 p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium">{t.titulo}</span>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                </div>
                <div className="text-sm bg-muted/40 rounded p-2 whitespace-pre-wrap break-words text-muted-foreground italic">
                  {cur?.text || <span className="text-destructive not-italic">⚠ Sem mensagem cadastrada.</span>}
                </div>
              </div>
            );
          })}
        </Card>
      </main>

      {/* Modal editar mensagem */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.titulo}</DialogTitle>
            <DialogDescription>{editing?.ajuda}</DialogDescription>
          </DialogHeader>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} placeholder="Escreva a mensagem da Camila aqui..." />
          <div className="text-xs text-muted-foreground">
            Variáveis disponíveis: <code>{"{{nome}}"}</code>, <code>{"{{representante}}"}</code>, <code>{"{{telefone}}"}</code>, <code>{"{{valor_conta}}"}</code>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving || !draft.trim()}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal teste por número */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Testar com 1 número</DialogTitle>
            <DialogDescription>Liga o novo fluxo só para esse lead, sem afetar os outros.</DialogDescription>
          </DialogHeader>
          <Input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="Ex: 5511989000650"
            inputMode="numeric"
          />
          <p className="text-xs text-muted-foreground">O lead já precisa existir na sua base. Use o número com DDD (e DDI 55 se possível).</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Cancelar</Button>
            <Button onClick={addTestNumber}>Ativar para esse número</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
