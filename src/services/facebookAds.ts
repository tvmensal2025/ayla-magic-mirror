import { supabase } from "@/integrations/supabase/client";

async function throwFunctionError(error: any): Promise<never> {
  const response = error?.context as Response | undefined;
  if (response && typeof response.clone === "function") {
    try {
      const payload = await response.clone().json();
      if (payload?.error) throw new Error(payload.error);
    } catch (parsed) {
      if (parsed instanceof Error && parsed.message) throw parsed;
    }
  }
  throw error;
}

export interface OAuthStartResult { url: string; logout_url?: string; mode: "connect" | "switch"; scope: "user" | "platform" }
export type OAuthStartOptions = { mode?: "connect" | "switch"; scope?: "user" | "platform" };
export async function startFacebookOAuth(opts: OAuthStartOptions | "connect" | "switch" = {}): Promise<OAuthStartResult> {
  const o: OAuthStartOptions = typeof opts === "string" ? { mode: opts } : opts;
  const mode = o.mode ?? "connect";
  const scope = o.scope ?? "user";
  const { data, error } = await supabase.functions.invoke("facebook-oauth-start", {
    body: { mode, scope, return_origin: window.location.origin },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("URL de autorização não recebida");
  return data as OAuthStartResult;
}

export interface FbAdAccount { id: string; name: string; currency: string; status: number }
export interface FbPage { id: string; name: string; instagram_id: string | null; instagram_username: string | null }
export interface FbPixel { id: string; name: string }
export interface FbAssets {
  ad_accounts: FbAdAccount[];
  pages: FbPage[];
  pixels_by_ad_account: Record<string, FbPixel[]>;
  errors?: { ad_accounts: string | null; pages: string | null };
}
export async function listFacebookAssets(opts: { scope?: "user" | "platform" } = {}): Promise<FbAssets> {
  const { data, error } = await supabase.functions.invoke("facebook-list-assets", { body: opts });
  if (error) throw error;
  return data as FbAssets;
}
export async function selectFacebookAssets(payload: {
  ad_account_id?: string | null;
  page_id?: string | null;
  pixel_id?: string | null;
  whatsapp_destination_number?: string | null;
  scope?: "user" | "platform";
}) {
  const { data, error } = await supabase.functions.invoke("facebook-select-assets", { body: payload });
  if (error) throw error;
  return data as { ok: boolean; updated: boolean; fields?: string[] };
}

export interface ValidateResult { ok: boolean; issues: string[] }
export async function validateAccount(): Promise<ValidateResult> {
  const { data, error } = await supabase.functions.invoke("facebook-validate-account", { body: {} });
  if (error) throw error;
  return data as ValidateResult;
}

export interface SyncAudiencesResult {
  ok: boolean;
  custom_audience_id: string | null;
  lookalike_audience_id: string | null;
  uploaded: number;
  lal_status: "created" | "pending_or_failed";
}
export async function syncAudiences(): Promise<SyncAudiencesResult> {
  const { data, error } = await supabase.functions.invoke("facebook-sync-audiences", { body: {} });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as SyncAudiencesResult;
}

export interface CityHit { key: string; name: string; region?: string; region_id?: number; type?: string; country_code?: string }
export async function searchCities(q: string): Promise<CityHit[]> {
  const { data, error } = await supabase.functions.invoke("facebook-search-cities", { body: { q } });
  if (error) throw error;
  return (data?.cities || []) as CityHit[];
}

// Resolve várias cidades de uma vez (cache no banco).
export interface UnresolvedCity { name: string; uf: string; reason: string }
export interface BulkCityResult { cities: CityHit[]; unresolved: UnresolvedCity[] }
export async function searchCitiesBulk(items: { name: string; uf: string }[]): Promise<BulkCityResult> {
  const { data, error } = await supabase.functions.invoke("facebook-search-cities", { body: { bulk: items } });
  if (error) throw error;
  return { cities: (data?.cities || []) as CityHit[], unresolved: (data?.unresolved || []) as UnresolvedCity[] };
}

export interface CopyPack { headlines: string[]; primary_texts: string[]; description: string }
export interface CopyVariation { text: string; framework: string; score: number }
export interface CopyPackV2 extends CopyPack { variations?: { headlines: CopyVariation[]; primary_texts: CopyVariation[] } }
export async function generateCopy(cities: string[]): Promise<CopyPack> {
  const { data, error } = await supabase.functions.invoke("ad-creative-builder", { body: { cities } });
  if (error) throw error;
  return data as CopyPackV2;
}

export interface PreflightResult {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  reach: { lower: number; upper: number; daily_min: number; daily_max: number } | null;
}
export async function preflightCampaign(input: { cities: { key: string; name: string }[]; daily_budget_cents: number }): Promise<PreflightResult> {
  const { data, error } = await supabase.functions.invoke("facebook-preflight-check", { body: input });
  if (error) throw error;
  return data as PreflightResult;
}

export interface CreateCampaignBody {
  name: string;
  cities: { key: string; name: string }[];
  daily_budget_cents: number;
  duration_days?: number | null;
  age_min?: number;
  age_max?: number;
  // Cada foto vem com seu formato pra que o backend monte asset_feed_spec
  // com customization por posicionamento (resolve corte de cabeça em Reels).
  photos: { url: string; format: "square" | "vertical" | "story" }[];
  headline: string;
  primary_text: string;
  description?: string;
  distribuidora?: string;
  // Galeria pública de templates do Super Admin → consultor publica em 1 toque.
  template_id?: string | null;
  // "auto" (Advantage+ Placements — recomendação Meta) ou "manual" com lista.
  placement_mode?: "auto" | "manual";
  // Quando manual: lista no formato "fb:feed", "fb:reels", "ig:story"...
  placements?: string[];
}
export async function createCampaign(body: CreateCampaignBody) {
  const { data, error } = await supabase.functions.invoke("facebook-create-campaign", { body });
  if (error) await throwFunctionError(error);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { ok: true; campaign_id: string; adset_id: string; ad_ids: string[]; ads_count: number };
}

export async function uploadAdPhotos(consultantId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const f of files) {
    const path = `${consultantId}/ads/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    try {
      const { error } = await supabase.storage.from("consultant-photos").upload(path, f, { upsert: true, contentType: f.type });
      if (error) throw error;
      const { data } = supabase.storage.from("consultant-photos").getPublicUrl(path);
      urls.push(data.publicUrl);
    } catch (directUploadError) {
      const formData = new FormData();
      formData.append("file", f);
      formData.append("consultant_id", consultantId);
      const { data, error } = await supabase.functions.invoke("upload-ad-photo", { body: formData });
      if (error) await throwFunctionError(error);
      if ((data as any)?.error || !(data as any)?.url) {
        throw new Error((data as any)?.error || (directUploadError as Error)?.message || "Falha ao enviar imagem.");
      }
      urls.push((data as any).url);
    }
  }
  return urls;
}

// =============== Wallet (carteira pré-paga compartilhada) ===============
export interface WalletBalance {
  balance_cents: number;
  total_topped_up_cents: number;
  total_spent_cents: number;
  auto_pause_at_cents: number;
}
export async function getWalletBalance(consultantId: string): Promise<WalletBalance> {
  const { data, error } = await supabase
    .from("consultant_wallet")
    .select("balance_cents,total_topped_up_cents,total_spent_cents,auto_pause_at_cents")
    .eq("consultant_id", consultantId)
    .maybeSingle();
  if (error && (error as any).code !== "PGRST116") throw error;
  return {
    balance_cents: Number(data?.balance_cents ?? 0),
    total_topped_up_cents: Number(data?.total_topped_up_cents ?? 0),
    total_spent_cents: Number(data?.total_spent_cents ?? 0),
    auto_pause_at_cents: Number(data?.auto_pause_at_cents ?? 500),
  };
}

export interface WalletTransaction {
  id: string;
  type: "topup" | "spend" | "refund" | "adjustment";
  amount_cents: number;
  balance_after_cents: number | null;
  description: string | null;
  created_at: string;
}
export async function getWalletTransactions(consultantId: string, limit = 30): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("id,type,amount_cents,balance_after_cents,description,created_at")
    .eq("consultant_id", consultantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as WalletTransaction[];
}

export async function createTopupSession(amountCents: number): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("wallet-create-topup", { body: { amount_cents: amountCents } });
  if (error) await throwFunctionError(error);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { url: string };
}

// =============== Configurações de anúncio do consultor ===============
export interface ConsultantAdSettings {
  whatsapp_destination_number: string | null;
  cities: { key: string; name: string; uf?: string }[];
  distribuidora_default: string | null;
  display_name: string | null;
  age_min: number;
  age_max: number;
}
export async function getConsultantAdSettings(consultantId: string): Promise<ConsultantAdSettings> {
  const { data, error } = await supabase
    .from("consultant_ad_settings")
    .select("*")
    .eq("consultant_id", consultantId)
    .maybeSingle();
  if (error && (error as any).code !== "PGRST116") throw error;
  return {
    whatsapp_destination_number: data?.whatsapp_destination_number ?? null,
    cities: ((data?.cities as any) || []) as ConsultantAdSettings["cities"],
    distribuidora_default: data?.distribuidora_default ?? null,
    display_name: data?.display_name ?? null,
    age_min: data?.age_min ?? 28,
    age_max: data?.age_max ?? 60,
  };
}
export async function saveConsultantAdSettings(consultantId: string, patch: Partial<ConsultantAdSettings>) {
  const { error } = await supabase
    .from("consultant_ad_settings")
    .upsert({ consultant_id: consultantId, ...patch, updated_at: new Date().toISOString() } as any, { onConflict: "consultant_id" });
  if (error) throw error;
}

// =============== Plataforma (Super Admin) ===============
export interface PlatformFacebookStatus {
  connected: boolean;
  configured: boolean;
  ad_account_id: string | null;
  ad_account_name: string | null;
  page_id: string | null;
  page_name: string | null;
  pixel_id: string | null;
  fb_user_name: string | null;
  token_expires_at: string | null;
}
export async function getPlatformFacebookStatus(): Promise<PlatformFacebookStatus> {
  const { data, error } = await supabase
    .from("platform_facebook_account")
    .select("fb_user_id,ad_account_id,ad_account_name,page_id,page_name,pixel_id,fb_user_name,token_expires_at")
    .eq("id", true)
    .maybeSingle();
  if (error && (error as any).code !== "PGRST116") throw error;
  const configured = !!data?.ad_account_id && !!data?.page_id;
  return {
    connected: !!data?.fb_user_id || !!data?.fb_user_name || configured,
    configured,
    ad_account_id: data?.ad_account_id ?? null,
    ad_account_name: data?.ad_account_name ?? null,
    page_id: data?.page_id ?? null,
    page_name: data?.page_name ?? null,
    pixel_id: data?.pixel_id ?? null,
    fb_user_name: data?.fb_user_name ?? null,
    token_expires_at: data?.token_expires_at ?? null,
  };
}
