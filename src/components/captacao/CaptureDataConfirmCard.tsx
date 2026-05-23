import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Check, Edit2, MessageCircle, Loader2, X, FileText, IdCard } from "lucide-react";

type FieldDef = { key: string; label: string; format?: (v: any) => string };

interface Props {
  kind: "bill" | "doc";
  customer: any;
  onConfirmed?: () => void;
}

const BILL_FIELDS: FieldDef[] = [
  { key: "bill_holder_name", label: "Titular" },
  { key: "numero_instalacao", label: "Instalação" },
  { key: "distribuidora", label: "Distribuidora" },
  { key: "cep", label: "CEP" },
  { key: "address_street", label: "Rua" },
  { key: "address_number", label: "Nº" },
  { key: "address_neighborhood", label: "Bairro" },
  { key: "address_city", label: "Cidade" },
  { key: "address_state", label: "UF" },
];
const DOC_FIELDS: FieldDef[] = [
  { key: "name", label: "Nome" },
  { key: "cpf", label: "CPF" },
  { key: "rg", label: "RG" },
  { key: "data_nascimento", label: "Nascimento" },
  { key: "nome_mae", label: "Mãe" },
];

function hasAny(customer: any, fields: FieldDef[]) {
  return fields.some((f) => {
    const v = customer?.[f.key];
    return v !== null && v !== undefined && String(v).trim() !== "";
  });
}

