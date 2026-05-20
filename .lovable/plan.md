# Fix: crash do ChatView (Captação)

## Problema
`useCaptureSession.ts` cria canal Realtime com nome fixo `capture-${customerId}`. Em remount (StrictMode/troca rápida de conversa) o Supabase devolve a instância já inscrita e `.on()` lança:
`cannot add postgres_changes callbacks ... after subscribe()`.
Isso derruba o `ChatView` inteiro e mostra "Ocorreu um erro ao carregar o WhatsApp".

Mesmo padrão pode estar em `useCaptureSuggestions.ts` — verificar e aplicar a mesma correção se necessário.

## Correção
1. **`src/hooks/useCaptureSession.ts`** (effect das linhas 72-80):
   - Gerar sufixo único por mount: `` `capture-${customerId}-${Math.random().toString(36).slice(2,8)}` ``.
   - Manter `.on(...).subscribe()` na ordem atual.
   - Cleanup continua chamando `supabase.removeChannel(ch)`.

2. **`src/hooks/useCaptureSuggestions.ts`**: aplicar o mesmo padrão de sufixo único se usar `supabase.channel(...)`.

3. Nenhuma mudança em UI, edge functions, DB ou lógica de negócio.

## Validação
- Abrir uma conversa → trocar para outra → voltar: sem crash.
- Console sem o erro `cannot add postgres_changes callbacks`.
- Botão 🎮 Captação continua abrindo o sheet e refletindo updates em tempo real.
