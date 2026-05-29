# Auditoria_Cadastro_Steps

> Materializa o Requisito 3 (acceptance criteria 3.1, 3.2, 3.7) da spec
> `bot-engine-channel-unification`. Gerada por
> [`audit-cadastro-steps.py`](./audit-cadastro-steps.py) e validada pelo
> SuperAdmin em rodada única de QA durante a fase de Design.

**Decisão SuperAdmin (rodada única, PT-BR):** "OK em todos os 6 subgrupos
(heurística confirmada)". Sem ajustes. Os 5 CTAs híbridos (`ask_quero_cadastrar`,
`ask_finalizar`, `finalizando`, `ask_doc_frente_manual`, `ask_doc_verso_manual`)
permanecem `híbrido`; `aguardando_humano` também é `híbrido` (também aparece em
`conversational/index.ts`); `editing_doc_pai`/`editing_doc_mae` permanecem
declarados em `CADASTRO_STEPS` mas não têm uso real em código (zero matches em
ambos `bot-flow.ts`) — tratados como `cadastro-only` por inferência (mesma
família dos `editing_doc_*`) com `decisão_super_admin = manter como cadastro-only,
remover na fase cleanup`.

---

## Tabela canônica (48 itens)

| step_key | categoria | evidência (whapi:lines / evolution:lines) | decisão_super_admin |
|---|---|---|---|
| `aguardando_conta` | cadastro-only | bot-flow.ts whapi: L177,361,422,455,1865,2117,2118,2244,2951,2994,3011,3030,3126,3132,3177,3196,3313,3327,3640,3670,5023,5124 / evolution: L181,376,437,470,2209,2249,2459,2491,2493,2495,2658,2716,2767,3090,4501 | cadastro-only |
| `processando_ocr_conta` | cadastro-only | whapi: L455 / evolution: L470 | cadastro-only |
| `confirmando_dados_conta` | cadastro-only | whapi: L455,3601,3603 / evolution: L470,3047,3049 | cadastro-only |
| `ask_tipo_documento` | cadastro-only | whapi: L431,456,1866,2444,4084,5089 / evolution: L446,471,2207,2444,3537,4467 | cadastro-only |
| `aguardando_doc_auto` | cadastro-only | whapi: L457,4112 / evolution: L472,3565 | cadastro-only |
| `aguardando_doc_frente` | cadastro-only | whapi: L457,4126 / evolution: L472,3579 | cadastro-only |
| `aguardando_doc_verso` | cadastro-only | whapi: L457,4140 / evolution: L472,3593 | cadastro-only |
| `confirmando_dados_doc` | cadastro-only | whapi: L458,4153 / evolution: L473,3606 | cadastro-only |
| `confirmar_titularidade` | cadastro-only | whapi: L458,4166 / evolution: L473,3619 | cadastro-only |
| `ask_name` | cadastro-only | whapi: L383,427,458,1866,2445,4640,5127,5131 / evolution: L398,442,473,2210,4060,4634 | cadastro-only |
| `ask_cpf` | cadastro-only | whapi: L364,428,458,1866,2445,4644,5116 / evolution: L379,443,473,2210,4064,4500 | cadastro-only |
| `ask_rg` | cadastro-only | whapi: L386,429,458,1866,2445,4647,5117 / evolution: L401,444,473,2210,4067 | cadastro-only |
| `ask_birth_date` | cadastro-only | whapi: L370,430,459,1866,2446,4651 / evolution: L385,445,473,2210,4071 | cadastro-only |
| `ask_phone_confirm` | cadastro-only | whapi: L373,431,459,1866,2446,4732 / evolution: L388,446,474,2210,4153 | cadastro-only |
| `ask_phone` | cadastro-only | whapi: L373,4763 / evolution: L388,4184 | cadastro-only |
| `ask_email` | cadastro-only | whapi: L367,432,459,1866,2446,3643,4799,5128 / evolution: L382,447,474,2210,3084,4216 | cadastro-only |
| `ask_cep` | cadastro-only | whapi: L366,422,457,1866,2447,4653,5117,5121,5122 / evolution: L381,437,472,2210,4073,4502 | cadastro-only |
| `ask_number` | cadastro-only | whapi: L392,423,458,1866,2446,4653,5119 / evolution: L407,438,473,2210,4074,4503 | cadastro-only |
| `ask_complement` | cadastro-only | whapi: L394,424,458,1866,2447,4662,5247 / evolution: L409,439,473,2211,4083,4626 | cadastro-only |
| `ask_installation_number` | cadastro-only | whapi: L377,425,459,1866,2446,4708 / evolution: L392,440,474,2210,4129 | cadastro-only |
| `ask_bill_value` | cadastro-only | whapi: L374,426,459,1866,2446,4719,5123 / evolution: L389,441,474,2210,4140,4507 | cadastro-only |
| `ask_doc_frente_manual` | **híbrido** | whapi: L460,4731,5125 / evolution: L475,4152,4509 | híbrido — Motor_Unificado tenta transition em `bot_flow_steps` primeiro, cai em `pipeline-cadastro/captura-doc` se nada casar |
| `ask_doc_verso_manual` | **híbrido** | whapi: L460,4750,5126 / evolution: L475,4171,4510 | híbrido — idem |
| `ask_quero_cadastrar` | **híbrido** | whapi: L3607,3613,3661,3664,4770 / evolution: L3053,3058,3102,3105,4191 | híbrido — CTA pós-simulação. Transition primeiro; se nada casar, dispara captura de documento via pipeline |
| `ask_finalizar` | **híbrido** | whapi: L460,2447,3581,3632,3638,4605,4698,4822 / evolution: L475,2211,3034,3075,3081,4119,4231 | híbrido — também aparece em `conversational/index.ts` |
| `finalizando` | **híbrido** | whapi: L461,1871,2431,2449,2472,2605,2854,2868,4606,4699,4828,5035,5072 / evolution: L476,2195,2213,2252,2476,2488,4120,4237,4419,4456 | híbrido — ramo de fechamento que pode cair em CTA conversacional |
| `portal_submitting` | cadastro-only | whapi: L461,4838,5148,5149 / evolution: L476,4247,4532,4533 | cadastro-only |
| `aguardando_otp` | cadastro-only | whapi: L461,4841,4851,4904,5154 / evolution: L476,4252,4294 | cadastro-only |
| `validando_otp` | cadastro-only | whapi: L461,4894 / evolution: L476,4284 | cadastro-only |
| `aguardando_facial` | cadastro-only | whapi: L1871,2450,4860,4926 / evolution: L2214,4316 | cadastro-only |
| `aguardando_assinatura` | cadastro-only | whapi: L462,4927 / evolution: L477,4317 | cadastro-only |
| `cadastro_em_analise` | cadastro-only | whapi: L2450,4937,4950 / evolution: L2214,4323,4335 | cadastro-only |
| `complete` | cadastro-only | whapi: L462,2449,4958 / evolution: L477,2213,4343 | cadastro-only |
| `aguardando_humano` | **híbrido** | whapi: L462,695,1843,2067,2278,2345,2451,2692,2751,3015,3026,5087 / evolution: L477,699,1719,1831,2042,2109,2215,2335,2384,2615,2626,2877,2878,2914,2915,3516,3517,3553,3554,4471 + conversational/index.ts | híbrido — usado tanto pelo pipeline (handoff) quanto pelo conversational (intent humano) |
| `editing_conta_menu` | cadastro-only | whapi: L396,432,463,1867,2439,3673,4193 / evolution: L411,447,478,2203,3114,3648 | cadastro-only |
| `editing_conta_nome` | cadastro-only | whapi: L381,434,463,1867,2439,3248,4196,4233 / evolution: L396,449,478,2203,2824,3651,3688 | cadastro-only |
| `editing_conta_endereco` | cadastro-only | whapi: L387,435,463,1867,2439,4197,4247,5118,5120 / evolution: L402,450,478,2203,3652,3702,4502,4504 | cadastro-only |
| `editing_conta_cep` | cadastro-only | whapi: L366,436,464,1867,2440,4198,4260 / evolution: L381,451,479,2204,3653,3715 | cadastro-only |
| `editing_conta_distribuidora` | cadastro-only | whapi: L388,437,464,1868,2440,4199,4273 / evolution: L403,452,479,2204,3654,3728 | cadastro-only |
| `editing_conta_instalacao` | cadastro-only | whapi: L378,438,464,1868,2440,4200,4286 / evolution: L393,453,479,2204,3655,3741 | cadastro-only |
| `editing_conta_valor` | cadastro-only | whapi: L375,439,464,1868,2441,3253,4201,4299 / evolution: L390,454,479,2205,2829,3656,3754 | cadastro-only |
| `editing_doc_menu` | cadastro-only | whapi: L398,433,465,1869,2443,4149,4179,4313 / evolution: L413,448,480,2207,3602,3634,3768 | cadastro-only |
| `editing_doc_nome` | cadastro-only | whapi: L382,440,465,1869,2443,4316,4344 / evolution: L397,455,480,2207,3771,3799 | cadastro-only |
| `editing_doc_cpf` | cadastro-only | whapi: L363,441,465,1869,2444,4317,4358 / evolution: L378,456,480,2208,3772,3813 | cadastro-only |
| `editing_doc_rg` | cadastro-only | whapi: L385,442,465,1869,2444,4318,4371 / evolution: L400,457,480,2208,3773,3826 | cadastro-only |
| `editing_doc_nascimento` | cadastro-only | whapi: L369,443,466,1869,2444,4319,4384 / evolution: L384,458,481,2208,3774,3839 | cadastro-only |
| `editing_doc_pai` | cadastro-only | (zero matches em ambos `bot-flow.ts`) | cadastro-only — declarado mas nunca usado; remover na fase `cleanup` |
| `editing_doc_mae` | cadastro-only | (zero matches em ambos `bot-flow.ts`) | cadastro-only — idem |

