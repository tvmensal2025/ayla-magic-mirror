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
  /**
   * Quando true → simulador pediu pra encurtar as pausas artificiais entre
   * mensagens/mídias (sleepForMedia etc). Mantém OCR/Gemini/Portal/Whapi
   * 100% reais — apenas a cadência humana fica curta.
   */
  fastClock?: boolean;
}

/** True se a run atual pediu para ignorar quiet hours (simulador). */
export function shouldBypassQuietHours(): boolean {
  return botRequestStore.getStore()?.bypassQuietHours === true;
}

/** True se a run atual quer cadência acelerada (simulador). */
export function shouldUseFastClock(): boolean {
  return botRequestStore.getStore()?.fastClock === true;
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

/**
 * Versão robusta de `isMockMode` que NÃO depende de AsyncLocalStorage.
 *
 * `isMockMode()` lê do `botRequestStore` (AsyncLocalStorage). Em alguns
 * caminhos onde o handler é chamado via dynamic `import()` ou via fronteiras
 * de microtask que perdem o contexto async-local (Deno Edge runtime), o
 * store retorna `undefined` mesmo quando o webhook está rodando em sandbox.
 *
 * Esta função decide o mesmo a partir de fatos persistentes do customer:
 *   - `is_sandbox === true` (flag explícita do simulador)
 *   - phone começando com `5500000` (range de teste reservado)
 *
 * Use esta versão em handlers de OCR, portal worker e qualquer lugar onde
 * `isMockMode()` precise funcionar com 100% de confiabilidade dentro de
 * runBotFlow chamado por outros handlers.
 */
export function isCustomerSandbox(customer: { is_sandbox?: boolean | null; phone_whatsapp?: string | null } | null | undefined): boolean {
  if (!customer) return false;
  if (customer.is_sandbox === true) return true;
  if (isTestPhone(customer.phone_whatsapp ?? null)) return true;
  return false;
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
      // Alinhado ao OCR real (`_shared/ocr.ts` retorna camelCase: nomePai/nomeMae).
      // Antes o mock retornava `nome_pai`/`nome_mae` em snake_case e o consumer
      // (`bot-flow.ts:3579`) lia `d.nomePai`/`d.nomeMae`, sempre undefined no mock.
      nomePai: "Pedro Silva",
      nomeMae: "Maria Silva",
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
