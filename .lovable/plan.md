## Análise Fluxo D — Rafael Ferreira

### Mapa atual (passo → resposta → próximo)

```
1 d_welcome (botões)
   ├─ "Quero simular"     → 2 d_pedir_conta        ✅
   ├─ "Como funciona"     → 3 d_como_funciona      ✅
   └─ "Falar com Rafael"  → handoff (special)      ✅

2 d_pedir_conta (capture_conta)
   └─ envia foto OCR → 4 d_resultado               ✅ (handler pula 3 e vai pro resultado)

3 d_como_funciona (botões)
   ├─ "📸 Quero simular"  → 2 d_pedir_conta        ✅
   ├─ "🤔 Tenho dúvida"   → 6 d_duvidas            ⚠️ (d_duvidas é beco sem saída)
   └─ "👨 Falar Rafael"   → 7 d_handoff            ❌ d_handoff está INATIVO

4 d_resultado (botões)
   ├─ "Cadastrar agora"   → 5 d_pedir_documento    ✅
   ├─ "Tenho dúvidas"     → 6 d_duvidas            ⚠️
   └─ "Falar com Rafael"  → handoff (special)      ✅

5 d_pedir_documento (capture_documento)
   └─ envia doc OCR → próxima posição ATIVA = 6 d_duvidas  ❌
      (deveria ir pra 8 d_finalizar)

6 d_duvidas (message, sem botões, sem transitions)
   └─ explica e fica MUDO                           ❌

7 d_handoff (message)                               ❌ INATIVO

8 d_finalizar (finalizar_cadastro)                  ✅
```

### Problemas a corrigir

**P1 — d_pedir_documento cai em d_duvidas (gravíssimo)**
Após o cliente mandar o RG/CNH, o handler de capture avança pra próxima posição ativa. Como 7 está inativo, cai em 6 (`d_duvidas`) em vez de 8 (`d_finalizar`). O cadastro nunca finaliza.

Fix: adicionar transition explícita em `d_pedir_documento` apontando pra `d_finalizar` (id `9f2d47d4-...`), OU reativar passo 7 e mover `d_finalizar` pra posição 6, OU desativar `d_duvidas` (deixar só acessível por botão de outro passo). Recomendo a **transition explícita** — é cirúrgico.

**P2 — d_duvidas é beco sem saída**
Os passos 3 e 4 mandam o cliente pra dúvidas, mas depois da frase "Te explico de novo, é bem simples 👇" o bot fica mudo (sem áudio/vídeo? sem botões? sem transições). Cliente fica plantado.

Fix sugerido: adicionar botões no fim de `d_duvidas`:
- "📸 Quero simular" → `d_pedir_conta`
- "👨 Falar com Rafael" → handoff special

(Mantém texto curto como o usuário pediu antes; áudio/vídeo do slot `d_duvidas` continua sendo enviado se cadastrado.)

**P3 — d_como_funciona aponta pra d_handoff inativo**
A transition "Falar com Rafael" usa `goto_step_id` pra passo 7 que está `is_active=false`. Resultado: clique pode quebrar ou ficar mudo.

Fix: trocar por `goto_special:"humano"` igual fazem os passos 1 e 4 (que funcionam).

**P4 — confirmar `{{economia_range}}`** (a confirmar com você)
O passo 4 (`d_resultado`) usa a variável `{{economia_range}}`. Preciso checar se o resolver de variáveis preenche isso — se não, vai chegar literal `{{economia_range}}` pro cliente. Vou inspecionar `_shared/variables` ou similar antes de mexer.

### Mudanças propostas (1 migration + 1 leitura de código)

1. **Migration** atualizando 3 passos:
   - `d_como_funciona`: trocar transition "humano" pra `goto_special:"humano"` (zerar `goto_step_id`).
   - `d_pedir_documento`: adicionar transition `{trigger_phrases:["*"], goto_step_id: "<id de d_finalizar>"}` OU usar campo `captures.next_step_id` se o handler suportar (vou conferir em build mode).
   - `d_duvidas`: adicionar `captures._buttons` com 2 botões + `transitions` correspondentes (simular / humano-special).

2. **Verificação** (leitura) do resolver de variáveis pra confirmar que `{{economia_range}}` é preenchida (P4). Se não for, abro questão pra você decidir o texto fallback.

Sem mudança em edge function — tudo via migration.