# Central de Objeções — 40 atalhos prontos + gravação por áudio + zero erro

## Diagnóstico

1. **Passo 8 "Quebra de objeção" está vazio** (`step_key: passo_mpa3yr6a`). Hoje só serve de placeholder, não envia nada — pode excluir.
2. **Objeção não é passo de funil — é reação.** Solução: pré-carregar todos os atalhos na aba "Atalhos rápidos" (`bot_flow_qa`), com áudio opcional, e a Base da IA (`ai_knowledge_sections`) cobre o resto.
3. **Gravação de áudio**: já existe `AudioRecorderInline.tsx` (usado em Slots). É só plugar dentro do `FaqSection` → upload via `upload-media` → cria registro em `ai_media_library` (kind=audio) → vincula em `bot_flow_qa_media`. **Sem novo backend.**
4. **"Nunca dar erro"**: fontes de erro do bot são (a) gatilho duplicado entre atalhos; (b) áudio órfão sem URL; (c) variável `{{nome}}` faltando; (d) atalho conflita com palavra do fluxo ("sim", "não"). Vou adicionar validações em tempo real.

---

## As 40 objeções (pesquisadas em Reclame Aqui, blogs do setor, FAQ Voltera/EDP/Resolaris)

Agrupadas em **6 categorias**. Cada uma vira um Atalho com 3-6 gatilhos e resposta sugerida. Você refina depois — o que importa é cobrir os caminhos.

### 1. Confiança / "É golpe?" (8)

1. **"É golpe / furada"** — `golpe, furada, enganação, fraude, scam, picaretagem`
2. **"Não confio nessa empresa"** — `não confio, desconfio, suspeito, estranho`
3. **"Nunca ouvi falar"** — `nunca ouvi, não conheço, primeira vez`
4. **"Vi reclamação no Reclame Aqui"** — `reclame aqui, reclamação, problema, mal falar`
5. **"Vocês têm CNPJ? São regulamentados?"** — `cnpj, regulamentado, aneel, legal, autorizado`
6. **"Há quanto tempo existe?"** — `tempo, anos, fundada, começou, mercado`
7. **"Onde fica a sede?"** — `sede, endereço, escritório, onde fica`
8. **"Quem é o dono / sócio?"** — `dono, sócio, fundador, proprietário, ceo`

### 2. Preço & economia (7)

9. **"É caro / não tenho dinheiro"** — `caro, sem dinheiro, apertado, sem grana`
10. **"Quanto vou economizar de verdade?"** — `quanto economizo, real, comprovação, prova`
11. **"O desconto é falso"** — `desconto falso, mentira, propaganda enganosa`
12. **"Tem taxa escondida?"** — `taxa escondida, custo extra, surpresa, oculta, letra miúda`
13. **"Vou pagar a mais no fim das contas?"** — `pagar mais, dobrar, soma maior, conta cresce`
14. **"E se a tarifa subir?"** — `tarifa sobe, aumento, reajuste, bandeira vermelha`
15. **"Vou ter que pagar pra entrar?"** — `pagar pra entrar, adesão, taxa inicial, mensalidade`

### 3. Cobrança & boletos (6)

16. **"Vão me cobrar duas vezes?"** — `cobrar duas, duplicado, conta dobrada, em dobro`
17. **"Vou parar de receber a conta da concessionária?"** — `conta concessionária, enel, light, cemig, equatorial`
18. **"Qual é o vencimento do boleto?"** — `vencimento, data, quando vence, prazo`
19. **"Posso pagar no débito automático?"** — `débito automático, pix, cartão, pagamento`
20. **"E se eu atrasar?"** — `atrasar, multa, juros, esquecer`
21. **"Vão me negativar?"** — `negativar, spc, serasa, nome sujo`

### 4. Funcionamento técnico (7)

22. **"Vou trocar de empresa de energia?"** — `trocar empresa, mudar concessionária, sair da enel`
23. **"Vão mexer na minha fiação?"** — `fiação, instalação, técnico, obra, mexer`
24. **"E se faltar luz?"** — `faltar luz, apagão, queda, blackout`
25. **"Preciso de placa solar em casa?"** — `placa, painel, telhado, equipamento`
26. **"E se eu mudar de casa?"** — `mudar casa, mudança, novo endereço, me mudar`
27. **"Funciona pra apartamento?"** — `apartamento, prédio, condomínio`
28. **"Funciona na minha cidade?"** — `minha cidade, região, atende aqui, cobertura`

