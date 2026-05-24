// Logger central (Phase F Task 31 do whatsapp-flow-architecture-v3).
//
// Único ponto de entrada para logs estruturados do core. Toda linha sai
// como JSON única (Supabase / Loki coletam). `kind` é validado pelo
// TypeScript via union type — se o caller tentar `log("xpto", {})` com
// string fora do enum, o compilador rejeita.
//
// O `_shared/audit.ts` continua existindo com `jsonLog` para casos legados.
// Este logger é a forma canônica para módulos novos do core (engine,
// dispatcher, channels, captation, conversion, performance).

export type LogKind =
  // Webhook
  | "webhook_inbound"
  | "webhook_dedup_hit"
  | "webhook_rate_limited"
  // Customer lock
  | "customer_lock_acquired"
  | "customer_lock_timeout"
  | "customer_lock_released"
  | "customer_lock_error"
  // Engine
  | "engine_step_advance"
  | "engine_choice_downgrade"
  | "engine_invalid_input"
  | "engine_invalid_step"
  | "engine_precondition_failed"
  | "engine_handoff"
  | "engine_no_match"
  | "engine_delegate_legacy"
  | "engine_delegate_legacy_failed"
  | "engine_delegate_legacy_no_hook"
  | "engine_auto_resume"
  | "engine_dark_decision"
  | "engine_v3_state_loaded"
  | "engine_error"
  // Channel
  | "channel_send_ok"
  | "channel_send_fail"
  | "channel_choice_downgrade"
  | "channel_adapter_ready"
  // Captação / Performance / CRM
  | "lead_source_tagged"
  | "lead_source_tag_failed"
  | "lead_source_campaign_matched"
  | "crm_sync_failed"
  | "metrics_record_failed"
  // IA / grounding
  | "ai_invalid_next_step"
  | "ai_hallucinated_media_id"
  | "ai_invalid_audio_slot"
  | "ai_reply_scrubbed"
  | "ai_precondition_failed"
  | "ai_deterministic_fallback"
  // Mídia inbound
  | "evolution_media_lost"
  | "evolution_dedup_short_circuit"
  | "inbound_media_retry_enqueued"
  | "inbound_media_retry_succeeded"
  | "inbound_media_retry_failed"
  // Outras
  | "gemini_quota_exhausted"
  | "inline_sent_skipped"
  | "outbound_replay_short_circuit"
  | "send_audio_slot_pending"
  | "feature_flag_resolved"
  | "rate_limit_disagreement"
  | "rate_limit_rpc_failed"
  | "rate_limit_rpc_exception"
  | "rate_limit_checked"
  | "consultant_opening_step_detected"
  | "consultant_opening_step_check_failed"
  | "consultant_opening_step_dark_skip"
  | "evolution_dedup_disagreement"
  | "evolution_dedup_hash_query_failed"
  | "evolution_dedup_hash_exception"
  | "customer_lock_setup_failed"
  | "customer_lock_skipped_new_lead"
  | "outbound_done"
  | "handler_done"
  | "duplicate message ignored"
  | "dedup_checked";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Emite uma linha JSON única. `kind` é validado em compile time.
 * Não é assíncrono — escreve via console.log direto. O Supabase
 * coleta via stdout.
 */
export function log(level: LogLevel, kind: LogKind, payload: Record<string, unknown> = {}): void {
  try {
    const line = {
      level,
      kind,
      ts: new Date().toISOString(),
      ...payload,
    };
    const out = JSON.stringify(line);
    if (level === "error") console.error(out);
    else if (level === "warn") console.warn(out);
    else console.log(out);
  } catch (e) {
    // JSON.stringify falhou (circular reference?) — fallback texto puro.
    console.error(`[logger] kind=${kind} (json failed): ${(e as Error).message}`);
  }
}

/** Açúcar — equivalente a `log('info', kind, payload)`. */
export const info = (kind: LogKind, payload?: Record<string, unknown>) => log("info", kind, payload);
export const warn = (kind: LogKind, payload?: Record<string, unknown>) => log("warn", kind, payload);
export const debug = (kind: LogKind, payload?: Record<string, unknown>) => log("debug", kind, payload);
export const error = (kind: LogKind, payload?: Record<string, unknown>) => log("error", kind, payload);
