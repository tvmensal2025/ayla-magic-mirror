// Shared types for evolution-webhook handlers.
// Defines the BotContext object passed through bot-flow handlers
// so we don't need to keep dozens of free variables in scope.

// Use `any` para o client do Supabase para evitar conflitos de tipos genéricos
// quando o orchestrator (index.ts) chama os handlers. Os tipos do banco são
// validados em runtime pelas queries.
// deno-lint-ignore no-explicit-any
export type SupabaseClient = any;

// deno-lint-ignore no-explicit-any
export type EvolutionSender = any;

export interface BotContext {
  // Supabase + sender
  supabase: SupabaseClient;
  sender: EvolutionSender;

  // Customer + identity
  customer: any;
  consultorId: string;
  nomeRepresentante: string;

  // Inbound message
  remoteJid: string;
  phone: string;
  messageText: string;
  buttonId: string | null;
  isFile: boolean;
  isButton: boolean;
  hasImage: boolean;
  hasDocument: boolean;
  imageMessage: any;
  documentMessage: any;
  message: any;
  key: any;
  messageId: string;

  // Media (resolved before bot flow)
  fileUrl: string | null;
  fileBase64: string | null;

  // Env
  geminiApiKey: string;
}

export interface BotResult {
  reply: string;
  updates: Record<string, any>;
}