export function CaptureDataConfirmCard({ kind, customer, onConfirmed }: Props) {
  const { toast } = useToast();
  const fields = kind === "bill" ? BILL_FIELDS : DOC_FIELDS;
  const confirmedAt = kind === "bill" ? customer?.bill_data_confirmed_at : customer?.doc_data_confirmed_at;
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [busy, setBusy] = useState<"" | "self" | "client">("");

  if (!hasAny(customer, fields)) return null; // sem OCR ainda
  const isConfirmed = !!confirmedAt;

  const title = kind === "bill" ? "📄 Dados lidos da CONTA" : "🪪 Dados lidos do DOCUMENTO";
  const Icon = kind === "bill" ? FileText : IdCard;
  const tone = isConfirmed
    ? "border-emerald-500/50 bg-emerald-500/5"
    : kind === "bill" ? "border-amber-400/60 bg-amber-400/5" : "border-cyan-400/60 bg-cyan-400/5";

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await supabase.from("customers").update({ [editing]: editVal.trim() || null }).eq("id", customer.id);
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const confirmSelf = async () => {
    setBusy("self");
    try {
      const nowIso = new Date().toISOString();
      await supabase.from("customers").update({
        [kind === "bill" ? "bill_data_confirmed_at" : "doc_data_confirmed_at"]: nowIso,
        [kind === "bill" ? "bill_data_confirmation_by" : "doc_data_confirmation_by"]: "consultant",
        // Limpa a fila de revisão OCR — sem isso o banner laranja "Revisar"
        // continua exibindo o lead mesmo após confirmação.
        ocr_review_pending: null,
        ocr_review_decided_at: nowIso,
        ocr_review_decided_by: "consultant",
      } as any).eq("id", customer.id);

      // Despacha passos `message` intermediários (ex.: d_resultado/simulação dos
      // 20%) entre o capture atual e o próximo capture — igual ao OcrReviewCard.
      try {
        const nextCaptureKey = kind === "bill" ? "capture_documento" : "finalizar_cadastro";
        const currentCaptureType = kind === "bill" ? "capture_conta" : "capture_documento";
        const variant = (customer as any)?.flow_variant || "A";
        const { data: flowRow } = await supabase
          .from("bot_flows")
          .select("id")
          .eq("consultant_id", customer.consultant_id)
          .eq("is_active", true)
          .eq("variant", variant)
          .maybeSingle();
        let dispatchedBetween = 0;
        if (flowRow?.id) {
          const { data: allSteps } = await supabase
            .from("bot_flow_steps")
            .select("position, step_key, step_type, is_active")
            .eq("flow_id", flowRow.id)
            .eq("is_active", true)
            .order("position", { ascending: true });
          const steps = (allSteps as any[]) || [];
          const captureIdx = steps.findIndex((s) => s.step_type === currentCaptureType);
          const nextStopIdx = steps.findIndex(
            (s, i) => i > captureIdx && (s.step_type === "capture_documento" || s.step_type === "capture_doc" || s.step_type === "capture_email" || s.step_type === "confirm_phone" || s.step_type === "finalizar_cadastro"),
          );
          const between = captureIdx >= 0
            ? steps.slice(captureIdx + 1, nextStopIdx > 0 ? nextStopIdx : steps.length).filter((s) => s.step_type === "message")
            : [];
          for (const msgStep of between) {
            try {
              await supabase.functions.invoke("manual-step-send", {
                body: {
                  consultantId: customer.consultant_id,
                  customerId: customer.id,
                  stepKey: msgStep.step_key,
                  part: "all",
                  continueFlow: false,
                  skipNameGuard: true,
                },
              });
              dispatchedBetween++;
              await new Promise((r) => setTimeout(r, 1800));
            } catch (msgErr: any) {
              console.warn(`[confirm-self] msg-step ${msgStep.step_key} failed:`, msgErr?.message);
            }
          }
        }

        // Se o fluxo do consultor NÃO tem passo de simulação entre conta
        // e doc (variantes A/B típicas), injeta a proposta padrão (8%–20%)
        // pra cliente ver o benefício antes de mandar o documento.
        if (kind === "bill" && dispatchedBetween === 0) {
          try {
            const valor = Number((customer as any)?.electricity_bill_value || 0);
            if (valor > 30) {
              const min = Math.max(1, Math.floor(valor * 0.08));
              const max = Math.max(min + 1, Math.ceil(valor * 0.20));
              const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const firstName = String(customer?.name || "").trim().split(/\s+/)[0] || "";
              const simText =
                `🎉 *Pronto${firstName ? `, ${firstName}` : ""}!* Já fiz a *simulação* com base na sua conta.\n\n` +
                `💡 Conta atual: *R$ ${fmtBRL(valor)}*\n` +
                `💚 Economia estimada: *de R$ ${min} (8%) até R$ ${max} (20%)* todo mês\n\n` +
                `✅ Sem obra\n✅ Sem instalação\n✅ Mesma distribuidora — só muda quem fornece a energia\n\n` +
                `Bora *finalizar seu cadastro agora*? 🚀`;
              let phone = String(customer?.phone_whatsapp || "").replace(/\D/g, "");
              if (phone && !phone.startsWith("55")) phone = "55" + phone;
              if (phone) {
                const to = `${phone}@s.whatsapp.net`;
                await supabase.functions.invoke("whapi-proxy", {
                  body: { action: "send_text", consultantId: customer.consultant_id, payload: { to, text: simText } },
                });
                await supabase.from("conversations").insert({
                  customer_id: customer.id, message_direction: "outbound",
                  message_text: simText, message_type: "text", conversation_step: "simulacao_consultor",
                });
                await new Promise((r) => setTimeout(r, 1500));
              }
            }
          } catch (simErr: any) {
            console.warn("[confirm-self] simulação default falhou:", simErr?.message);
          }
        }

        await supabase.functions.invoke("manual-step-send", {
          body: {
            consultantId: customer.consultant_id,
            customerId: customer.id,
            stepKey: nextCaptureKey,
            part: "all",
            continueFlow: true,
            skipNameGuard: true,
          },
        });
      } catch (advErr: any) {
        console.warn("[confirm-self] advance flow failed:", advErr?.message);
      }

      toast({ title: "✓ Confirmado", description: "Avançando para o próximo passo…", duration: 1800 });
      onConfirmed?.();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(""); }
  };

  const askClient = async () => {
    setBusy("client");
    try {
      const lines = fields
        .map((f) => {
          const v = customer?.[f.key];
          if (v === null || v === undefined || String(v).trim() === "") return null;
          return `• *${f.label}:* ${String(v).trim()}`;
        })
        .filter(Boolean)
        .join("\n");
      const msg = kind === "bill"
        ? `Olá! Pra concluir seu cadastro, *confere se esses dados da sua CONTA de energia estão corretos*:\n\n${lines}\n\nResponda *SIM* se estiver tudo certo, ou me diga o que precisa corrigir 😉`
        : `Antes de finalizar, *confere os dados do seu documento*:\n\n${lines}\n\nResponda *SIM* se estiver correto, ou me diga o que precisa ajustar.`;
      let phone = String(customer.phone_whatsapp || "").replace(/\D/g, "");
      if (!phone) throw new Error("Lead sem telefone");
      if (!phone.startsWith("55")) phone = "55" + phone;
      const to = `${phone}@s.whatsapp.net`;

      const { data, error } = await supabase.functions.invoke("whapi-proxy", {
        body: { action: "send_text", consultantId: customer.consultant_id, payload: { to, text: msg } },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || "Falha");
      await supabase.from("customers").update({
        [kind === "bill" ? "bill_data_confirmation_by" : "doc_data_confirmation_by"]: "awaiting_client",
        ocr_review_pending: null,
        ocr_review_decided_at: new Date().toISOString(),
        ocr_review_decided_by: "awaiting_client",
      } as any).eq("id", customer.id);
      toast({ title: "📩 Enviado ao cliente", description: "Aguardando confirmação no WhatsApp", duration: 2200 });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(""); }
  };

  const awaiting = (kind === "bill" ? customer?.bill_data_confirmation_by : customer?.doc_data_confirmation_by) === "awaiting_client";

  return (
    <div className={`rounded-md border ${tone} p-2 space-y-1.5 animate-in fade-in slide-in-from-top-1`}>
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-[11px] font-bold uppercase tracking-wide">{title}</span>
        {isConfirmed && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">
            ✓ confirmado
          </span>
        )}
        {!isConfirmed && awaiting && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300 font-bold animate-pulse">
            aguardando cliente
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {fields.map((f) => {
          const v = customer?.[f.key];
          const filled = v !== null && v !== undefined && String(v).trim() !== "";
          if (!filled) return null;
          const isEditing = editing === f.key;
          return (
            <div key={f.key} className="flex items-center gap-1 min-w-0 text-[10px]">
              <span className="text-muted-foreground shrink-0 w-14 truncate">{f.label}:</span>
              {isEditing ? (
                <>
                  <Input
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); if (e.key === "Escape") setEditing(null); }}
                    autoFocus
                    className="h-5 text-[10px] px-1"
                  />
                  <button onClick={() => void saveEdit()} className="text-emerald-500 shrink-0"><Check className="w-3 h-3" /></button>
                  <button onClick={() => setEditing(null)} className="text-muted-foreground shrink-0"><X className="w-3 h-3" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate font-semibold" title={String(v)}>{String(v)}</span>
                  {!isConfirmed && (
                    <button onClick={() => { setEditing(f.key); setEditVal(String(v)); }} className="opacity-60 hover:opacity-100 shrink-0">
                      <Edit2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {!isConfirmed && (
        <div className="flex items-center gap-1 pt-1">
          <Button size="sm" className="h-6 flex-1 text-[10px] font-bold gap-1" onClick={() => void confirmSelf()} disabled={busy !== ""}>
            {busy === "self" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Eu confirmo
          </Button>
          <Button size="sm" variant="outline" className="h-6 flex-1 text-[10px] gap-1" onClick={() => void askClient()} disabled={busy !== ""}>
            {busy === "client" ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />}
            Pedir ao cliente
          </Button>
        </div>
      )}
    </div>
  );
}
