## Renomear passos do Fluxo Padrão (todos os consultores)

Os títulos atuais estão inconsistentes ("Pergutando se pode estar explicando abaixo", "Cadastro", "Confirmacao", "Nome do cliente" etc). Vou padronizar **pela posição** do passo, aplicando em **todos os fluxos ativos** (todas as variantes A/B/C, seu fluxo e dos consultores).

### Nova nomenclatura proposta

| Posição | step_type | Título novo |
|--------:|-----------|-------------|
| 2 | message | `1. Captura do nome` |
| 3 | message | `2. Boas-vindas` |
| 4 | message | `3. Pergunta valor da conta` |
| 5 | message | `4. Explica o desconto` |
| 6 | message | `5. Pede permissão para explicar` |
| 7 | message | `6. Como funciona (áudio + vídeo)` |
| 8 | message | `7. Convite para o cadastro` |
| 9 | capture_conta | `8. Conta de luz` |
| 10 | capture_documento | `9. Documento com foto` |
| 11 | finalizar_cadastro | `10. Confirmação e envio` |

### Escopo

- Atualiza `bot_flow_steps.title` em **todos** os `bot_flows` com `is_active=true` que tenham exatamente esses 10 passos (mesma estrutura do Fluxo Padrão de Rafael).
- Não altera `step_key`, `message_text`, `transitions`, mídias nem `step_type` — só o rótulo visível no /admin/fluxos.
- Aplica nas três variantes (A/B/C) quando existirem.

### Antes de executar — preciso confirmar

1. Os nomes acima estão bons, ou prefere outra convenção (ex.: sem numeração, ou com emoji)?
2. Aplicar **só** nos fluxos que têm exatamente esses 10 passos (mais seguro), ou também tentar adivinhar em fluxos variantes? Recomendo só nos idênticos.

Me responde com "ok" (ou ajustes nos nomes) que eu rodo a migração.
