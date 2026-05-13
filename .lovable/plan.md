# Redesign da página de Anúncios

A página hoje pede dados que já temos cadastrados em outros lugares e dá protagonismo demais para a carteira. Vou enxugar e modernizar.

## O que muda

### 1. Eliminar o card "Para onde os leads chegam"
O `ConsultantAdSettingsCard` (formulário com WhatsApp de destino + Nome) deixa de ser exibido. Os dois campos passam a ser derivados automaticamente:

- **WhatsApp de destino**: ao salvar/criar campanha, a edge function `facebook-create-campaign` (e o preflight) usam o telefone já conectado:
  - Super admin (`rafael.ids@icloud.com`) → número da Whapi
  - Demais consultores → `whatsapp_instances.connected_phone` da Evolution
  - Fallback: `consultants.phone`
- **Nome de exibição**: vem de `consultants.name` (já cadastrado).
- O registro em `consultant_ad_settings` continua existindo, mas é preenchido em background na primeira visita ("auto-provision") em vez de exigir ação do usuário.
- O gate `ready` do `AdsTab` deixa de depender desse card — passa a depender apenas de saldo > 0 (ou diretamente liberado, com aviso de saldo baixo).

### 2. Carteira compacta (chip + popup de recarga)
O `WalletCard` grande some do topo. Em vez disso, no header da aba aparece um **chip pequeno**:

```
[💳 R$ 47,30]   ← clicável
```

- Cor neutra quando saldo OK, âmbar quando baixo, vermelho quando em débito.
- Click abre um **Dialog** (`WalletDialog`) com:
  - Saldo atual + total recarregado/gasto
  - 4 botões de recarga rápida (R$ 50 / 100 / 200 / 500)
  - Aba "Movimentações" colapsável com o feed que hoje fica no card
- Toda a lógica de `getWalletBalance` / `createTopupSession` é reaproveitada — só muda o container.

### 3. Header da página mais limpo
Layout novo do topo da `AdsTab`:

```
Anúncios iGreen                    [💳 R$ 47,30]  [Galeria]  [+ Nova campanha]
Campanhas pré-otimizadas no Facebook e Instagram.
```

- Subtítulo curto, sem o passo-a-passo gigante (vira tooltip "Como funciona" em um link discreto).
- Tabs (Resultados / Campanhas / Modelos / Inteligência) ganham ícones maiores e ficam grudadas no header em mobile com scroll horizontal.

### 4. Bloco "Como funciona" enxuto
Quando o consultor ainda não tem campanhas, em vez do card cheio de passos, mostro um **empty state visual**: ilustração + 1 frase + CTA "Criar primeira campanha". Os passos viram bullets curtos no popover do chip da carteira.

## Arquivos afetados

- `src/components/admin/ads/AdsTab.tsx` — remove `ConsultantAdSettingsCard` e `WalletCard` do grid; adiciona `WalletChip` + `WalletDialog` no header; ajusta gate `ready`.
- `src/components/admin/ads/WalletCard.tsx` → renomeado/refatorado em **`WalletChip.tsx`** (chip) + **`WalletDialog.tsx`** (popup com saldo, recargas, feed).
- `src/components/admin/ads/ConsultantAdSettingsCard.tsx` — **deletado**.
- `supabase/functions/facebook-create-campaign/index.ts` — quando `settings.whatsapp_destination_number` estiver vazio, faz fallback nesta ordem: `whatsapp_instances.connected_phone` (do consultor) → `consultants.phone`. Persiste o resolvido em `consultant_ad_settings` para próximas execuções.
- `supabase/functions/facebook-preflight-check/index.ts` — mesma lógica de fallback antes de bloquear por "destino não configurado".

## Detalhes técnicos

- A derivação do número faz `digits()` e exige ≥10 dígitos; se falhar, mostra um aviso inline ("Conecte o WhatsApp em Dados") em vez do formulário.
- O `WalletDialog` usa `Dialog` do shadcn já presente no projeto. Recarga continua redirecionando para Stripe (`createTopupSession`) — sem mudança de fluxo de pagamento.
- Cores do chip via tokens semânticos (`text-primary`, `text-warning`, `text-destructive`).
- Mantém responsividade mobile já corrigida na sessão anterior.

## O que não muda

- Nenhuma alteração em campanhas existentes, métricas, gateway de pagamento ou RLS.
- `consultant_ad_settings` continua sendo a tabela de origem do número — só deixa de ser editada via UI.
