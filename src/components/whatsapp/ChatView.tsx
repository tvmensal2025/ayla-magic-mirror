import { useEffect, useRef, useState, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { useMessages } from "@/hooks/useMessages";
import { sendWhatsAppMessage, resolveRecipient } from "@/services/messageSender";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { MessageTemplate } from "@/types/whatsapp";
import type { ChatItem } from "@/hooks/useChats";
import { Loader2, MessageSquareText, UserPlus, UserCheck, KanbanSquare, RotateCcw, Gamepad2 } from "lucide-react";
import { resetLeadConversation } from "@/services/resetConversation";
import { CaptureSheet } from "@/components/captacao/CaptureSheet";
import { useCaptureSession } from "@/hooks/useCaptureSession";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createLogger } from "@/lib/logger";
import { autoTakeoverByPhone, takeoverByPhoneDetailed, undoTakeoverByPhone } from "@/lib/whatsapp/auto-takeover";
import { ToastAction } from "@/components/ui/toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";

const logger = createLogger("ChatView");

interface ChatViewProps {
  instanceName: string;
  chat: ChatItem | null;
  templates: MessageTemplate[];
  consultantId: string;
  initialMessage?: string | null;
  isWhapi?: boolean;
}

export function ChatView({ instanceName, chat, templates, consultantId, initialMessage, isWhapi = false }: ChatViewProps) {
  const { messages, isLoading, sendMessage, loadMedia, resolveSendTargetJid, refetch } = useMessages(
    instanceName,
    chat?.remoteJid || null,
    chat?.sendTargetJid || null,
    isWhapi,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [isCustomer, setIsCustomer] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [kanbanStages, setKanbanStages] = useState<Tables<"kanban_stages">[]>([]);
  const [sendingToCrm, setSendingToCrm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const { customer: captureCustomer, filledCount, totalFields } = useCaptureSession(customerId);
  // Captação é SEMPRE manual (default global) — incompleto = pendente.
  const captureIncomplete = !!captureCustomer && !(captureCustomer.name && captureCustomer.cpf && captureCustomer.email && Number(captureCustomer.electricity_bill_value || 0) > 0);
  const captureActive = captureOpen || captureIncomplete;

  // Auto-abre o painel quando o lead ainda não completou cadastro (uma vez por sessão).
  useEffect(() => {
    if (!customerId || !captureCustomer) return;
    if (captureCustomer.name && captureCustomer.cpf) return;
    const key = `cap-auto-open-${customerId}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    setCaptureOpen(true);
  }, [customerId, captureCustomer]);

  const toggleCapture = useCallback(() => {
    if (!customerId) {
      toast({ title: "Aguarde", description: "Estamos preparando o lead...", variant: "destructive" });
      return;
    }
    setCaptureOpen(true);
    // Garante que o modo manual fique persistido (caso algum legado tenha voltado p/ auto)
    void supabase.from("customers")
      .update({ capture_mode: "manual", capture_started_at: new Date().toISOString() })
      .eq("id", customerId);
  }, [customerId, toast]);


  const handleReset = useCallback(async () => {
    if (!chat) return;
    setResetting(true);
    const r = await resetLeadConversation({ consultantId, remoteJid: chat.remoteJid });
    setResetting(false);
    if (r.ok) {
      // Refresh chat panel + customer card + CRM card after wipe
      await refetch();
      toast({
        title: "Conversa zerada",
        description: "Histórico oculto no painel e dados do lead resetados. O bot vai começar do zero.",
      });
    } else {
      toast({ title: "Erro ao zerar", description: (r as { error: string }).error, variant: "destructive" });
    }
  }, [chat, consultantId, refetch, toast]);

  // Fetch kanban stages
  useEffect(() => {
    supabase
      .from("kanban_stages")
      .select("*")
      .eq("consultant_id", consultantId)
      .order("position")
      .then(({ data }) => {
        if (data && data.length > 0) setKanbanStages(data);
      });
  }, [consultantId]);

  // B10 — takeover com Desfazer (10s). Só notifica quando foi NOVO (não em mídias subsequentes).
  const takeoverWithUndo = useCallback(async (phone: string, reason: "humano_assumiu_audio" | "humano_assumiu_midia" | "humano_assumiu") => {
    const r = await takeoverByPhoneDetailed(phone, reason);
    if (r === "new") {
      toast({
        title: "🤖 Bot pausado — você assumiu",
        description: "A IA não vai responder neste lead enquanto você estiver na conversa.",
        action: (
          <ToastAction altText="Desfazer" onClick={async () => {
            const ok = await undoTakeoverByPhone(phone);
            toast({ title: ok ? "Bot reativado" : "Não consegui reativar", variant: ok ? "default" : "destructive" });
          }}>Desfazer</ToastAction>
        ),
      });
    }
  }, [toast]);



  const handleSendToCrm = useCallback(async (stageKey: string) => {
    if (!chat) return;
    setSendingToCrm(true);
    try {
      const { data: existing } = await supabase
        .from("crm_deals")
        .select("id")
        .eq("consultant_id", consultantId)
        .eq("remote_jid", chat.remoteJid)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("crm_deals")
          .update({ stage: stageKey, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        toast({ title: "CRM atualizado", description: `Movido para ${kanbanStages.find(s => s.stage_key === stageKey)?.label || stageKey}` });
      } else {
        await supabase
          .from("crm_deals")
          .insert({ consultant_id: consultantId, remote_jid: chat.remoteJid, stage: stageKey });
        toast({ title: "Adicionado ao CRM", description: `Enviado para ${kanbanStages.find(s => s.stage_key === stageKey)?.label || stageKey}` });
      }
    } catch (err) {
      logger.error("Erro ao enviar ao CRM:", err);
      toast({ title: "Erro ao enviar ao CRM", variant: "destructive" });
    } finally {
      setSendingToCrm(false);
    }
  }, [chat, consultantId, kanbanStages, toast]);

  // Check if this contact is already a customer; auto-create a minimal
  // whatsapp_lead row so flow shortcuts (⚡) always have a customerId.
  useEffect(() => {
    if (!chat) { setIsCustomer(false); setCustomerId(null); return; }
    const phone = chat.remoteJid.split("@")[0];
    let cancelled = false;
    (async () => {
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("consultant_id", consultantId)
        .eq("phone_whatsapp", phone)
        .maybeSingle();
      if (cancelled) return;
      if (existing?.id) {
        setIsCustomer(true);
        setCustomerId(existing.id);
        return;
      }
      const fallbackName = (chat as { pushName?: string | null }).pushName || (chat as { name?: string | null }).name || phone;
      const { data: created, error } = await supabase
        .from("customers")
        .insert({
          consultant_id: consultantId,
          phone_whatsapp: phone,
          name: fallbackName,
          customer_origin: "whatsapp_lead",
          conversation_step: "novo_lead",
        })
        .select("id")
        .maybeSingle();
      if (cancelled) return;
      if (created?.id) {
        setIsCustomer(true);
        setCustomerId(created.id);
      } else if (error) {
        logger.error("Falha ao auto-criar cliente para chat:", error);
        setIsCustomer(false);
        setCustomerId(null);
      }
    })();
    return () => { cancelled = true; };
  }, [chat, consultantId]);

  const handleCustomerAdded = useCallback((newCustomerId?: string) => {
    setIsCustomer(true);
    if (newCustomerId) setCustomerId(newCustomerId);
  }, []);

  // Auto-scroll robusto: usa sentinel + ResizeObserver pra acompanhar mídias
  // que carregam depois (áudio/imagem/vídeo). Só rola se o usuário já estiver
  // perto do fim — assim quem rolou pra cima lendo histórico não é puxado.
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const forceScrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const scheduleScrollToBottom = useCallback((force = false) => {
    if (!force && !stickToBottomRef.current) return;
    const run = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };
    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 80);
    window.setTimeout(run, 240);
  }, []);

  useEffect(() => {
    stickToBottomRef.current = true;
    forceScrollToBottom();
    scheduleScrollToBottom(true);
  }, [chat?.remoteJid, forceScrollToBottom, scheduleScrollToBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distance < 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    const sentinel = bottomRef.current;
    if (!scroller || !sentinel) return;

    const scrollToBottom = () => scheduleScrollToBottom();

    scrollToBottom();

    const ro = new ResizeObserver(scrollToBottom);
    ro.observe(scroller);
    // Observa também todas as bolhas (mídia carregando muda altura)
    const children = scroller.querySelectorAll<HTMLElement>("[data-msg-bubble]");
    children.forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [messages]);

  // Unified helper to resolve JID for media/audio/document sends
  const getResolvedPhone = useCallback(async (): Promise<string | null> => {
    const targetJid = await resolveSendTargetJid();
    if (!targetJid) return null;
    return resolveRecipient(targetJid);
  }, [resolveSendTargetJid]);

  if (!chat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background/50 text-muted-foreground">
        <MessageSquareText className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-sm">Selecione uma conversa para começar</p>
        <p className="text-xs mt-1">Use "/" para respostas rápidas no campo de mensagem</p>
      </div>
    );
  }

  const phoneNumber = chat.remoteJid.split("@")[0];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card">
        <Avatar className="h-9 w-9">
          <AvatarImage src={chat.profilePicUrl} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs">
            {chat.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate sensitive-name">{chat.name}</p>
          <p className="text-[10px] text-muted-foreground sensitive-phone">{phoneNumber}</p>
        </div>
        {isCustomer ? (
          <div className="flex items-center gap-1.5 text-primary">
            <UserCheck className="h-4 w-4" />
            <span className="text-[10px] font-medium">Cliente</span>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] gap-1 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setShowAddDialog(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Adicionar Cliente
          </Button>
        )}
        {kanbanStages.length > 0 && (
          <Select onValueChange={handleSendToCrm} disabled={sendingToCrm}>
            <SelectTrigger className="h-7 w-auto gap-1 text-[10px] border-accent/30 text-accent-foreground px-2">
              {sendingToCrm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KanbanSquare className="h-3.5 w-3.5" />}
              <span>CRM</span>
            </SelectTrigger>
            <SelectContent>
              {kanbanStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.stage_key}>{stage.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isCustomer && customerId && (
          <Button
            size="sm"
            variant={captureActive ? "default" : "outline"}
            className={`h-7 text-[10px] gap-1 ${
              captureActive
                ? "bg-primary text-primary-foreground animate-pulse shadow-md shadow-primary/30"
                : "border-primary/40 text-primary hover:bg-primary/10"
            }`}
            onClick={toggleCapture}
            title="Abrir painel de captação (game)"
          >
            <Gamepad2 className="h-3.5 w-3.5" />
            Captação {filledCount > 0 ? `${filledCount}/${totalFields}` : ""}
          </Button>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={resetting}
              title="Apaga histórico do bot e reinicia o fluxo do zero"
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Zerar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Zerar conversa deste lead?</AlertDialogTitle>
              <AlertDialogDescription>
                Vai apagar o histórico de mensagens do bot, decisões da IA, áudios disparados e
                resetar a etapa do funil. O cliente continua cadastrado, mas o bot vai começar do zero
                na próxima mensagem que ele mandar. Útil pra você testar o fluxo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset} className="bg-destructive hover:bg-destructive/90">
                Sim, zerar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
      >
        {isLoading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">
            Nenhuma mensagem encontrada
          </div>
        )}
        {messages.map((msg, index) => (
          <div key={`${msg.id}-${index}`} data-msg-bubble>
            <MessageBubble message={msg} onLoadMedia={loadMedia} consultantId={consultantId} />
          </div>
        ))}
        <div ref={bottomRef} aria-hidden className="h-2" />
      </div>

      {/* Composer */}
      <MessageComposer
        onSend={async (text) => {
          stickToBottomRef.current = true;
          await sendMessage(text);
          scheduleScrollToBottom(true);
        }}
        initialMessage={initialMessage}
        consultantId={consultantId}
        customerId={customerId || undefined}
        customerJid={chat?.remoteJid}
        customerName={chat?.name}
        onSendAudio={async (base64) => {
          const phone = await getResolvedPhone();
          if (!phone) return;
          void takeoverWithUndo(phone, "humano_assumiu_audio");
          try {
            // useAudioRecorder já gera OGG/Opus real, formato aceito pelo WhatsApp/Whapi.
            const audioDataUrl = `data:audio/ogg;base64,${base64}`;
            const result = await sendWhatsAppMessage({
              instanceName, phone, mediaCategory: "audio", mediaUrl: audioDataUrl, isWhapi,
            });
            if (result.status === "timeout") {
              toast({ title: "Áudio enviado (aguardando confirmação)", description: "O servidor está processando", variant: "default" });
            } else if (result.status === "failed") {
              toast({ title: "Erro ao enviar áudio", description: result.error, variant: "destructive" });
            }
          } catch (err: unknown) {
            logger.error("Erro ao enviar áudio:", err);
            toast({ title: "Erro ao enviar áudio", description: err instanceof Error ? err.message : "Falha no envio", variant: "destructive" });
          }
        }}
        onSendAudioUrl={async (audioUrl) => {
          const phone = await getResolvedPhone();
          if (!phone) return;
          void takeoverWithUndo(phone, "humano_assumiu_audio");
          try {
            const result = await sendWhatsAppMessage({
              instanceName, phone, mediaCategory: "audio", mediaUrl: audioUrl, isWhapi,
            });
            if (result.status === "timeout") {
              toast({ title: "Áudio enviado (aguardando confirmação)", variant: "default" });
            } else if (result.status === "failed") {
              toast({ title: "Erro ao enviar áudio", description: result.error, variant: "destructive" });
            }
          } catch (err: unknown) {
            logger.error("Erro ao enviar áudio:", err);
            toast({ title: "Erro ao enviar áudio", description: err instanceof Error ? err.message : "Falha no envio", variant: "destructive" });
          }
        }}
        onSendMedia={async (mediaUrl, caption, mediaType) => {
          const phone = await getResolvedPhone();
          if (!phone) return;
          void takeoverWithUndo(phone, "humano_assumiu_midia");
          try {
            // Route documents through sendDocument for proper fileName handling
            const category = mediaType as "image" | "video" | "document";
            const fileName = mediaType === "document"
              ? (mediaUrl.split("/").pop()?.split("?")[0] || "documento")
              : undefined;

            const result = await sendWhatsAppMessage({
              instanceName, phone, mediaCategory: category, mediaUrl, text: caption, fileName, isWhapi,
            });
            if (result.status === "timeout") {
              toast({ title: "Mídia enviada (aguardando confirmação)", description: "O servidor está processando", variant: "default" });
            } else if (result.status === "failed") {
              toast({ title: "Erro ao enviar mídia", description: result.error, variant: "destructive" });
            }
          } catch (err: unknown) {
            logger.error("Erro ao enviar mídia:", err);
            toast({ title: "Erro ao enviar mídia", description: err instanceof Error ? err.message : "Falha no envio", variant: "destructive" });
          }
        }}
        templates={templates}
      />

      {/* Add Customer Dialog */}
      {chat && (
        <AddCustomerDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          phone={phoneNumber}
          name={chat.name !== phoneNumber ? chat.name : null}
          consultantId={consultantId}
          onAdded={handleCustomerAdded}
        />
      )}

      {/* Capture Sheet (mobile-first, fullscreen) */}
      {customerId && (
        <CaptureSheet
          open={captureOpen}
          onOpenChange={setCaptureOpen}
          consultantId={consultantId}
          customerId={customerId}
          customerName={chat?.name}
          phoneNumber={phoneNumber}
        />
      )}
    </div>

  );
}
