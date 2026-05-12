import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

function getDeviceType(): string {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function getUtmParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") || null,
    utm_medium: params.get("utm_medium") || null,
    utm_campaign: params.get("utm_campaign") || null,
  };
}

export function useCrmPageView() {
  useEffect(() => {
    supabase.from("crm_page_events").insert({
      event_type: "view",
      device_type: getDeviceType(),
      referrer: document.referrer || null,
      ...getUtmParams(),
    } as any).then(() => {});
  }, []);
}

export function trackCrmClick(eventTarget: string) {
  supabase.from("crm_page_events").insert({
    event_type: "click",
    event_target: eventTarget,
    device_type: getDeviceType(),
    referrer: document.referrer || null,
    ...getUtmParams(),
  } as any).then(() => {});
}
