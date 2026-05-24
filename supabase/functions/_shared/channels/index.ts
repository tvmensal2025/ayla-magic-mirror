// Channel factory (Phase A da spec whatsapp-flow-architecture-v3, Task 7).
//
// Único ponto de entrada para obter um `ChannelAdapter`. Webhook nunca
// instancia adapter direto — chama `getAdapter(channel, config)`.
//
// Exporta também os tipos canônicos para callers em outros módulos.

import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelKind,
  MediaPayload,
  OutboundChoice,
  ParsedMessage,
  SendContext,
  SendResult,
} from "./types.ts";
import { createEvolutionAdapter, type CreateEvolutionAdapterInput } from "./evolution.ts";
import { createWhapiAdapter, type CreateWhapiAdapterInput } from "./whapi.ts";

export type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelKind,
  MediaPayload,
  OutboundChoice,
  ParsedMessage,
  SendContext,
  SendResult,
};

export type AdapterConfig =
  | { kind: "evolution"; input: CreateEvolutionAdapterInput }
  | { kind: "whapi"; input: CreateWhapiAdapterInput };

/**
 * Retorna um adapter para o canal solicitado. NÃO faz cache global porque
 * cada Edge Function tem seu próprio escopo de instância (instanceName,
 * connectedPhone, apiToken). Caller cria uma vez por request.
 */
export function getAdapter(config: AdapterConfig): ChannelAdapter {
  if (config.kind === "evolution") {
    return createEvolutionAdapter(config.input);
  }
  return createWhapiAdapter(config.input);
}
