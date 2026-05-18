import { supabase } from "@/integrations/supabase/client";

export type AdImageFormat = "square" | "vertical" | "story";

export interface AdImageLibraryItem {
  id: string;
  consultant_id: string;
  url: string;
  storage_path: string | null;
  format: AdImageFormat;
  width: number | null;
  height: number | null;
  file_size: number | null;
  content_type: string | null;
  filename: string | null;
  fb_image_hash: string | null;
  fb_image_hash_synced_at: string | null;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
}

export async function listAdImageLibrary(consultantId: string): Promise<AdImageLibraryItem[]> {
  const { data, error } = await supabase
    .from("ad_image_library" as any)
    .select("*")
    .eq("consultant_id", consultantId)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []) as unknown as AdImageLibraryItem[];
}

export async function addToAdImageLibrary(item: {
  consultant_id: string;
  url: string;
  storage_path?: string | null;
  format: AdImageFormat;
  width?: number | null;
  height?: number | null;
  file_size?: number | null;
  content_type?: string | null;
  filename?: string | null;
}): Promise<AdImageLibraryItem | null> {
  // Evita duplicar mesma URL
  const { data: existing } = await supabase
    .from("ad_image_library" as any)
    .select("*")
    .eq("consultant_id", item.consultant_id)
    .eq("url", item.url)
    .maybeSingle();
  if (existing) return existing as unknown as AdImageLibraryItem;

  const { data, error } = await supabase
    .from("ad_image_library" as any)
    .insert(item as any)
    .select()
    .single();
  if (error) {
    console.warn("[adImageLibrary] insert falhou:", error.message);
    return null;
  }
  return data as unknown as AdImageLibraryItem;
}

export async function removeFromAdImageLibrary(id: string, storagePath?: string | null) {
  if (storagePath) {
    try {
      await supabase.storage.from("consultant-photos").remove([storagePath]);
    } catch (e) { console.warn("[adImageLibrary] remove storage falhou:", e); }
  }
  const { error } = await supabase.from("ad_image_library" as any).delete().eq("id", id);
  if (error) throw error;
}
