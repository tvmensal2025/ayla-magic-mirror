import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CaptureLeadList } from "@/components/captacao/CaptureLeadList";
import { CaptureStepsGrid } from "@/components/captacao/CaptureStepsGrid";
import { CaptureLeadCard } from "@/components/captacao/CaptureLeadCard";
import { CaptureScoreboard } from "@/components/captacao/CaptureScoreboard";
import { CaptureMissionsPanel, bumpMission } from "@/components/captacao/CaptureMissionsPanel";
import { useCaptureScoreboard } from "@/hooks/useCaptureScoreboard";
import { Button } from "@/components/ui/button";
import { Gamepad2, ExternalLink, MessageCircle, ChevronLeft, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GameModeToggle } from "@/components/captacao/game/GameModeToggle";
import { GameShell } from "@/components/captacao/game/GameShell";
import { PlayerHud } from "@/components/captacao/game/PlayerHud";
import { QuestsBar } from "@/components/captacao/game/QuestsBar";
import { AchievementsRail } from "@/components/captacao/game/AchievementsRail";
import { LevelUpOverlay } from "@/components/captacao/game/LevelUpOverlay";
import { XpToast } from "@/components/captacao/game/XpToast";
import { useGameMode } from "@/components/captacao/game/useGameMode";
import { useGameProgress } from "@/components/captacao/game/useGameProgress";
import { sfx } from "@/components/captacao/game/sfx";
import { MessageComposer } from "@/components/whatsapp/MessageComposer";
import { useTemplates } from "@/hooks/useTemplates";
import { sendWhatsAppMessage } from "@/services/messageSender";
import { toast as sonnerToast } from "sonner";
import { useCaptureSession } from "@/hooks/useCaptureSession";
import { FinalizeButton } from "@/components/captacao/FinalizeButton";
import { PortalStatusTracker } from "@/components/captacao/PortalStatusTracker";

interface Props { consultantId: string; onOpenChat?: (phone: string) => void; instanceName?: string | null; isWhapi?: boolean; }

