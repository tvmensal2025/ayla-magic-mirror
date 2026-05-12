// Captura e persistência de fbclid + utm pra atribuição de leads.
const KEY = "igreen_lead_source";

export interface LeadSource {
  fbclid?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  captured_at: string;
}

export function captureLeadSource(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid");
  const utm_source = params.get("utm_source");
  const utm_medium = params.get("utm_medium");
  const utm_campaign = params.get("utm_campaign");
  const campaign_id = params.get("campaign_id") || params.get("hsa_cam");
  const adset_id = params.get("adset_id");
  const ad_id = params.get("ad_id");
  if (!fbclid && !utm_source && !campaign_id) return;

  const data: LeadSource = {
    ...(fbclid && { fbclid }),
    ...(campaign_id && { campaign_id }),
    ...(adset_id && { adset_id }),
    ...(ad_id && { ad_id }),
    ...(utm_source && { utm_source }),
    ...(utm_medium && { utm_medium }),
    ...(utm_campaign && { utm_campaign }),
    captured_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function getLeadSource(): LeadSource | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LeadSource;
  } catch {
    return null;
  }
}