### 5. Tempo, prazo & cancelamento (6)

29. **"Quanto tempo demora pra começar?"** — `quanto tempo, demora, prazo, começa quando`
30. **"Tem fidelidade / multa?"** — `fidelidade, multa, contrato preso, amarrado`
31. **"Posso cancelar quando quiser?"** — `cancelar, sair, desistir, encerrar`
32. **"Como faço pra cancelar?"** — `como cancelar, processo, passo a passo`
33. **"Já me cadastrei mas quero desistir"** — `arrependimento, sete dias, desistência`
34. **"Vou pensar / depois"** — `pensar, depois, amanhã, te aviso, ver com esposa/marido`

### 6. Cadastro & privacidade (6)

35. **"Não vou mandar foto da conta"** — `foto não, conta não, privacidade conta`
36. **"Não vou mandar RG/CNH"** — `documento não, rg não, cnh não, identidade não`
37. **"Por que vocês precisam do meu CPF?"** — `cpf, dados, lgpd, privacidade`
38. **"E se vazarem meus dados?"** — `vazar dados, segurança, hacker, lgpd`
39. **"Quero falar com humano / atendente"** — `humano, pessoa, atendente, falar com alguém` → **handoff**
40. **"Quero conhecer presencialmente"** — `presencial, pessoalmente, escritório, reunião`

---

## Implementação

### A. Migração: criar os 40 atalhos + remover passo vazio

`supabase/migrations/...sql`:

1. **Remove** o passo 8 "Quebra de objeção" (sem `message_text`) de todos os fluxos que tiverem ele vazio.
2. **Insere** 40 linhas em `bot_flow_qa` (uma por atalho) para cada `flow_id` ativo, com `intent_name` (título), `text_response` (rascunho de texto), `position` sequencial após os existentes.
3. **Insere** os gatilhos em `bot_flow_qa_triggers`.
4. Marca o nº 39 ("falar com humano") com `text_response = null` e adiciona um campo lógico no front pra disparar handoff (já existe na cascata).

Cada texto-resposta vem pronto em tom Camila (amigável, curto, com `{{nome}}`). Você ajusta depois pelo painel.

### B. Gravação de áudio dentro do atalho

Editar `src/components/admin/fluxo/FaqSection.tsx` (subcomponente `QACard`):

- Adicionar botão **"🎙️ Gravar áudio agora"** ao lado do "+ Áudio" (que hoje só linka a biblioteca).
- Componente `<AudioRecorderInline>` (já existe) abre inline.
- Ao gravar: upload via `supabase.functions.invoke('upload-media', { ... })` → cria `ai_media_library` com `kind=audio, label="Atalho: <intent_name>", consultant_id=user.id`.
- Pega o `id` retornado e insere em `bot_flow_qa_media` com `media_kind=audio, media_id=<novo>, slot_key=null`.
- Toast de confirmação + áudio aparece na lista de mídias do atalho.
- Tudo otimista, com rollback se der erro.

**Por que reaproveitar `AudioRecorderInline**`: mesmo formato (Opus 16k), mesmo pipeline, mesmo player. Zero divergência.

### C. Validações anti-erro (UX defensiva)

No `FaqSection`, mostrar avisos **em tempo real**:

1. **Gatilho duplicado** — se a mesma frase aparece em 2+ atalhos: badge vermelha "⚠️ duplicado em 'Cancelar'" com link pro outro.
2. **Gatilho conflita com palavra do fluxo** — lista negra: `sim, não, ok, certo, vamos, beleza, valor, R$, foto, documento` (palavras que o funil usa pra avançar). Mostra alerta "⚠️ Esta palavra pode atrapalhar o fluxo principal".
3. **Áudio sem URL** — se o `media_id` referencia um item da biblioteca que está inativo ou sem `url`: badge "⚠️ áudio indisponível".
4. **Texto com variável errada** — se usar `{nome}` em vez de `{{nome}}` ou variável inexistente: aviso "Variável `{xxx}` não existe. Disponíveis: `{{nome}}, {{valor_conta}}, {{telefone}}, {{cpf}}`".
5. **Atalho sem nenhum gatilho** — botão "Salvar" desabilitado + mensagem "Adicione pelo menos 1 palavra-chave".
6. **Resposta vazia E sem mídia** — bloqueia salvar: "Adicione texto, áudio ou vídeo".

