# 📚 Documentação do Projeto iGreen

Hub central de docs. A raiz do projeto guarda apenas os 4 arquivos vivos:

| Arquivo | Propósito |
|---|---|
| `README.md` | Visão geral e setup |
| `DOCUMENTATION.md` | Specs técnicas (schemas, fluxos, automações) |
| `LAUNCH_OPS.md` | Runbook operacional / checklists de release |
| `ANALISE_COMPLETA_CODIGO.md` | Auditoria mais recente |

Todo o histórico foi movido para [`./archive/`](./archive/) (69 documentos).
Esses arquivos representam **fases passadas** do projeto (migração Whapi → Evolution,
deploys, correções pontuais) e não devem ser consultados como fonte da verdade atual.

## Como navegar o histórico

Convenções de prefixo nos arquivos arquivados:

- `ANALISE_*` — análises e auditorias antigas
- `CORRECAO_*` / `CORRIGIR_*` — fixes pontuais (já aplicados)
- `DEPLOY_*` / `MIGRATION_*` / `MIGRACAO_*` — registros de deploys
- `RESUMO_*` / `STATUS_*` / `SESSAO_*` — snapshots de sessões antigas
- `IMPLEMENTACAO_*` / `IMPLEMENTAR_*` — registros de implementação
- `TESTE_*` / `SIMULADO_*` / `EXECUTANDO_*` — testes executados
- `EXEMPLOS_*` — payloads e exemplos de referência
- `GUIA_*` / `INICIO_*` / `INDICE_*` / `MAPA_*` / `PASSO_*` — guias de onboarding
- `INSTALAR_*` / `SUPABASE_CLI_*` — setup de ambiente local
- `COMANDOS_*` — cheat sheets de CLI
- `URGENTE_*` / `VERIFICAR_*` — to-dos operacionais antigos
- `WHATSAPP_FLOW_*_TESTREPORT.md` — relatórios de QA do bot

## Fonte da verdade atual

Para qualquer decisão de produto/arquitetura, consultar nesta ordem:

1. `mem://index.md` (regras de produto vivas no sistema de memory)
2. `DOCUMENTATION.md` (schemas e fluxos)
3. `LAUNCH_OPS.md` (operação)
4. `ANALISE_COMPLETA_CODIGO.md` (estado mais recente do código)

## Padrão para novos documentos

Documentos novos vão em `docs/` por tema (ex.: `docs/whatsapp/`, `docs/seguranca/`).
Não criar mais nada na raiz.
