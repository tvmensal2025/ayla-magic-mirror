/**
 * Test mode infrastructure for bot end-to-end testing.
 *
 * When active:
 * - sleepForMedia() returns instantly (no waiting for audio/video to finish)
 * - sender wrapper logs to bot_test_outbound instead of calling Whapi
 * - OCR helpers return predictable mocked payloads instead of calling Gemini
 * - Audio transcription uses the supplied transcript instead of calling Gemini
 *
 * Activation: customer's phone_whatsapp starts with "5500000" (reserved test range).
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface TestStore {
  testMode: true;
  runId: string;
  supabase: any;
  turn: number;
  /**
   * Quando true → "Modo Real":
   *  - delays NÃO são pulados (paridade total com produção)
   *  - OCR/portal/OTP/facial usam serviços REAIS (sem mock)
   *  - outbound vai para Whapi REAL **e** é espelhado em bot_test_outbound
   *    pra UI do simulador conseguir mostrar.
   * Quando false/undefined → sandbox tradicional (mocks ligados, delays zerados).
   */
  realServices?: boolean;
  /**
   * Quando true → simulador pediu para ignorar a janela de silêncio
   * (21:30→08:00 BRT). Aplica-se apenas a esta run; produção real continua
   * respeitando quiet hours normalmente.
   */
  bypassQuietHours?: boolean;
}

/** True se a run atual pediu para ignorar quiet hours (simulador). */
export function shouldBypassQuietHours(): boolean {
  return botRequestStore.getStore()?.bypassQuietHours === true;
}

export const botRequestStore = new AsyncLocalStorage<TestStore>();

/** True quando estamos numa run do simulador (mock OU real). */
export function isTestMode(): boolean {
  return botRequestStore.getStore()?.testMode === true;
}

/** True apenas no sandbox tradicional (com mocks ligados). */
export function isMockMode(): boolean {
  const s = botRequestStore.getStore();
  return s?.testMode === true && s?.realServices !== true;
}

/** True se estamos espelhando outbound pra UI do simulador (Modo Real). */
export function isMirroringOutbound(): boolean {
  return botRequestStore.getStore()?.realServices === true;
}

export function getTestStore(): TestStore | undefined {
  return botRequestStore.getStore();
}

export function isTestPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^5500000/.test(String(phone).replace(/\D/g, ""));
}

/** Mocked OCR payload for an electricity bill. */
export function mockBillOcr() {
  return {
    sucesso: true,
    dados: {
      nome: "Joao Silva Teste",
      cpf: "12345678909",
      endereco: "Rua das Flores, 123",
      numero: "123",
      bairro: "Centro",
      cep: "01310100",
      cidade: "Sao Paulo",
      estado: "SP",
      distribuidora: "ENEL SP",
      numeroInstalacao: "9876543210",
      valorConta: "350.50",
      mes_referencia: "10/2025",
      confianca: 95,
    },
  };
}

/** Mocked OCR payload for an identity document (RG). */
export function mockDocOcr() {
  return {
    sucesso: true,
    dados: {
      nome: "Joao Silva Teste",
      cpf: "12345678909",
      rg: "12.345.678-9",
      dataNascimento: "15/05/1985",
      dataNascimentoConfianca: "alta",
      nome_pai: "Pedro Silva",
      nome_mae: "Maria Silva",
      tipo_documento: "RG",
      confianca: 95,
    },
  };
}

/** Records what the bot tried to send during a test turn. */
export async function logTestOutbound(
  kind: string,
  content: string,
): Promise<void> {
  const store = getTestStore();
  if (!store) return;
  try {
    await store.supabase.from("bot_test_outbound").insert({
      run_id: store.runId,
      turn: store.turn,
      direction: "outbound",
      kind,
      content: content.substring(0, 4000),
    });
  } catch (e) {
    console.error("[test-mode] logTestOutbound failed:", e);
  }
}
