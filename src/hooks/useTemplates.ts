import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MessageTemplate } from "@/types/whatsapp";

/**
 * Pure function that replaces placeholders in a template with customer data.
 * Exported separately so it can be tested independently.
 */
export function applyTemplate(
  template: MessageTemplate,
  customer: { name: string; electricity_bill_value?: number }
): string {
  const name = String(customer.name || "").trim();
  const firstName = name.split(/\s+/)[0] || "";
  const bill = customer.electricity_bill_value;
  const billStr =
    bill != null && Number.isFinite(Number(bill))
      ? String(bill)
      : "";

  // Substitui {chave} e {{chave}} em qualquer caixa (NOME, Nome, nome) com espaços.
  return String(template.content || "").replace(
    /\{\{?\s*([a-zA-ZÀ-ÿ_][\w\sÀ-ÿ-]{0,40})\s*\}?\}/g,
    (match, rawKey: string) => {
      const key = String(rawKey).trim().toLowerCase();
      if (key === "nome" || key === "first_name" || key === "primeiro_nome" || key === "cliente") return firstName;
      if (key === "nome_completo" || key === "name") return name;
      if (key === "valor_conta" || key === "valor" || key === "conta" || key === "fatura") return billStr;
      return match;
    },
  );
}

export function useTemplates(consultantId: string) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchTemplates = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*");

      if (error) throw error;
      if (mountedRef.current) {
        setTemplates((data as MessageTemplate[]) ?? []);
      }
    } catch (err) {
      console.warn("[useTemplates] fetch error:", err);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [consultantId]);

  const createTemplate = useCallback(
    async (name: string, content: string, mediaType: string = "text", mediaUrl: string | null = null, imageUrl: string | null = null) => {
      const { error } = await supabase.from("message_templates").insert({
        consultant_id: consultantId,
        name,
        content,
        media_type: mediaType,
        media_url: mediaUrl,
        image_url: imageUrl,
      });
      if (error) throw error;
      await fetchTemplates();
    },
    [consultantId, fetchTemplates]
  );

  const updateTemplate = useCallback(
    async (id: string, updates: { name?: string; image_url?: string | null; content?: string; media_url?: string | null; media_type?: string; is_quick_reply?: boolean }) => {
      const { error, data, count } = await supabase
        .from("message_templates")
        .update(updates)
        .eq("id", id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        console.error("Template update blocked by RLS or not found. ID:", id, "Updates:", updates);
        throw new Error("Não foi possível atualizar o template. Verifique se você está autenticado.");
      }
      await fetchTemplates();
    },
    [fetchTemplates]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      const { error, data } = await supabase
        .from("message_templates")
        .delete()
        .eq("id", id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Não foi possível excluir o template. Verifique se você é o proprietário.");
      }
      await fetchTemplates();
    },
    [fetchTemplates]
  );

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Permite refresh disparado por componentes filhos (ex: SaveMessageAsTemplateDialog)
  useEffect(() => {
    const handler = () => { fetchTemplates(); };
    window.addEventListener("templates:refresh", handler);
    return () => window.removeEventListener("templates:refresh", handler);
  }, [fetchTemplates]);

  return {
    templates,
    isLoading,
    refetchTemplates: fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplate,
  };
}
