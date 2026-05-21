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
  if (confirmedAt) return null; // já confirmado — some

  const title = kind === "bill" ? "📄 Dados lidos da CONTA" : "🪪 Dados lidos do DOCUMENTO";
  const Icon = kind === "bill" ? FileText : IdCard;
  const tone = kind === "bill" ? "border-amber-400/60 bg-amber-400/5" : "border-cyan-400/60 bg-cyan-400/5";

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
      await supabase.from("customers").update({
        [kind === "bill" ? "bill_data_confirmed_at" : "doc_data_confirmed_at"]: new Date().toISOString(),
        [kind === "bill" ? "bill_data_confirmation_by" : "doc_data_confirmation_by"]: "consultant",
      }).eq("id", customer.id);
      toast({ title: "✓ Confirmado", duration: 1500 });
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
      }).eq("id", customer.id);
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
        {awaiting && (
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
                  <button onClick={() => { setEditing(f.key); setEditVal(String(v)); }} className="opacity-60 hover:opacity-100 shrink-0">
                    <Edit2 className="w-2.5 h-2.5" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

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
    </div>
  );
}
