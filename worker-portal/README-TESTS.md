# Worker Portal — Scripts de teste

Histórico dos scripts `teste-*.mjs` que ficaram acumulados durante a evolução do worker-portal. **Nenhum deles é executado em CI/CD** — são utilitários manuais para debugar fluxos específicos.

| Script | Propósito | Quando usar |
|---|---|---|
| `teste-rapido.mjs` (147 linhas) | Smoke test mínimo (1 OTP + 1 OCR). | Sanity check após deploy do worker-portal. |
| `teste-v2.mjs` (282 linhas) | Valida API v2 do portal iGreen (endpoints novos). | Verificar regressão depois de atualizar `entrypoint.sh`. |
| `teste-final.mjs` (289 linhas) | Versão "consolidada" usada na homologação. | Reproduzir bug reportado em produção. |
| `teste-real.mjs` (341 linhas) | Fluxo completo com credenciais reais (CPF/senha do consultor). | **NÃO commit credenciais.** Para validar integração end-to-end. |
| `teste-completo.mjs` (364 linhas) | Cobre os 5 fluxos: OTP, OCR, login, ficha técnica, anexar conta. | Validação completa antes de release maior. |
| `teste-e2e-ficticio.mjs` (568 linhas) | Mesmo do completo, mas com dados sintéticos. | Demo/QA sem mexer em conta de produção. |

## Convenção futura

Quando criar um novo `teste-*.mjs`:

1. Use prefixo claro: `teste-{cenario}.mjs` (ex: `teste-otp-retry.mjs`).
2. Adicione 1 linha nesta tabela.
3. Se o cenário substituir um anterior, **deletar o antigo** em vez de manter dois.

## TODO (Fase 4 — adiado por segurança)

Consolidar todos em `teste.mjs` com flags (`--quick`, `--full`, `--real`, `--fake`). Foi adiado porque os scripts usam credenciais hardcoded e variações sutis que precisam validação manual antes de unificar. Cada script atual está documentado e estável — não há custo de manutenção alto enquanto não houver mudança de API.
