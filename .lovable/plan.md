## Renomear "Associados" → "Leads"

O cabeçalho da lista (`CaptureLeadList.tsx` linha 89) mostra "Associados" quando `gameOn=true`. Os dados já são reais — vêm de `customers` (consultor, modo manual, últimos 100) e o HUD vem de `capture_scoreboard` (XP, nível, hoje/semana/streak). Não há mock.

### Mudança

- `src/components/captacao/CaptureLeadList.tsx` — trocar `"Associados"` por `"Leads"` no `<h3>`.

A patente do consultor no HUD (`Associado`, `Consultor`, `Gerente`…) é o ranking de carreira do consultor (gamificação) — conceito diferente de "lead" e fica como está. Se você quiser que esse ranking também mude, me diga qual nome usar no nível 1   
  


iniciante