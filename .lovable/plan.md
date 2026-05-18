## Ligando TODOS os 11 passos em sequência (sem pular nenhum)

Você criou todos pensando que vão funcionar — então a ordem é simples: cada passo vai para o próximo, em linha reta, e o "Quebra de objeção" entra quando o cliente disser "não entendi" no passo 9.

### Fluxo linear (todos os passos serão executados)

```text
[2] Nome do cliente
      │  captura {{nome}}
      ▼
[3] Boas Vindas
      │
      ▼
[4] Qual o valor da conta de luz
      │  captura {{valor_conta}}
      ▼
[5] Valor da conta (reação)
      │
      ▼
[6] Perguntando se pode explicar
      │  "ok/pode/sim" → segue   |   "não/agora não" → segue mesmo assim (sem travar)
      ▼
[7] Como funciona (áudio + vídeo)
      │
      ▼
[8] Quebra de objeção
      │
      ▼
[9] Deu para entender?
      │  "sim" → segue
      │  "não/dúvida" → volta para [8] uma vez, depois segue
      ▼
[10] Conta de energia (capture_conta)
      │
      ▼
[11] Cadastro (capture_documento)
      │
      ▼
[12] Confirmação (finalizar_cadastro)
```

### Transições (default = sempre avança para o próximo)

| De | Para | Gatilho |
|---|---|---|
| 2 Nome | 3 Boas Vindas | default (após capturar nome) |
| 3 Boas Vindas | 4 Qual valor | default |
| 4 Qual valor | 5 Valor da conta | default (após capturar valor) |
| 5 Valor da conta | 6 Perguntando se pode explicar | default |
| 6 Perguntando | 7 Como funciona | default (qualquer resposta segue) |
| 7 Como funciona | 8 Quebra de objeção | default |
| 8 Quebra de objeção | 9 Deu para entender | default |
| 9 Deu para entender | 10 Conta energia | afirmação (sim/vamos/ok) |
| 9 Deu para entender | 8 Quebra de objeção | negação (não/dúvida) — volta 1 vez |
| 10 Conta energia | 11 Cadastro | default (após receber a foto) |
| 11 Cadastro | 12 Confirmação | default (após receber documento) |

### Tempos (text_delay_ms = pausa antes de enviar cada passo)

| Pos | Passo | Atual | Novo | Por quê |
|---|---|---|---|---|
| 2 | Nome | 1500 | **1500** | OK |
| 3 | Boas Vindas | 1500 | **2000** | Respiro após receber nome |
| 4 | Qual valor | 2500 | **2500** | OK |
| 5 | Valor da conta | 2000 | **2500** | Reação natural ao valor |
| 6 | Perguntando | 1500 | **2000** | OK |
| 7 | Como funciona | **60000** | **3000** | 60s estava errado — atrasa o envio. Áudio+vídeo já têm duração própria |
| 8 | Quebra de objeção | 1500 | **4000** | Pausa pós-explicação |
| 9 | Deu para entender | **30000** | **8000** | 30s exagerado — 8s dá tempo de digitar |
| 10 | Conta energia | 1500 | **2000** | OK |
| 11 | Cadastro | 0 | **1500** | Pausa mínima entre passos |
| 12 | Confirmação | 2500 | **2500** | OK |

### Resumo do que muda

1. **Religar todos com `default`** para garantir que nenhum passo seja pulado (hoje pos 5 pula direto para 7, e pos 9/10/11 apontam para IDs inexistentes).
2. **Ajustar os 2 delays exagerados** (60s no pos 7 e 30s no pos 9).
3. **Quebra de objeção entra como passo 8 normal do fluxo** e também como fallback se o cliente disser "não entendi" no passo 9.

Tudo isso é **uma migration `UPDATE bot_flow_steps`** no flow `66a19db4-b061-4f3f-921f-c13e9fb6f730` — zero alteração de código TS.

Posso aplicar?