## Distribuição final

- `cadastro-only`: 42 (incluindo os 2 órfãos `editing_doc_pai/_mae`).
- `híbrido`: 6 (`aguardando_humano`, `ask_quero_cadastrar`, `ask_finalizar`,
  `finalizando`, `ask_doc_frente_manual`, `ask_doc_verso_manual`).
- `cta-conversacional`: 0 (nenhum step do `CADASTRO_STEPS` é puramente
  conversacional hoje).
- **Total:** 48.

## Como o Motor_Unificado consome esta tabela

Lida em `_shared/pipeline-cadastro/registry.ts` como mapa
`Record<step_key, "cadastro-only" | "híbrido">`. O runner consulta-o em uma
única função pura `classifyStep(stepKey) → "pipeline" | "transition_first"`:

- `cadastro-only` → sempre `pipeline` (delega ao `pipeline-cadastro`,
  ignora `bot_flow_steps.transitions`).
- `híbrido` → primeiro `transition_first` (tenta `matchTransition`
  contra `bot_flow_steps.transitions`); só cai em `pipeline` se
  `matchTransition` retornar `null`.
- step_key não declarado nesta tabela → `transition_first` (passo
  conversacional puro lido de `bot_flow_steps`).

A constante `CADASTRO_STEPS` em `_shared/flow-router.ts` SHALL ser marcada
`@deprecated` apontando para este arquivo na fase `cleanup` (Requisito 3.8 +
11.6).
