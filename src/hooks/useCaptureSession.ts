import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

/** 10 campos que contam pra barra XP */
export const CAPTURE_FIELDS = [
  { key: "name", label: "Nome completo" },
  { key: "cpf", label: "CPF" },
  { key: "rg", label: "RG" },
  { key: "data_nascimento", label: "Nascimento" },
  { key: "phone_landline", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "cep", label: "CEP" },
  { key: "address_number", label: "Número" },
  { key: "electricity_bill_value", label: "Valor da conta" },
  { key: "document_front_url", label: "Documento" },
] as const;

export type CaptureFieldKey = typeof CAPTURE_FIELDS[number]["key"];

export interface CaptureCustomer {
  id: string;
  consultant_id: string;
  name: string | null;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  phone_whatsapp: string | null;
  phone_landline: string | null;
  email: string | null;
  cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  electricity_bill_value: number | null;
  document_front_url: string | null;
  document_back_url: string | null;
  electricity_bill_photo_url: string | null;
  capture_mode: string | null;
  capture_started_at: string | null;
  conversation_step: string | null;
  name_source?: string | null;
  created_at: string;
}

function isFieldFilled(c: CaptureCustomer | null | undefined, key: CaptureFieldKey): boolean {
  if (!c) return false;
  const v = (c as any)[key];
  if (v === null || v === undefined) return false;
  if (typeof v === "string" && !v.trim()) return false;
  if (key === "electricity_bill_value" && Number(v) <= 0) return false;
  return true;
}

export function useCaptureSession(customerId: string | null) {
  const [customer, setCustomer] = useState<CaptureCustomer | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) { setCustomer(null); return; }
    setLoading(true);
    const { data } = await supabase
      .from("customers")
      .select("id, consultant_id, name, cpf, rg, data_nascimento, phone_whatsapp, phone_landline, email, cep, address_street, address_number, address_complement, electricity_bill_value, document_front_url, document_back_url, electricity_bill_photo_url, capture_mode, capture_started_at, conversation_step, created_at")
      .eq("id", customerId)
      .maybeSingle();
    setCustomer((data as CaptureCustomer) || null);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!customerId) return;
    const ch = supabase
      .channel(`capture-${customerId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customers", filter: `id=eq.${customerId}` },
        (payload) => setCustomer((prev) => ({ ...(prev || {}), ...(payload.new as any) })))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [customerId]);

  const filledCount = useMemo(
    () => CAPTURE_FIELDS.filter((f) => isFieldFilled(customer, f.key)).length,
    [customer]
  );
  const totalFields = CAPTURE_FIELDS.length;
  const progress = Math.round((filledCount / totalFields) * 100);

  const updateField = useCallback(async (field: CaptureFieldKey, value: any) => {
    if (!customerId || !customer) return;
    const prevValue = (customer as any)[field];
    const wasFilled = isFieldFilled(customer, field);
    // optimistic
    setCustomer((c) => c ? ({ ...c, [field]: value }) as CaptureCustomer : c);
    const { error } = await supabase
      .from("customers")
      .update({ [field]: value })
      .eq("id", customerId);
    if (error) {
      // rollback
      setCustomer((c) => c ? ({ ...c, [field]: prevValue }) as CaptureCustomer : c);
      throw error;
    }
    const nowFilled = value !== null && value !== undefined && String(value).trim() !== "";
    if (!wasFilled && nowFilled) {
      // log event for XP analytics
      await supabase.from("capture_field_events").insert({
        consultant_id: customer.consultant_id,
        customer_id: customerId,
        field,
        source: "manual",
      });
    }
  }, [customerId, customer]);

  return { customer, loading, filledCount, totalFields, progress, updateField, reload: load };
}
