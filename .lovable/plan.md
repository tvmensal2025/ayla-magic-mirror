# Auditoria do Fluxo Padrão A — Rafael Ferreiras (10 passos)

Fluxo: `Fluxo Padrão` variante **A** (B existe mas você disse que está desligado; C não existe).
Os 10 passos vão de `position 2` a `11`. **Ponteiros `goto_step_id` estão todos corretos** (apontam pros `id` das próximas linhas). Os problemas reais são de **lógica de transição** e **conteúdo**.

## Problemas encontrados

### 🔴 1. Passo 6 trava o lead em silêncio

Posição 6 (`passo_mpagqq3g`) tem **uma única transição** com `trigger_intent: afirmacao` (sim/ok/quero/vamos/pode). Se o lead responder qualquer outra coisa — "explica melhor", "quanto custa", "como funciona", "tenho dúvida" — o resolver retorna `reply:""` e **não avança nem repete a pergunta**. Lead fica mudo.

### 🔴 2. Passo 8 trava o lead em silêncio (mesmo bug)

Posição 8 ("Deu para entender? Vamos fazer seu cadastro?") só aceita `afirmacao` (sim/entendi/beleza/vamos/ok/quero/bora/claro/perfeito). Quem responder "tenho dúvida", "espera", "explica de novo", "não entendi" → fica preso, **nunca chega no capture_conta (pos 9)**. É o principal gargalo do funil.

### 🟡 3. Passo 7 sem transição definida

Posição 7 (`fazenda_solar`) tem `transitions: []` e `wait_for: none`. Hoje o resolver cai no fallback `findNextActiveFlowStep(position+1)` e segue. Funciona por acidente — qualquer mudança no engine quebra. Precisa transição `default → pos 8` explícita.

### 🟡 4. Passo 7 com texto truncado/incompleto

`message_text` está cortado: `"É simples, mas vou mandar um audio e um  para ficar mais facil de entender "` — falta a palavra entre "um" e "para" (provavelmente "vídeo"). Texto chega torto pro lead.

### ℹ️ 5. Passos 2 e 6 com `message_text` vazio

Estão configurados pra enviar só mídia (slot `passo_mp8yc0bp` e `passo_mpagqq3g`). **Verificar no MinIO** se a mídia existe e está carregando — se não, o passo manda nada. Esse é um candidato silencioso pra "fluxo não responde".

## Plano de correção (DB-only, sem alterar código)

Tudo é UPDATE em `bot_flow_steps`. Posso aplicar via migração.

### A. Adicionar fallback `default` nos passos 6 e 8

Para cada um, transformar de:

```
[{ trigger_intent: "afirmacao", goto_step_id: <next> }]
```

em:

```
[
  { trigger_intent: "afirmacao", goto_step_id: <next> },
  { trigger_intent: "default",   goto_step_id: <next>, trigger_phrases: [] }
]
```

Assim, qualquer resposta avança. (Alternativa: deixar default re-disparar o mesmo passo para "insistir" — recomendo avançar, é menos invasivo.)

### B. Adicionar transição explícita no passo 7

`transitions: [{ trigger_intent: "default", goto_step_id: <id da pos 8>, trigger_phrases: [] }]`

### C. Corrigir o texto do passo 7

Trocar para algo como: `"É simples — vou te mandar um áudio e um vídeo curtos pra ficar mais fácil de entender."`
(Te confirmo a copy antes de gravar.)

### D. Verificar mídias dos passos 2 e 6

Vou listar URLs no `bot_flow_media` desses dois passos. Se faltar arquivo, te aviso pra subir.

## Fora do escopo

- Variantes B/C (você confirmou que estão desligadas).
- Outros 12 consultores que têm cópias do mesmo fluxo (mesma estrutura, mesmos bugs herdados). Posso replicar a correção em massa depois que você validar no seu.

## Validação após aplicar

1. Mandar mensagem como lead novo → passa por 1-2→3→4→5→6.
2. Responder no passo 6 com "**explica melhor**" (não-afirmação) → deve seguir pra 7 em vez de travar.
3. Responder no passo 8 com "**tenho dúvida**" → deve seguir pra 9 (pedir conta de luz) em vez de travar.
4. Conferir nos logs do `whapi-webhook` que não há mais `reply:""` por falta de match de intent.