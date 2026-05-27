# Smoke Test Manual — Modo Diagrama (`/admin/fluxo`)

Checklist de validação manual end-to-end do **Modo_Diagrama** introduzido pela spec [`flow-diagram-view`](../.kiro/specs/flow-diagram-view). Reproduz o cenário "consultor leigo desenha fluxo" descrito em `design.md > Testing Strategy > E2E` e na task **16.1** de `tasks.md`.

Use este documento sempre antes de promover uma release que toque `FluxoBuilder`, `FlowDiagram`, `useDiagramData`, `useDiagramLayout`, `useDiagramSearch`, `useDiagramMetrics`, `useDiagramExport`, `useViewportPersistence`, `bot_flow_steps.layout` ou qualquer adapter de canvas (`@xyflow/react`, `dagre`, `html-to-image`).

> **Tempo estimado:** 8–12 minutos em desktop ≥1024 px.
> **Status esperado:** todos os 10 passos `[x]` antes de mergear para `main`.
> **Falha em qualquer passo = bug bloqueante** (ver seção [Reporte de bugs](#reporte-de-bugs)).

---

## Pré-condições

Antes de rodar o smoke test, garanta que o ambiente atende **todas** as condições abaixo:

- [ ] Branch contém todas as migrations aplicadas, em especial `supabase/migrations/20260601000000_add_layout_to_bot_flow_steps.sql`.
- [ ] Banco local/dev tem ao menos **1 fluxo seedado** via `seed_default_camila_flow` (template "Camila" com 38+ passos). Verificar com:
  ```sql
  SELECT count(*) FROM bot_flow_steps
  WHERE flow_id IN (SELECT id FROM bot_flows WHERE consultant_id = '<seu_consultant_id>' AND variant = 'A');
  -- Esperado: >= 38
  ```
- [ ] O consultor de teste tem **pelo menos 2 variantes** (`A` e `B`) populadas em `bot_flows`. Se faltar a variante `B`, criar via UI antes de iniciar o roteiro.
- [ ] Você está autenticado em `/admin/fluxo` como o consultor dono do fluxo seedado.
- [ ] Viewport ≥1024 px (modo somente leitura mobile não é validado por este smoke — ver R15).
- [ ] `localStorage` limpo para a chave `flow-view-mode` antes de começar (DevTools → Application → Local Storage → remover) para garantir estado inicial em **Modo_Lista**.
- [ ] Console do navegador aberto em uma aba lateral; nenhum `console.error` deve aparecer durante o roteiro (warnings ignoráveis: avisos de React Flow attribution).

---

## Roteiro

Marque cada checkbox **somente após** observar o "Resultado esperado". Em caso de divergência, **pare** e abra issue conforme a seção [Reporte de bugs](#reporte-de-bugs).

### 1. Abrir Modo_Diagrama via Toggle

- [ ] **Ação:** No header do `FluxoBuilder`, clicar na opção **"Diagrama"** do `ViewToggle`.
- [ ] **Resultado esperado:**
  - Em ≤500 ms, a área principal substitui a lista vertical pelo canvas React Flow.
  - Header, `VariantDistributionBar` e Inspector continuam visíveis e inalterados.
  - `localStorage.flow-view-mode === "diagrama"`.
  - Console sem erros.
- **Valida:** R1.1, R1.2

### 2. Ver auto-layout horizontal do template Camila

- [ ] **Ação:** Aguardar o primeiro paint do canvas (sem interagir).
- [ ] **Resultado esperado:**
  - Todos os 38+ passos da variante A aparecem como nós no canvas.
  - Layout horizontal (`rankdir = "LR"`): nós distribuídos da esquerda para a direita, com espaçamento aproximado de 80 px horizontal × 60 px vertical.
  - Os 3 nós terminais (📝 Cadastro, 👤 Humano, 🔁 Repetir) aparecem em coluna fixa à direita do conteúdo, aplicáveis (ao menos um deles deve ser referenciado por algum `goto_special` do template Camila).
  - Tempo total até render completo ≤1500 ms (R12.3 — sentido ao toque).
- **Valida:** R2.1, R10.1

### 3. Selecionar nó → preview WhatsApp reflete

- [ ] **Ação:** Clicar uma única vez sobre qualquer nó do canvas (ex.: o passo de boas-vindas).
- [ ] **Resultado esperado:**
  - O nó recebe destaque de seleção visível.
  - Em ≤200 ms, o painel `WhatsAppPreview` à direita exibe o `message_text` do passo selecionado, com variáveis substituídas por `renderVarsPreview`.
  - Demais nós/arestas atenuados para no máximo 30 % de opacidade (regra de seleção, R3.7); nós inativos respeitam a faixa de menor opacidade (R2.5).
- **Valida:** R5.1

### 4. Duplo-clique → Inspector → editar título → conferir na Lista

- [ ] **Ação A:** Duplo-clique sobre um nó (preferencialmente um com `title` curto, ex.: "Boas-vindas"). Verificar que o `StepInspector` abre como Sheet lateral.
- [ ] **Ação B:** No campo "Título" do Inspector, anexar o sufixo `· smoke-test` (ex.: `Boas-vindas · smoke-test`). Salvar (deve ser autosave em blur, conforme `StepInspector`).
- [ ] **Ação C:** Fechar o Inspector (botão X, `Esc` ou clique fora).
- [ ] **Ação D:** Alternar para **"Lista"** no `ViewToggle`.
- [ ] **Ação E:** Localizar o mesmo passo na lista e conferir o título atualizado.
- [ ] **Resultado esperado:**
  - Inspector abre em ≤200 ms com as mesmas seções e ações do Modo_Lista (R18.1).
  - Após salvar, em ≤1 s, o canvas e o `WhatsAppPreview` refletem o novo título.
  - Ao trocar para Lista, o `StepCard` correspondente exibe o título com sufixo `· smoke-test` em ≤1 s (R4.2).
  - Voltar a "Diagrama" mostra o título atualizado também (sem reload).
- **Valida:** R5.2 (+ R4.2 cruzado)

> 💡 **Cleanup recomendado ao final do smoke:** remover o sufixo `· smoke-test` do passo editado para não poluir o template seedado.

### 5. Criar transition arrastando handle → digitar "sim" → confirmar

- [ ] **Ação A:** Voltar para **"Diagrama"** no `ViewToggle`.
- [ ] **Ação B:** Identificar dois nós distintos (origem e destino) próximos. Posicionar o cursor sobre o handle de saída (área ≥12×12 px no lado direito do nó de origem) — o cursor deve mudar para indicador de arrasto.
- [ ] **Ação C:** Arrastar até soltar **sobre** o nó de destino (não no canvas vazio).
- [ ] **Ação D:** No `TransitionPopover` que abre próximo ao ponto de soltura, digitar `sim` no campo `trigger_phrase` e clicar **"Confirmar"**.
- [ ] **Resultado esperado:**
  - Popover abre em ≤200 ms (R6.2).
  - Após confirmar, em ≤1 s, uma `Aresta_Solida` aparece ligando origem → destino com label "sim".
  - A transition foi persistida em `bot_flow_steps.transitions` do passo de origem com `{ trigger_phrases: ["sim"], trigger_intent: "palavra_chave", goto_step_id: "<destino>", goto_special: null }` — confirmar via SQL se necessário:
    ```sql
    SELECT transitions FROM bot_flow_steps WHERE id = '<id_origem>';
    ```
  - Trocar para Lista mostra a nova regra no `StepCard` da origem (sincronização R4.7).
- **Valida:** R6.3

### 6. Buscar com `Ctrl+K` → "duvida" → centralizar → ciclar

- [ ] **Ação A:** Pressionar `Ctrl+K` (Windows/Linux) ou `Cmd+K` (macOS).
- [ ] **Ação B:** O foco vai para o campo de busca da `DiagramToolbar`. Digitar `duvida` (sem acento, propositalmente — para validar normalização NFD).
- [ ] **Ação C:** Pressionar `Enter`.
- [ ] **Ação D:** Pressionar `Enter` novamente 2–3 vezes para ciclar.
- [ ] **Resultado esperado:**
  - Em ≤200 ms, nós cujo `title` ou `step_key` contém "duvida" (incluindo "Dúvida", "Esclarecer dúvidas", etc., via NFD) ficam realçados com borda colorida; demais nós atenuam para ≤30 % opacidade (R19.2).
  - Ao pressionar `Enter`, em ≤500 ms a viewport centraliza no **primeiro** nó correspondente em ordem de `position` ascendente, **sem alterar o zoom atual** (R19.3).
  - `Enter` repetido cicla para o próximo nó correspondente; após o último, retorna ao primeiro (R19.4).
- **Valida:** R19.1, R19.3

### 7. Ativar Toggle "Métricas" → conferir percentuais

- [ ] **Ação A:** Pressionar `Esc` no campo de busca (limpa realce, R19.5).
- [ ] **Ação B:** Na `DiagramToolbar`, ativar o toggle **"Métricas"**.
- [ ] **Resultado esperado:**
  - Em ≤2 s, nós cujo `step_key` aparece em `v_flow_step_funnel` (filtrando `consultant_id` da variante atual) exibem percentual `abandonment_rate_pct` com 1 casa decimal.
  - Indicador "últimos 30 dias" aparece próximo ao toggle (R9.3).
  - Nós sem dados na view permanecem sem indicador, sem mensagem de erro (R9.8).
  - Se o consultor de teste não tem decisões nos últimos 30 dias, ao menos o toggle deve estar ativo e o indicador "últimos 30 dias" visível — anote isso no checklist sem marcar como falha bloqueante.
- **Valida:** R9.4

### 8. Exportar PNG → download inicia

- [ ] **Ação:** Clicar no menu **"Exportar"** da `DiagramToolbar` e selecionar **"PNG"**.
- [ ] **Resultado esperado:**
  - Em ≤10 s, um download local inicia com nome no formato `fluxo-{consultantSlug}-variante-A-{YYYYMMDD}.png` (sem upload remoto, R16.6).
  - Indicador de progresso visível durante a operação; botão "Exportar" desabilitado até concluir (R16.8).
  - Abrir o arquivo PNG: contém todos os nós e arestas visíveis no canvas, com fundo branco, padding ≥20 px, resolução ~2× a viewport.
  - Variáveis em `message_text` aparecem como placeholders (`{nome}`, `{cidade}`, etc.) — não com valores reais (R16.5).
- **Valida:** R16.3

### 9. Reload da página → estado persiste

- [ ] **Ação A:** Recarregar a página com `F5` ou `Ctrl+R` (sem limpar `localStorage`).
- [ ] **Resultado esperado:**
  - Após o reload, a página abre **diretamente em Modo_Diagrama** (sem flash de Modo_Lista) — porque `localStorage.flow-view-mode === "diagrama"` (R1.5).
  - A variante exibida continua **A**.
  - Layout dos nós é **idêntico** ao de antes do reload (mesmas coordenadas — `bot_flow_steps.layout` carregado no `reload()`, R10.6).
  - A regra criada no passo 5 (transition "sim" com `goto_step_id` para o nó de destino) continua presente no canvas como `Aresta_Solida`.
  - Viewport (zoom + pan) restaurado a partir de `localStorage.flow-viewport:{consultantId}:A` se aplicável (R10.14, R1.7 — falha silenciosa se a chave estiver corrompida).
- **Valida:** R1.5, R10.6

### 10. Trocar para variante B → canvas reseta com layout próprio

- [ ] **Ação:** Na `VariantDistributionBar` do header, clicar para selecionar a **variante B**.
- [ ] **Resultado esperado:**
  - Em ≤2 s, o canvas descarta todos os nós/arestas da variante A e renderiza os passos da variante B (R11.2).
  - Layout aplicado é **da variante B** (independente da A): se B não tem `layout` salvo, dagre roda do zero; se tem, as coordenadas salvas para B são restauradas.
  - Nenhum nó da variante A vaza para o canvas da B (isolamento de variantes, R11.4).
  - Nó editado no passo 4 (com sufixo `· smoke-test`) **não** aparece na variante B (a edição foi escopada à variante A).
  - A transition "sim" criada no passo 5 **não** aparece na variante B.
  - Voltar para a variante A restaura layout, regras e edições da variante A.
- **Valida:** R11.2

---

## Cobertura cruzada (matriz requisito → passo)

Cada requisito mapeado para a task 16.1 é validado por pelo menos um passo do roteiro acima. Falha em **qualquer** passo invalida o(s) requisito(s) correspondente(s).

| Requisito | Resumo                                                                | Passo(s)   |
|-----------|-----------------------------------------------------------------------|------------|
| R1.1      | Toggle Lista/Diagrama no header com 2 opções mutuamente exclusivas   | 1, 4       |
| R1.2      | Selecionar "Diagrama" substitui a área principal em ≤500 ms          | 1          |
| R1.5      | Reload abre no modo persistido em `localStorage`                     | 9          |
| R2.1      | Render de 1 nó por `bot_flow_steps` da variante atual                | 2          |
| R5.1      | Clicar nó → `selectedId` + preview WhatsApp em ≤200 ms               | 3          |
| R5.2      | Duplo-clique → Inspector com mesmas seções/ações do Modo_Lista       | 4          |
| R6.3      | Arrastar handle → confirmar trigger → aresta `solid` em ≤1 s         | 5          |
| R9.4      | Toggle "Métricas" exibe `abandonment_rate_pct` por nó                | 7          |
| R10.1     | Auto_Layout dagre em `rankdir = "LR"` com 80×60 px                   | 2          |
| R10.6     | Reload restaura `layout` salvo de cada passo                         | 9          |
| R11.2     | Trocar variante recarrega canvas com layout próprio em ≤2 s          | 10         |
| R16.3     | Exportar PNG inicia download local em ≤10 s                          | 8          |
| R19.1     | Atalho `Ctrl+K`/`Cmd+K` foca o campo de busca                        | 6          |
| R19.3     | `Enter` centraliza viewport no primeiro match sem alterar zoom        | 6          |

---

## Reporte de bugs

Falha em qualquer passo do roteiro **é bug bloqueante**: a release **não pode ser promovida** até a falha ser corrigida ou explicitamente aprovada como exceção pelo dono do produto.

### Onde abrir

- **Repositório:** `IGREEN-OFICIAL/ayla-magic-mirror`
- **Tipo:** GitHub Issue (ou Linear/Jira conforme processo da equipe)
- **Label obrigatório:** `bug`, `flow-diagram-view`, `blocker`
- **Milestone:** o release atual em validação
- **Reviewer:** dono da task de origem (ver `tasks.md`) + 1 revisor de UI/UX

### Template do título

```
[flow-diagram-view][smoke-{N}] {resumo de uma linha}
```

Exemplos:
- `[flow-diagram-view][smoke-5] Aresta sólida não aparece após confirmar trigger "sim"`
- `[flow-diagram-view][smoke-9] Layout salvo não é restaurado no reload`

### Template do corpo

```markdown
## Resumo

{1–2 frases descrevendo a falha}

## Passo do smoke test que falhou

Passo {N}: {título do passo}
Requisito(s) violado(s): R{x.y}, R{x.y}

## Reprodução

1. {sequência exata para reproduzir; preferir copiar do roteiro acima}
2. ...

## Resultado esperado

{copiar do "Resultado esperado" do passo}

## Resultado observado

{descrever o que aconteceu, com screenshot/video se possível}

## Ambiente

- Branch / commit: `{git rev-parse --short HEAD}`
- Navegador: {Chrome / Edge / Firefox} {versão}
- SO: {Windows / macOS / Linux} {versão}
- Viewport: {largura}×{altura} px
- Console: {colar erros relevantes — sem PII}

## Anexos

- Screenshot: ...
- Screencast: ...
- Log do console: ...
```

### Critérios de aceitação para fechar o bug

- [ ] Smoke test re-rodado integralmente sem regressão.
- [ ] Teste automatizado coberto pela respectiva task de unit/integration/E2E (ex.: 10.5, 13.x, 14.x) atualizado ou adicionado para evitar regressão futura.
- [ ] PR de fix referenciado nesta issue, mergeado e deployado em dev.

---

## Histórico de execução

Cada execução do smoke test deve ser registrada abaixo, com o resultado consolidado.

| Data       | Commit/Branch | Executor | Resultado     | Observações                       |
|------------|---------------|----------|---------------|------------------------------------|
| YYYY-MM-DD | `abc1234`     | @user    | ✅ Pass / ❌ Fail | Link para issues abertas, se houver |

