import { supabase } from "@/integrations/supabase/client";

export type AdPhotoFormat = "square" | "vertical" | "story";
export interface AdTemplatePhoto { url: string; format: AdPhotoFormat }

export interface AdTemplate {
  id: string;
  title: string;
  description: string | null;
  photos: AdTemplatePhoto[];
  headline: string;
  primary_text: string;
  description_text: string;
  headline_variants: string[];
  primary_text_variants: string[];
  age_min: number;
  age_max: number;
  genders: string[];
  suggested_daily_budget_cents: number;
  status: "draft" | "published" | "archived";
  usage_count: number;
  avg_cpl_cents: number | null;
  created_at: string;
  updated_at: string;
  target_distribuidora_ids: string[];
  target_cidades: string[];
}

function row(r: any): AdTemplate {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    photos: Array.isArray(r.photos) ? r.photos : [],
    headline: r.headline ?? "",
    primary_text: r.primary_text ?? "",
    description_text: r.description_text ?? "",
    headline_variants: Array.isArray(r.headline_variants) ? r.headline_variants : [],
    primary_text_variants: Array.isArray(r.primary_text_variants) ? r.primary_text_variants : [],
    age_min: r.age_min ?? 28,
    age_max: r.age_max ?? 60,
    genders: r.genders ?? [],
    suggested_daily_budget_cents: r.suggested_daily_budget_cents ?? 3000,
    status: r.status ?? "draft",
    usage_count: r.usage_count ?? 0,
    avg_cpl_cents: r.avg_cpl_cents ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    target_distribuidora_ids: Array.isArray(r.target_distribuidora_ids) ? r.target_distribuidora_ids : [],
    target_cidades: Array.isArray(r.target_cidades) ? r.target_cidades : [],
  };
}

export async function listAdTemplates(opts?: { onlyPublished?: boolean }): Promise<AdTemplate[]> {
  let q = supabase.from("ad_templates").select("*").order("updated_at", { ascending: false });
  if (opts?.onlyPublished) q = q.eq("status", "published");
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(row);
}

export async function upsertAdTemplate(t: Partial<AdTemplate> & { id?: string }) {
  const payload: any = {
    title: t.title,
    description: t.description ?? null,
    photos: t.photos ?? [],
    headline: t.headline ?? "",
    primary_text: t.primary_text ?? "",
    description_text: t.description_text ?? "",
    headline_variants: (t.headline_variants ?? []).filter(Boolean),
    primary_text_variants: (t.primary_text_variants ?? []).filter(Boolean),
    age_min: t.age_min ?? 28,
    age_max: t.age_max ?? 60,
    genders: t.genders ?? [],
    suggested_daily_budget_cents: t.suggested_daily_budget_cents ?? 3000,
    status: t.status ?? "draft",
    updated_at: new Date().toISOString(),
    target_distribuidora_ids: t.target_distribuidora_ids ?? [],
    target_cidades: t.target_cidades ?? [],
  };
  if (t.id) payload.id = t.id;
  const { data, error } = await supabase
    .from("ad_templates")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return row(data);
}

export async function deleteAdTemplate(id: string) {
  const { error } = await supabase.from("ad_templates").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadAdTemplateImage(file: File, templateId: string): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `ad-templates/${templateId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("IMAGE").upload(path, file, {
    upsert: true, contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("IMAGE").getPublicUrl(path);
  return data.publicUrl;
}