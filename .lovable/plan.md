## Diagnóstico (o que está realmente quebrado)

Rodei a varredura nos 13 fluxos ativos. **Todos** clonam o mesmo seed e carregam os mesmos defeitos. A numeração que você vê (7, 9, 12) bate com posições críticas do template:

```text
1  boas_vindas         audio_slot      mídia pública OK
2  qualificação        question        ⚠ 0 capturas / 0 transições
3  como_funciona       audio_slot      mídia pública OK
4  fazenda_solar       audio_slot      mídia pública OK
5  prova_social        audio_slot      mídia pública OK
6  pedir conta luz     media_request   ⚠ 0 capturas / 0 transições
7  confirma_recebim.   audio_slot      ⚠ depende de pedido anterior funcionar
8  pedir doc/selfie    media_request   ⚠ 0 capturas / 0 transições
9  chamada_cadastro    audio_slot      ⚠ só avança se 8 capturou
10 cadastro            cadastro        ⚠ 0 capturas configuradas
```

Não existe posição 12 no fluxo padrão — o "12" que você vê é provavelmente um card de **atalho/objeção** sendo numerado junto com os passos na UI (preciso confirmar isso ao abrir o componente). Os erros reais de "trava" estão nos passos **2, 6, 8 e 10**, e o reflexo é a Camila parar nos passos **7 e 9** porque o passo anterior não capturou nada para avançar.

### Causas-raiz

1. **Passos `question`, `media_request` e `cadastro` com `transitions=[]` e `captures=[]`** — o motor (`bot-flow` edge) cai no `fallback: repeat` e a conversa fica em loop, dando a sensação de "trava no 7" ou "trava no 9".
2. **`audio_slot` sem mídia do consultor** — 12 dos 13 consultores não têm áudio próprio nos slots `confirma_recebimento` e `chamada_cadastro`; só funciona pelo fallback público (frágil).
3. **Numeração da UI mistura passos + atalhos** sem deixar claro qual é qual — daí o "12" fantasma.
4. **Sem validação visual antes de salvar** — o card não te avisa quando falta captura, transição ou mídia obrigatória.

## Plano de correção

### 1. Migração de "saneamento" dos 13 fluxos
- Atualizar `seed_default_camila_flow` (template novo) para já criar **captures e transitions corretas** em cada passo crítico:
  - **pos 2 (qualificação)**: capture `valor_conta` (regex de R$ + número) → transition para pos 3.
  - **pos 6 (pedir conta)**: capture `imagem_conta` (wait_for=`image|document`) → transition para pos 7. Retry com mensagem amigável se vier texto.
  - **pos 8 (pedir doc)**: capture `documento_cliente` (wait_for=`image|document`) → transition para pos 9.
  - **pos 10 (cadastro)**: deixar explícito que dispara o pipeline `cadastro_portal`.
- Migração de back-fill: aplicar essas mesmas `captures`/`transitions` aos 13 fluxos existentes via `UPDATE bot_flow_steps` (idempotente, só preenche onde está vazio).
- Acrescentar **mensagens de retry humanizadas** quando o lead manda texto onde se espera mídia ("Me manda a foto da conta de luz mesmo, por aqui pelo WhatsApp 😊").

### 2. Blindagem do motor `bot-flow` (edge function)
- Antes de cair em `fallback: repeat`, checar se o passo tem captures configuradas. Se não tiver e o tipo for `media_request`/`question`/`cadastro`, **forçar handoff** com alerta em `bot_handoff_alerts` em vez de loopar.
- Logar em `bot_flow_rule_fires` a razão (`step_misconfigured`) para o admin enxergar.

### 3. UI de validação no `/admin/fluxos`
- Para cada card, mostrar 3 badges de saúde:
  - 🎙 mídia (vermelho se 0 áudio/vídeo no slot e o passo for `audio_slot`/`video_slot`)
  - 🎯 captura (vermelho se `media_request`/`question`/`cadastro` sem captures)
  - 🔀 transição (vermelho se sem transition e o passo não for o último)
- Banner topo: "X passos com problema — a Camila pode travar nesses pontos".
- Separar visualmente **Passos do fluxo** (numerados 1–10) de **Atalhos rápidos** (lista própria, não numerada como passo) para acabar com a confusão do "12".
- Botão "Reparar fluxo automaticamente" que chama um RPC `repair_flow(_flow_id)` aplicando os defaults do template novo nos passos vazios.

### 4. Cobertura de mídia por consultor
- Tela de "Mídia da Camila" já existe, mas vou adicionar um indicador: para cada `slot_key` mostrar quantos consultores ainda dependem só do fallback público, com botão "duplicar fallback para meu acervo" (usa `fork_public_ai_media`).

### 5. Teste automatizado de fim-a-fim
- Estender `bot_test_runs` para um cenário `full_happy_path` que percorre os 10 passos com payloads sintéticos (texto + imagem mock) e marca cada passo como OK/falha. Roda nos 13 fluxos com 1 clique.

## Sequência de entrega
1. Migração SQL (seed novo + back-fill nos 13 fluxos + RPC `repair_flow`).
2. Patch no edge function `bot-flow` (handoff em vez de loop).
3. UI de badges + separação Passos/Atalhos no `FluxoCamila.tsx`.
4. Botão "Reparar" + "Forkar mídia pública".
5. Cenário `full_happy_path` no testador.

Quer que eu siga nessa ordem? Posso começar pela migração + UI de badges (itens 1 e 3) que já elimina 90% da percepção de "trava".