### D. Organização visual da aba "Atalhos rápidos"

Hoje é uma lista única. Vou adicionar:

- **Filtro por categoria** (Confiança / Preço / Cobrança / Técnico / Cancelamento / Cadastro) com chips no topo.
- **Busca** por título, gatilho ou conteúdo.
- **Coluna de status** por atalho: ✅ pronto / ⚠️ rascunho (sem áudio) / 🔴 erro (validação falhou).
- **Botão "Testar este atalho"** por cartão — simula no sandbox (reaproveita o tester do AdminFaq).
- **Reordenar por arrasto** (substituir as setas ▲▼ por drag handle, usar `@dnd-kit` que provavelmente já está no projeto).

Para suportar categoria sem migration nova, **uso o campo `intent_name` com prefixo**: `"Confiança · É golpe"`, `"Preço · É caro"`, etc. Front separa pelo `·` para gerar os chips. Limpa e reversível.

### E. Hierarquia clara no UI

Adicionar banner no topo da aba "Atalhos rápidos":

> **40 atalhos = sua biblioteca de objeções.**
> A Camila escolhe **automaticamente** o que casar com a fala do lead. Ela responde, e **volta para o passo atual** do fluxo. Se 2 atalhos casarem, ela usa o de maior posição.

E uma seta visual para a aba "Base da IA": *"Não achou aqui? A IA tenta na Base de Conhecimento."*

### F. Como "nunca dar erro" — checklist técnico

- **Idempotência da migração**: usar `ON CONFLICT (flow_id, intent_name) DO NOTHING` pra rodar várias vezes sem duplicar.
- **Cascade no delete**: `bot_flow_qa_triggers` e `_media` já têm FK com `ON DELETE CASCADE` — confirmar.
- **Resolver gatilho vazio**: webhook ignora triggers com `phrase = ''` → frontend bloqueia salvar string vazia.
- **Match case-insensitive**: garantir que a comparação no `whapi-webhook` usa `lower()` (verificar e ajustar se preciso).
- **Limite de mídia**: máximo 3 mídias por atalho (1 áudio + 1 vídeo + 1 imagem) — bloquear no UI.
- **Fallback gracioso**: se uma mídia falha ao enviar, o webhook envia o texto + log de erro (já é o comportamento). Adicionar telemetria.

---

## Arquivos

**Novos**

- `supabase/migrations/<ts>_seed_40_objection_shortcuts.sql` — seed dos atalhos
- `src/lib/objectionShortcuts.ts` — fonte de verdade JS dos 40 atalhos (mesmo conteúdo, usado pra "Restaurar padrão" no UI)
- `src/components/admin/fluxo/ShortcutValidationBadge.tsx` — badge de status (✅/⚠️/🔴)

**Editados**

- `src/components/admin/fluxo/FaqSection.tsx` — categoria/filtros/busca, integração `AudioRecorderInline`, validações, drag-and-drop
- `src/pages/AdminKnowledge.tsx` — atualizar banner, mostrar contagens por categoria

**Não muda**

- Edge functions (`whapi-webhook`, `ai-faq-answerer`) — lógica de cascata permanece
- Schema (`bot_flow_qa`, `bot_flow_qa_triggers`, `bot_flow_qa_media`, `ai_media_library`)
- RLS

---

## O que eu pergunto antes de executar

1. **Áudios padrão**: você quer que eu deixe os 40 atalhos só com **texto***eu irei  grava na hora com o novo botão "🎙️ Gravar".*
2. **Tom da resposta**: padrão Camila  formal
3. **Excluir o passo 8 vazio**: posso remover automaticamente, ou prefere fazer manualmente no painel? *Recomendo automático — está vazio mesmo.*

&nbsp;