export function CaptacaoPanel({ consultantId, onOpenChat, instanceName = null, isWhapi = false }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sentSteps, setSentSteps] = useState<Set<string>>(new Set());
  const [phone, setPhone] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [variant, setVariant] = useState<"A" | "B" | "C">("A");
  const [mismatch, setMismatch] = useState<{ flag: boolean; bill: string; doc: string; acked: boolean }>({ flag: false, bill: "", doc: "", acked: false });
  const [missionsVersion, setMissionsVersion] = useState(0);
  const [showAside, setShowAside] = useState(false);
  const { today, week, streak, bump } = useCaptureScoreboard(consultantId);
  const { toast } = useToast();
  const { templates } = useTemplates(consultantId);
  const session = useCaptureSession(selectedId);
  useEffect(() => {
    try { localStorage.removeItem("capture_auto_mode"); } catch {}
  }, []);

  // Game mode state
  const { enabled: gameOn, toggle: toggleGame, sound, toggleSound } = useGameMode(consultantId);
  const progress = useGameProgress(consultantId);
  const [xpToast, setXpToast] = useState<number | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; label: string } | null>(null);

  useEffect(() => { setSentSteps(new Set()); setPhone(null); setCustomerName(null); setShowAside(false); setVariant("A"); setMismatch({ flag: false, bill: "", doc: "", acked: false }); }, [selectedId]);

  // Reconstitui sentSteps a partir do log de conversations outbound: tile fica ✓
  // mesmo após trocar de lead ou recarregar a página.
  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    (async () => {
      // Pega os steps ativos do fluxo do consultor (qualquer variante) e os outbounds do lead
      const { data: flows } = await supabase
        .from("bot_flows").select("id")
        .eq("consultant_id", consultantId).eq("is_active", true);
      const flowIds = ((flows as any[]) || []).map((f) => f.id);
      if (flowIds.length === 0) return;
      const { data: steps } = await supabase
        .from("bot_flow_steps").select("id, step_key")
        .in("flow_id", flowIds).eq("is_active", true);
      const stepIdByKey = new Map<string, string>();
      ((steps as any[]) || []).forEach((s) => {
        if (s.step_key) stepIdByKey.set(String(s.step_key), String(s.id));
        stepIdByKey.set(String(s.id), String(s.id));
      });
      const { data: outs } = await supabase
        .from("conversations").select("conversation_step")
        .eq("customer_id", selectedId).eq("message_direction", "outbound")
        .not("conversation_step", "is", null);
      const found = new Set<string>();
      ((outs as any[]) || []).forEach((o) => {
        const key = String(o.conversation_step || "");
        const id = stepIdByKey.get(key);
        if (id) found.add(id);
      });
      if (mounted && found.size > 0) setSentSteps((prev) => new Set([...prev, ...found]));
    })();
    return () => { mounted = false; };
  }, [selectedId, consultantId]);

  useEffect(() => {
    if (!selectedId) return;
    void (async () => {
      const { data } = await supabase
        .from("customers")
        .select("phone_whatsapp, name, flow_variant, name_mismatch_flag, name_mismatch_acknowledged_at, bill_holder_name, doc_holder_name")
        .eq("id", selectedId).maybeSingle();
      const row = data as any;
      setPhone(row?.phone_whatsapp || null);
      setCustomerName(row?.name || null);
      const v = String(row?.flow_variant || "A").toUpperCase();
      setVariant((["A", "B", "C"].includes(v) ? v : "A") as "A" | "B" | "C");
      setMismatch({
        flag: !!row?.name_mismatch_flag,
        bill: row?.bill_holder_name || "",
        doc: row?.doc_holder_name || "",
        acked: !!row?.name_mismatch_acknowledged_at,
      });
    })();
  }, [selectedId]);

  const changeVariant = async (next: "A" | "B" | "C") => {
    if (!selectedId || next === variant) return;
    setVariant(next);
    await supabase.from("customers").update({ flow_variant: next, updated_at: new Date().toISOString() }).eq("id", selectedId);
    sonnerToast.success(`Variante ${next} ativada — próximos disparos usam esse fluxo.`);
  };

  const ackMismatch = async (relationship: "titular" | "outro") => {
    if (!selectedId) return;
    await supabase.from("customers").update({
      name_mismatch_acknowledged_at: new Date().toISOString(),
      bill_owner_relationship: relationship === "titular" ? "titular" : "outro_titular",
      updated_at: new Date().toISOString(),
    }).eq("id", selectedId);
    setMismatch((m) => ({ ...m, acked: true }));
    sonnerToast.success(relationship === "titular" ? "Titularidade confirmada — pode finalizar." : "Anotado: conta em nome de outro titular.");
  };

  const customerJid = phone ? `${phone.replace(/\D/g, "")}@s.whatsapp.net` : undefined;

  const xpReward = (kind: "text" | "audio" | "media") => {
    const res = progress.registerMessage(kind);
    setXpToast(res.gainedXp);
    sfx.coin(sound);
    if (res.leveledUp) {
      setTimeout(() => { sfx.levelUp(sound); setLevelUp({ level: res.newLevel, label: progress.rank.label }); }, 500);
    }
  };

  const sendText = async (text: string) => {
    if (!phone) { sonnerToast.error("Lead sem telefone"); return; }
    if (!instanceName) { sonnerToast.error("WhatsApp desconectado"); return; }
    const r = await sendWhatsAppMessage({ instanceName, phone, mediaCategory: "text", text, isWhapi });
    if (r.status === "failed") { sonnerToast.error(r.error || "Falha ao enviar"); return; }
    xpReward("text");
  };
  const sendAudioB64 = async (b64: string) => {
    if (!phone || !instanceName) return;
    const r = await sendWhatsAppMessage({ instanceName, phone, mediaCategory: "audio", mediaUrl: `data:audio/ogg;base64,${b64}`, isWhapi });
    if (r.status === "failed") { sonnerToast.error(r.error || "Falha ao enviar áudio"); return; }
    xpReward("audio");
  };
  const sendAudioUrl = async (url: string) => {
    if (!phone || !instanceName) return;
    const r = await sendWhatsAppMessage({ instanceName, phone, mediaCategory: "audio", mediaUrl: url, isWhapi });
    if (r.status === "failed") { sonnerToast.error(r.error || "Falha ao enviar áudio"); return; }
    xpReward("audio");
  };
  const sendMedia = async (url: string, caption: string, mediaType: "image" | "video" | "document") => {
    if (!phone || !instanceName) return;
    const fileName = mediaType === "document" ? (url.split("/").pop()?.split("?")[0] || "documento") : undefined;
    const r = await sendWhatsAppMessage({ instanceName, phone, mediaCategory: mediaType, mediaUrl: url, text: caption, fileName, isWhapi });
    if (r.status === "failed") { sonnerToast.error(r.error || "Falha ao enviar mídia"); return; }
    xpReward("media");
  };

  const handleSubmitted = async () => {
    await bump();
    bumpMission(consultantId, "leads");
    setMissionsVersion((v) => v + 1);

    if (gameOn) {
      const res = progress.registerCapture();
      setXpToast(res.gainedXp);
      sfx.coin(sound);
      if (res.leveledUp) {
        setTimeout(() => {
          sfx.levelUp(sound);
          setLevelUp({ level: res.newLevel, label: progress.rank.label });
        }, 600);
      }
      void progress.reload();
    } else {
      toast({ title: "🏆 +1 cadastro no placar!", duration: 2000 });
    }
  };

  return (
    <div className={`flex flex-col h-[calc(100vh-220px)] min-h-[640px] rounded-xl border ${gameOn ? "border-primary/40" : "border-border"} overflow-hidden bg-background/60 capture-ambient animate-bg-drift`}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/60 backdrop-blur-sm gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-bold">Modo Captação</h2>
            <p className="text-[11px] text-muted-foreground">
              {gameOn ? "🎮 Game ON — capture, ganhe XP e suba de nível!" : "Capture, ganhe XP, suba de nível — e bate o placar do dia 🏆"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!gameOn && (
            <>
              <CaptureMissionsPanel consultantId={consultantId} streak={streak} bumpVersion={missionsVersion} />
              <CaptureScoreboard today={today} week={week} streak={streak} />
            </>
          )}
          <GameModeToggle enabled={gameOn} onToggle={toggleGame} sound={sound} onToggleSound={toggleSound} />
        </div>
      </header>

      {gameOn ? (
        <GameShell>
          <div className="px-4 py-3 space-y-3">
            <PlayerHud progress={progress} />
            <QuestsBar progress={progress} />
          </div>
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden md:h-[calc(100vh-460px)] md:min-h-[420px]">
            {/* Mobile: lead list visível só quando NÃO há lead selecionado. Desktop: sempre. */}
            <div className={`${selectedId ? "hidden md:flex" : "flex"} md:flex flex-col md:w-72 md:shrink-0 md:border-r border-border overflow-hidden`}>
              <CaptureLeadList consultantId={consultantId} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <main className={`${!selectedId ? "hidden md:flex" : "flex"} flex-1 flex-col overflow-hidden`}>
              {!selectedId ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
                  <Gamepad2 className="w-14 h-14 text-primary/60 animate-game-bounce" />
                  <h3 className="text-base font-black uppercase tracking-wide">Escolha um lead para começar a quest</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Cada cadastro completo te dá XP e pode disparar combos, conquistas e level-up.
                  </p>
                </div>
              ) : (
                <>
                  <div className="px-3 md:px-4 py-2 md:py-3 border-b border-border/60 bg-card/40 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <Button size="icon" variant="ghost" className="md:hidden h-8 w-8 shrink-0" onClick={() => setSelectedId(null)} title="Voltar">
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] md:text-xs text-muted-foreground">Alvo atual</p>
                        <p className="text-sm font-semibold truncate">{customerName || phone || "—"}</p>
                      </div>
                      <div className="hidden sm:flex items-center gap-1 rounded-md border border-border/60 p-0.5 bg-background/40">
                        {(["A", "B", "C"] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => changeVariant(v)}
                            className={`px-2 py-0.5 text-[11px] font-bold rounded-sm transition ${variant === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                            title={`Fluxo variante ${v}`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      {phone && onOpenChat && (
                        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => onOpenChat(phone)}>
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Abrir conversa</span>
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="md:hidden h-8 w-8 shrink-0" onClick={() => setShowAside((s) => !s)} title="Ficha">
                        <ChevronDown className={`w-4 h-4 transition-transform ${showAside ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                    {/* Mobile A/B/C */}
                    <div className="sm:hidden flex items-center gap-1 rounded-md border border-border/60 p-0.5 bg-background/40 self-start">
                      <span className="text-[10px] text-muted-foreground px-1">Fluxo:</span>
                      {(["A", "B", "C"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => changeVariant(v)}
                          className={`px-2 py-0.5 text-[11px] font-bold rounded-sm transition ${variant === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    {mismatch.flag && !mismatch.acked && (
                      <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-[11px] space-y-1.5">
                        <p className="font-semibold text-yellow-200">
                          ⚠️ Nome divergente: conta "<span className="font-bold">{mismatch.bill || "—"}</span>" vs documento "<span className="font-bold">{mismatch.doc || "—"}</span>". Confirme antes de finalizar.
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => ackMismatch("titular")}>É o titular</Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => ackMismatch("outro")}>Conta de outro titular</Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-primary mb-2">⚔️ 10 Passos · ataque rápido</h3>
                      <CaptureStepsGrid
                        consultantId={consultantId}
                        customerId={selectedId}
                        variant={variant}
                        sentSteps={sentSteps}
                        autoMode={autoMode}
                        onSent={(stepId) => { setSentSteps((s) => new Set(s).add(stepId)); sfx.ding(sound); }}
                      />
                    </div>

                    {/* Ficha + Achievements aparecem no fim do scroll em mobile (quando expandidos) */}
                    <div className={`md:hidden ${showAside ? "block" : "hidden"} space-y-3`}>
                      <CaptureLeadCard customerId={selectedId} onSubmitted={handleSubmitted} sentStepsCount={sentSteps.size} embedded />
                      <AchievementsRail progress={progress} />
                    </div>
                  </div>

                  {/* Status do portal (VPS) — aparece após Finalizar */}
                  <PortalStatusTracker customerId={selectedId} consultantId={consultantId} />

                  {/* Finalizar Cadastro — habilita só quando tudo completo */}
                  <FinalizeButton
                    consultantId={consultantId}
                    customerId={selectedId}
                    variant={variant}
                    missing={session.missing || []}
                    isComplete={!!session.isComplete}
                    allStepsSent={sentSteps.size > 0}
                    pendingStepsCount={Math.max(0, 10 - sentSteps.size)}
                  />

                  {/* Composer fixo no rodapé: atalhos /, templates, fluxos, anexos, áudio, AI suggest */}
                  <div className="border-t border-border/60 bg-card/40">
                    <MessageComposer
                      onSend={sendText}
                      onSendAudio={sendAudioB64}
                      onSendAudioUrl={sendAudioUrl}
                      onSendMedia={sendMedia}
                      templates={templates}
                      disabled={!instanceName || !phone}
                      consultantId={consultantId}
                      customerId={selectedId || undefined}
                      customerJid={customerJid}
                      customerName={customerName || undefined}
                    />
                  </div>
                </>
              )}
            </main>
            {/* Desktop aside: ficha quando há lead, achievements quando não */}
            <div className="hidden md:flex md:flex-col md:w-72 md:border-l border-border/60 overflow-hidden">
              {selectedId ? (
                <CaptureLeadCard customerId={selectedId} onSubmitted={handleSubmitted} sentStepsCount={sentSteps.size} />
              ) : (
                <aside className="overflow-y-auto p-2">
                  <AchievementsRail progress={progress} />
                </aside>
              )}
            </div>
          </div>
        </GameShell>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <CaptureLeadList consultantId={consultantId} selectedId={selectedId} onSelect={setSelectedId} />

          <main className="flex-1 flex flex-col overflow-hidden">
            {!selectedId ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
                <Gamepad2 className="w-12 h-12 text-muted-foreground/40 animate-float" />
                <h3 className="text-base font-semibold">Selecione um lead para começar</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Para adicionar um lead à captação, vá para o chat do WhatsApp, abra o cliente e marque "Capturar manualmente".
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border bg-card/40 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Conversando com</p>
                    <p className="text-sm font-semibold">{phone || "—"}</p>
                  </div>
                  {phone && onOpenChat && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onOpenChat(phone)}>
                      <MessageCircle className="w-3.5 h-3.5" /> Abrir conversa
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">10 Passos · clique para enviar</h3>
                    <CaptureStepsGrid
                      consultantId={consultantId}
                      customerId={selectedId}
                      sentSteps={sentSteps}
                      onSent={(stepId) => setSentSteps((s) => new Set(s).add(stepId))}
                    />
                  </div>
                  <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-3 text-[11px] text-muted-foreground space-y-1">
                    <p>💡 <span className="font-semibold">Como funciona:</span> envie os passos, conforme o cliente responde os campos vão sendo preenchidos automaticamente (OCR ativo). Capturas em sequência ativam <span className="font-bold text-primary">combos</span>!</p>
                    <p>Edite manualmente qualquer campo na ficha à direita.</p>
                  </div>
                </div>
              </>
            )}
          </main>

          {selectedId && <CaptureLeadCard customerId={selectedId} onSubmitted={handleSubmitted} sentStepsCount={sentSteps.size} />}
        </div>
      )}

      {xpToast !== null && <XpToast amount={xpToast} onDone={() => setXpToast(null)} />}
      {levelUp && <LevelUpOverlay level={levelUp.level} rankLabel={levelUp.label} onClose={() => setLevelUp(null)} />}
    </div>
  );
}
