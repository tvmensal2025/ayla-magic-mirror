import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, RotateCw, AlertTriangle, Loader2, Paperclip } from "lucide-react";
import { Step } from "./flowTypes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
  consultantId?: string | null;
  consultantName?: string | null;
}

type Ev =
  | { kind: "text"; text: string; key: string }
  | { kind: "buttons"; text: string; buttons: { id: string; title: string }[]; key: string }
  | { kind: "audio"; url: string; key: string }
  | { kind: "image"; url: string; caption?: string; key: string }
  | { kind: "video"; url: string; caption?: string; key: string }
  | { kind: "document"; url: string; caption?: string; key: string }
  | { kind: "presence"; state: string; key: string }
  | { kind: "lead"; text: string; attach?: { url: string; kind: string }; key: string }
  | { kind: "system"; text: string; key: string };

const VARIANTS: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];

// Renderiza formatação WhatsApp (*negrito*, _itálico_, ~strike~, `mono`)
// preservando emojis, espaços e quebras de linha (o container já usa
// whitespace-pre-wrap). Escapa HTML antes para evitar XSS no sandbox.
function renderWhatsApp(text: string): JSX.Element | null {
  if (!text) return null;
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = escape(text);
  // Ordem importa: bloco de código primeiro pra não casar com * dentro
  html = html.replace(/```([\s\S]+?)```/g, '<code class="rounded bg-muted/60 px-1 py-0.5 text-[0.85em]">$1</code>');
  html = html.replace(/`([^`\n]+?)`/g, '<code class="rounded bg-muted/60 px-1 py-0.5 text-[0.85em]">$1</code>');
  // Negrito: *texto* (não casa com ** ou início/fim de linha vazia)
  html = html.replace(/(^|[^*\w])\*([^\s*][^*\n]*?[^\s*]|[^\s*])\*(?!\w)/g, "$1<strong>$2</strong>");
  // Itálico: _texto_
  html = html.replace(/(^|[^_\w])_([^\s_][^_\n]*?[^\s_]|[^\s_])_(?!\w)/g, "$1<em>$2</em>");
  // Tachado: ~texto~
  html = html.replace(/(^|[^~\w])~([^\s~][^~\n]*?[^\s~]|[^\s~])~(?!\w)/g, "$1<del>$2</del>");
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
let _ctr = 0;
const k = () => `ev_${Date.now()}_${++_ctr}`;

export default function FlowSimulator({ open, onOpenChange, consultantId }: Props) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [freeText, setFreeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<"A" | "B" | "C" | "D">("A");
  const [state, setState] = useState<any>(null);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [showData, setShowData] = useState(false);
  const [otpRealPhone, setOtpRealPhone] = useState(() => {
    try { return localStorage.getItem("flowSim:otpRealPhone") || ""; } catch { return ""; }
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persistir telefone OTP pra não digitar toda vez
  useEffect(() => {
    try { localStorage.setItem("flowSim:otpRealPhone", otpRealPhone); } catch { /* noop */ }
  }, [otpRealPhone]);


  useEffect(() => {
    if (open) handleReset(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  function appendEvents(incoming: any[]) {
    setEvents((prev) => [...prev, ...incoming.map((e) => ({ ...e, key: k() }))]);
  }

  function otpPhoneDigits(): string {
    return otpRealPhone.replace(/\D/g, "");
  }

  function otpPhoneValid(): boolean {
    const d = otpPhoneDigits();
    return d.length === 0 || d.length === 12 || d.length === 13;
  }

  async function callRun(payload: any) {
    if (!otpPhoneValid()) {
      toast.error("Telefone OTP inválido — use 55 + DDD + número, ou deixe em branco");
      return;
    }
    setBusy(true);
    try {
      const otpPhone = otpPhoneDigits();
      const { data, error } = await supabase.functions.invoke("flow-simulate-run", {
        body: {
          consultant_id: consultantId,
          variant,
          otp_real_phone: otpPhone || undefined,
          ...payload,
        },
      });
      if (error) throw error;
      const out = data as { events?: any[]; customer_state?: any; diagnostic?: any };
      const nextEvents = out.events || [];
      appendEvents(nextEvents);
      if (nextEvents.length === 0 && out.diagnostic && !out.diagnostic.advanced) {
        setEvents((prev) => [
          ...prev,
          {
            kind: "system",
            text: `⚠ Motor não avançou (${out.diagnostic.step_before || "—"} → ${out.diagnostic.step_after || "—"}). ${out.diagnostic.webhook_err || "Verifique os logs."}`,
            key: k(),
          },
        ]);
      }
      if (out.customer_state) setState(out.customer_state);
      if (out.diagnostic) setDiagnostic(out.diagnostic);
    } catch (e) {
      toast.error("Erro no simulador: " + (e as Error).message);
      setEvents((prev) => [...prev, { kind: "system", text: `⚠ ${(e as Error).message}`, key: k() }]);
    } finally {
      setBusy(false);
    }
  }



  async function handleReset(initial = false) {
    setEvents([]);
    setState(null);
    setDiagnostic(null);
    if (!consultantId) return;
    if (realMode && !realPhoneValid()) {
      if (initial) {
        // Não dispara welcome até o usuário digitar um telefone real válido
        setEvents([{ kind: "system", text: "⚠ Modo Real ligado — informe seu telefone (55 + DDD + número) para começar.", key: k() }]);
      }
      return;
    }
    setBusy(true);
    try {
      await supabase.functions.invoke("flow-simulate-reset", {
        body: {
          consultant_id: consultantId,
          real_mode: realMode,
          real_phone: realMode ? realPhoneDigits() : undefined,
        },
      });
    } catch (_) { /* noop */ }
    setBusy(false);
    if (initial) {
      // Dispara o motor com "oi" + fresh=true → reseta sandbox e roda welcome
      await callRun({ user_message: "oi", fresh: true });
      setEvents((prev) => [{ kind: "system", text: realMode ? "▶ Modo Real ativo — fluxo 100% real (OCR + Portal + OTP no seu WhatsApp)" : "▶ Conversa zerada — começando do início", key: k() }, ...prev]);
    }
  }


  async function handleSend(text: string, button_id?: string) {
    const trimmed = text.trim();
    if (!trimmed && !button_id) return;
    setEvents((prev) => [...prev, { kind: "lead", text: trimmed || (button_id || ""), key: k() }]);
    setFreeText("");
    await callRun({ user_message: trimmed, button_id });
  }

  async function handleFile(file: File) {
    if (!consultantId) return;
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${consultantId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("simulator-uploads")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("simulator-uploads").getPublicUrl(path);
      const url = pub.publicUrl;
      const kind: "image" | "document" = file.type.startsWith("image/") ? "image" : "document";
      setEvents((prev) => [
        ...prev,
        { kind: "lead", text: kind === "image" ? "📷 Foto enviada" : "📄 Documento enviado", attach: { url, kind }, key: k() },
      ]);
      await callRun({ attach: { url, kind }, user_message: "" });
    } catch (e) {
      toast.error("Falha no upload: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>🎬 Simulador de Fluxo — motor real de produção</DialogTitle>
          <DialogDescription>
            {realMode
              ? "MODO REAL ligado: OCR, Portal Worker, OTP e link facial usam serviços REAIS. WhatsApp envia mensagens reais para o telefone abaixo."
              : "Sandbox: roda o mesmo runBotFlow/runConversationalFlow da produção, com OCR/Portal mockados. Nada toca o CRM ou WhatsApp real."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Toggle Modo Real ── */}
        <div className={`rounded-md border p-2 text-xs ${realMode ? "border-red-500/40 bg-red-500/5" : "border-border bg-muted/20"}`}>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={realMode}
                onChange={(e) => setRealMode(e.target.checked)}
                disabled={busy}
                className="h-3.5 w-3.5"
              />
              <span className="font-semibold">
                {realMode ? "🔴 Modo Real ATIVO" : "⚪ Ligar Modo Real (100% serviços reais)"}
              </span>
            </label>
            {realMode && (
              <Input
                value={realPhone}
                onChange={(e) => setRealPhone(e.target.value)}
                placeholder="55 11 99999-9999"
                disabled={busy}
                className="h-7 max-w-[200px] text-[11px]"
              />
            )}
          </div>
          {realMode && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              ⚠ Envia WhatsApp REAL ao número acima. OCR (Gemini), Portal Worker (Playwright na VPS), OTP e link de assinatura serão reais.
              {!realPhoneValid() && <span className="text-red-500"> Telefone inválido — use 55 + DDD + número (12 ou 13 dígitos).</span>}
            </p>
          )}
        </div>



        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Variante:</span>
            {VARIANTS.map((v) => (
              <Button
                key={v}
                size="sm"
                variant={variant === v ? "default" : "outline"}
                onClick={() => setVariant(v)}
                disabled={busy}
                className="h-6 px-2 text-[10px]"
              >
                {v}
              </Button>
            ))}
            {state?.conversation_step && (
              <Badge variant="outline" className="ml-2 text-[9px]">
                📍 {state.conversation_step}
              </Badge>
            )}
            {state?.status && (
              <Badge
                variant={state.status === "portal_submitting" || state.status === "awaiting_otp" || state.status === "awaiting_facial" || state.status === "cadastro_concluido" ? "default" : "secondary"}
                className="text-[9px]"
              >
                {state.status}
              </Badge>
            )}
            {diagnostic && !diagnostic.webhook_ok && (
              <Badge variant="destructive" className="text-[9px]">⚠ webhook falhou</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowData((v) => !v)}
              disabled={!state}
              className="h-6 px-2 text-[10px]"
              title="Ver dados coletados do lead"
            >
              {showData ? "🙈 Dados" : "👁 Dados"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleReset(true)} disabled={busy}>
              <RotateCw className="mr-1 h-3 w-3" /> Zerar
            </Button>
          </div>
        </div>

        {/* Painel de dados coletados — visível ao clicar em "Dados" */}
        {showData && state && (
          <div className="rounded-md border bg-muted/20 p-2 text-[10px] font-mono leading-relaxed">
            <p className="mb-1 font-semibold text-xs text-muted-foreground">📋 Dados coletados do lead (sandbox)</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {[
                ["Nome", state.name],
                ["CPF", state.cpf],
                ["RG", state.rg],
                ["Nascimento", state.data_nascimento],
                ["E-mail", state.email],
                ["Telefone", state.phone_landline],
                ["CEP", state.cep],
                ["Endereço", state.address_street ? `${state.address_street}, ${state.address_number || ""}` : null],
                ["Bairro", state.address_neighborhood],
                ["Cidade/UF", state.address_city ? `${state.address_city}/${state.address_state}` : null],
                ["Distribuidora", state.distribuidora],
                ["Nº Instalação", state.numero_instalacao],
                ["Valor conta", state.electricity_bill_value ? `R$ ${Number(state.electricity_bill_value).toFixed(2)}` : null],
                ["Foto conta", state.electricity_bill_photo_url ? "✅ recebida" : "❌ pendente"],
                ["Doc frente", state.document_front_url ? "✅ recebido" : "❌ pendente"],
                ["Doc verso", state.document_back_url ? (state.document_back_url === "nao_aplicavel" ? "N/A (CNH)" : "✅ recebido") : "❌ pendente"],
                ["OTP", state.otp_code || null],
                ["Link facial", state.link_facial ? "✅ gerado" : null],
              ]
                .filter(([, v]) => v != null && v !== "")
                .map(([label, value]) => (
                  <div key={label} className="flex gap-1">
                    <span className="text-muted-foreground shrink-0">{label}:</span>
                    <span className="truncate">{String(value)}</span>
                  </div>
                ))}
            </div>
            {diagnostic && (
              <p className="mt-1 text-muted-foreground">
                🔀 step: <span className="text-foreground">{diagnostic.step_before || "—"}</span>
                {" → "}
                <span className={diagnostic.advanced ? "text-green-600" : "text-foreground"}>{diagnostic.step_after || "—"}</span>
                {diagnostic.advanced ? " ✓" : " (sem avanço)"}
              </p>
            )}
          </div>
        )}

        <div
          ref={scrollRef}
          className="max-h-[460px] min-h-[300px] space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3"
        >
          {events.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">
              {busy ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "Aguardando…"}
            </p>
          )}
          {events.map((ev) => {
            if (ev.kind === "system") {
              return (
                <p key={ev.key} className="text-center text-[10px] italic text-muted-foreground">
                  {ev.text}
                </p>
              );
            }
            if (ev.kind === "presence") {
              return (
                <p key={ev.key} className="text-[10px] text-muted-foreground">
                  ▸ {ev.state === "recording" ? "🎤 gravando áudio…" : "✍️ digitando…"}
                </p>
              );
            }
            if (ev.kind === "lead") {
              return (
                <div key={ev.key} className="flex justify-end">
                  <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-emerald-500/90 px-3 py-1.5 text-sm text-white shadow">
                    {ev.attach?.kind === "image" ? (
                      <img src={ev.attach.url} className="max-h-40 rounded-lg" />
                    ) : ev.attach ? (
                      <a href={ev.attach.url} target="_blank" rel="noreferrer" className="underline">
                        {ev.text}
                      </a>
                    ) : (
                      ev.text
                    )}
                  </div>
                </div>
              );
            }
            if (ev.kind === "text" || ev.kind === "buttons") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-sm shadow">
                    {renderWhatsApp(ev.text)}
                    {ev.kind === "buttons" && ev.buttons.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ev.buttons.map((b) => (
                          <Button
                            key={b.id}
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            className="h-7 rounded-full text-xs"
                            onClick={() => handleSend(b.title, b.id)}
                          >
                            {b.title}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (ev.kind === "audio") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-card p-2 shadow">
                    <audio controls src={ev.url} className="h-8 w-64" />
                  </div>
                </div>
              );
            }
            if (ev.kind === "image") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-card p-1 shadow">
                    <img
                      src={ev.url}
                      alt={ev.caption || ""}
                      className="max-h-64 max-w-xs cursor-zoom-in rounded-xl"
                      onClick={() => window.open(ev.url, "_blank")}
                    />
                    {ev.caption && <p className="px-2 py-1 text-xs">{ev.caption}</p>}
                  </div>
                </div>
              );
            }
            if (ev.kind === "video") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-card p-1 shadow">
                    <video src={ev.url} controls playsInline className="max-h-72 max-w-xs rounded-xl" />
                  </div>
                </div>
              );
            }
            if (ev.kind === "document") {
              return (
                <div key={ev.key} className="flex justify-start">
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-sm underline shadow"
                  >
                    📄 {ev.caption || "Documento"}
                  </a>
                </div>
              );
            }
            return null;
          })}
          {busy && <p className="text-center text-[10px] text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> processando…</p>}
        </div>

        {/* ⚡ Quick actions: dispara mensagens prontas pra validar o fluxo principal */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "👋 oi", msg: "oi" },
            { label: "💡 Captar luz", msg: "quero economizar na conta de luz, vem uns 350 por mês" },
            { label: "📸 Quero simular", msg: "quero simular" },
            { label: "🤔 Tenho dúvida", msg: "ainda tenho dúvida, isso é golpe?" },
            { label: "🙋 Falar com humano", msg: "quero falar com um humano" },
          ].map((qa) => (
            <Button
              key={qa.label}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => handleSend(qa.msg)}
            >
              {qa.label}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.currentTarget.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Anexar foto da conta ou documento (PDF/JPG)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && freeText.trim() && !busy) handleSend(freeText);
            }}
            placeholder="Digite uma mensagem livre…"
            maxLength={1000}
            disabled={busy}
          />
          <Button onClick={() => handleSend(freeText)} disabled={!freeText.trim() || busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
        </div>

        <p className="flex items-start gap-1 text-[10px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {realMode
            ? <>🔴 <strong>Modo Real:</strong> WhatsApp, OCR (Gemini), Portal Worker, OTP e link facial são reais. O OTP chega no WhatsApp do número acima — digite-o aqui ou diretamente no WhatsApp. Lead marcado como <code>is_test_lead=true</code>, fora das métricas.</>
            : <>Conversa sandbox — não polui CRM, métricas nem envia WhatsApp real. Use o anexo (📎) para simular envio de foto da conta de luz ou documento. O OCR roda em modo mock (dados fictícios pré-definidos). Clique em <strong>👁 Dados</strong> para ver o que foi coletado.</>}
        </p>
      </DialogContent>
    </Dialog>
  );
}
