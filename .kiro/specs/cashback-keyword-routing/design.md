# Design Document: Cashback Keyword Routing

## Overview

O sistema de roteamento de cashback por palavras-chave adiciona uma camada de atribuição de parceiros indicadores ao fluxo existente de onboarding de leads. Quando um lead novo envia uma mensagem contendo uma palavra-chave associada a um parceiro, o link de cadastro iGreen gerado inclui o parâmetro `&cli=` do parceiro, garantindo que o parceiro receba cashback pela indicação.

A arquitetura segue o padrão já estabelecido: módulo compartilhado puro (`_shared/keyword-matcher.ts`) consumido por ambos os webhooks (Whapi e Evolution), com dados persistidos no PostgreSQL via Supabase e interface de gestão no painel React.

### Fluxo de Dados

```
Lead envia mensagem → Webhook (Whapi/Evolution)
  → Customer find/create (existente)
  → keyword-matcher.matchKeyword() ← NEW (dentro da Detection Window)
  → Persiste referral_partner_id no customer
  → Flow engine processa normalmente
  → finalizar_cadastro step
  → buildCadastroLink() ← NEW (usa referral_partner_id para decidir &cli=)
  → Link enviado ao lead
```

## Architecture

### Integration Points

1. **Webhook Layer** (ambos `whapi-webhook/index.ts` e `evolution-webhook/index.ts`): Após customer find/create, antes do engine — executa keyword detection nas primeiras 3 mensagens inbound.
2. **Flow Step `finalizar_cadastro`** (em `bot-flow.ts` de ambos os webhooks): Onde `cadastro_url` é atribuído ao `igreen_link` — agora usa `buildCadastroLink()` para incluir `&cli=` quando há match.
3. **Shared Module** (`_shared/keyword-matcher.ts`): Funções puras de normalização, matching e geração de link — zero I/O, testável isoladamente.
4. **Frontend** (`src/components/admin/parceiros/`): CRUD de parceiros, QR code, métricas.

### Data Flow Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  WhatsApp   │────▶│  Webhook (Whapi  │────▶│  keyword-matcher.ts │
│  Lead msg   │     │  or Evolution)   │     │  (pure function)    │
└─────────────┘     └──────────────────┘     └─────────────────────┘
                            │                          │
                            │ customer.referral_       │ match result
                            │ partner_id = X           │
                            ▼                          │
                    ┌──────────────────┐               │
                    │  Flow Engine     │◀──────────────┘
                    │  (v3 or legacy)  │
                    └──────────────────┘
                            │
                            │ finalizar_cadastro step
                            ▼
                    ┌──────────────────┐
                    │ buildCadastroLink │
                    │ (keyword-matcher) │
                    └──────────────────┘
                            │
                            ▼
                    Link com &cli={cli} ou sem
```

## Components and Interfaces

### 1. Shared Module: `_shared/keyword-matcher.ts`

Módulo puro (sem I/O) responsável pela normalização de texto e detecção fuzzy de palavras-chave.

```typescript
// supabase/functions/_shared/keyword-matcher.ts

export interface KeywordMatchResult {
  partnerId: string;
  keyword: string;
  score: number;
}

export interface PartnerKeywords {
  partnerId: string;
  keywords: string[];
}

/**
 * Normaliza texto removendo acentos, pontuação e convertendo para lowercase.
 * Função pura, sem side effects.
 */
export function normalizeText(input: string): string;

/**
 * Verifica se o texto normalizado contém uma keyword (substring match com tolerância fuzzy).
 * Retorna o primeiro match encontrado ou null.
 *
 * Estratégia de matching:
 *   1. Substring exata (após normalização)
 *   2. Levenshtein distance ≤ 1 para keywords com 5+ caracteres
 */
export function matchKeyword(
  messageText: string,
  partners: PartnerKeywords[],
): KeywordMatchResult | null;

/**
 * Gera o link de cadastro com ou sem parâmetro cli.
 */
export function buildCadastroLink(
  consultantIgreenId: string,
  partnerCli: string | null,
): string;
```

#### Implementation (Core Logic)

```typescript
const BASE_URL = "https://digital.igreenenergy.com.br/";

export function normalizeText(input: string): string {
  return (input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")        // pontuação → espaço
    .replace(/\s+/g, " ")
    .trim();
}

export function matchKeyword(
  messageText: string,
  partners: PartnerKeywords[],
): KeywordMatchResult | null {
  const normalized = normalizeText(messageText);
  if (!normalized) return null;

  for (const partner of partners) {
    for (const kw of partner.keywords) {
      const normKw = normalizeText(kw);
      if (!normKw) continue;

      // Exact substring match (post-normalization)
      if (normalized.includes(normKw)) {
        return { partnerId: partner.partnerId, keyword: kw, score: 1.0 };
      }

      // Fuzzy: split message into words, check Levenshtein ≤ 1 for keywords with 5+ chars
      if (normKw.length >= 5) {
        const words = normalized.split(/\s+/);
        for (const word of words) {
          if (levenshtein(word, normKw) <= 1) {
            return { partnerId: partner.partnerId, keyword: kw, score: 0.9 };
          }
        }
      }
    }
  }

  return null;
}

export function buildCadastroLink(
  consultantIgreenId: string,
  partnerCli: string | null,
): string {
  const base = `${BASE_URL}?id=${consultantIgreenId}`;
  if (partnerCli) {
    return `${base}&cli=${partnerCli}`;
  }
  return base;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
```

### 2. Webhook Integration

#### 2.1 Keyword Detection (ambos webhooks)

A detecção de keyword ocorre **após** o customer ser criado/encontrado e **antes** do engine processar o turno. Inserida no bloco existente de "self-intro" / "lead-attribution" que já roda nas primeiras mensagens.

```typescript
// Inserido em whapi-webhook/index.ts e evolution-webhook/index.ts
// Logo após o bloco de lead-attribution existente

import { matchKeyword, PartnerKeywords } from "../_shared/keyword-matcher.ts";

// ─── Keyword Detection (Detection Window: primeiras 3 mensagens) ───
if (customer && !customer.referral_partner_id && messageText && !isFile) {
  const { count: inboundCount } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customer.id)
    .eq("message_direction", "inbound");

  const DETECTION_WINDOW = 3;
  if ((inboundCount ?? 0) < DETECTION_WINDOW) {
    const { data: partners } = await supabase
      .from("referral_partners")
      .select("id, keywords")
      .eq("consultant_id", customer.consultant_id)
      .eq("is_active", true);

    if (partners?.length) {
      const partnerKeywords: PartnerKeywords[] = partners.map((p) => ({
        partnerId: p.id,
        keywords: p.keywords || [],
      }));

      const match = matchKeyword(messageText, partnerKeywords);
      if (match) {
        await supabase.from("customers").update({
          referral_partner_id: match.partnerId,
          referral_keyword_matched: match.keyword,
          referral_detected_at: new Date().toISOString(),
        }).eq("id", customer.id);
        customer.referral_partner_id = match.partnerId;
        console.log(`[keyword-match] customer=${customer.id} partner=${match.partnerId} keyword="${match.keyword}"`);
      }
    }
  }
}
```

#### 2.2 Link Generation (`finalizar_cadastro`)

No handler de `finalizar_cadastro` (em `bot-flow.ts` de ambos os webhooks), onde `cadastro_url` é atribuído ao `igreen_link`:

```typescript
import { buildCadastroLink } from "../_shared/keyword-matcher.ts";

// Dentro do handler de finalizar_cadastro, substituir:
//   updates.igreen_link = consultantRow.cadastro_url;
// Por:
let partnerCli: string | null = null;
if (customer.referral_partner_id) {
  const { data: partner } = await supabase
    .from("referral_partners")
    .select("cli")
    .eq("id", customer.referral_partner_id)
    .maybeSingle();
  partnerCli = partner?.cli || null;
}
updates.igreen_link = buildCadastroLink(consultantRow.igreen_id, partnerCli);
```

### 3. Frontend Components

#### 3.1 Estrutura

```
src/components/admin/parceiros/
├── ParceirosTab.tsx           # Tab principal (lista + CRUD)
├── PartnerForm.tsx            # Modal/form de criação/edição
├── PartnerList.tsx            # Tabela de parceiros com ações
├── PartnerQrCode.tsx          # Modal de geração de QR code
├── PartnerMetrics.tsx         # Dashboard de métricas por parceiro
└── hooks/
    └── useReferralPartners.ts # Hook de dados (CRUD + métricas)
```

#### 3.2 ParceirosTab (Componente Principal)

```typescript
// src/components/admin/parceiros/ParceirosTab.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PartnerList } from "./PartnerList";
import { PartnerForm } from "./PartnerForm";
import { PartnerMetrics } from "./PartnerMetrics";
import { useReferralPartners } from "./hooks/useReferralPartners";

export function ParceirosTab() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { partners, metrics, create, update, remove, isLoading } = useReferralPartners();

  return (
    <div className="space-y-6">
      <PartnerMetrics metrics={metrics} />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Parceiros Indicadores</CardTitle>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo Parceiro
          </Button>
        </CardHeader>
        <CardContent>
          <PartnerList
            partners={partners}
            onEdit={(id) => { setEditingId(id); setShowForm(true); }}
            onDelete={remove}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
      {showForm && (
        <PartnerForm
          partnerId={editingId}
          onClose={() => { setShowForm(false); setEditingId(null); }}
          onSave={editingId ? update : create}
        />
      )}
    </div>
  );
}
```

#### 3.3 QR Code Generation

O QR code codifica uma URL `wa.me` com mensagem pré-preenchida contendo a keyword do parceiro:

```typescript
// src/components/admin/parceiros/PartnerQrCode.tsx
import QRCode from "qrcode.react";

interface Props {
  partnerName: string;
  keyword: string;
  consultantPhone: string;
  qrPhrase?: string;
}

function buildWaMeUrl(phone: string, keyword: string, qrPhrase?: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  const message = qrPhrase || keyword;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function PartnerQrCode({ partnerName, keyword, consultantPhone, qrPhrase }: Props) {
  const url = buildWaMeUrl(consultantPhone, keyword, qrPhrase);

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <h3 className="text-lg font-semibold">{partnerName}</h3>
      <QRCode value={url} size={256} level="M" />
      <p className="text-sm text-muted-foreground text-center max-w-xs">
        Ao escanear, o lead abrirá o WhatsApp com a frase: &quot;{qrPhrase || keyword}&quot;
      </p>
    </div>
  );
}
```

#### 3.4 Hook de Dados

```typescript
// src/components/admin/parceiros/hooks/useReferralPartners.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReferralPartner {
  id: string;
  nome: string;
  keywords: string[];
  cli: string;
  qr_phrase: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PartnerMetric {
  partner_id: string;
  partner_nome: string;
  lead_count: number;
}

export function useReferralPartners() {
  const queryClient = useQueryClient();

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["referral-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_partners")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ReferralPartner[];
    },
  });

  const { data: metrics = [] } = useQuery({
    queryKey: ["referral-partner-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_referral_partner_metrics");
      if (error) throw error;
      return data as PartnerMetric[];
    },
  });

  const create = useMutation({
    mutationFn: async (
      input: Omit<ReferralPartner, "id" | "is_active" | "created_at">,
    ) => {
      // RLS-aware insert: WITH CHECK (consultant_id = auth.uid()) requires
      // the column to be present in the payload. Frontend resolves the
      // current user via auth.getUser() and stamps consultant_id explicitly.
      const { data: authData } = await supabase.auth.getUser();
      const consultantId = authData?.user?.id;
      if (!consultantId) throw new Error("Usuário não autenticado");
      const { error } = await supabase
        .from("referral_partners")
        .insert({ ...input, consultant_id: consultantId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referral-partners"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ReferralPartner> & { id: string }) => {
      const { error } = await supabase
        .from("referral_partners")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referral-partners"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("referral_partners")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referral-partners"] }),
  });

  return { partners, metrics, create, update, remove, isLoading };
}
```

## Data Models

### Tabela: `referral_partners`

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| `id` | UUID | PK, default gen_random_uuid() | Identificador único |
| `consultant_id` | UUID | FK → consultants(id), NOT NULL, ON DELETE CASCADE | Consultor dono |
| `nome` | TEXT | NOT NULL | Nome do parceiro indicador |
| `keywords` | TEXT[] | NOT NULL, default '{}' | Lista de palavras-chave |
| `cli` | TEXT | NOT NULL | ID do cliente no portal iGreen |
| `qr_phrase` | TEXT | nullable | Frase customizada para QR code |
| `is_active` | BOOLEAN | NOT NULL, default true | Soft delete flag |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | Data de criação |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | Última atualização |

### Novas Colunas em `customers`

| Coluna | Tipo | Constraints | Descrição |
|--------|------|-------------|-----------|
| `referral_partner_id` | UUID | FK → referral_partners(id), ON DELETE SET NULL | Parceiro que indicou o lead |
| `referral_keyword_matched` | TEXT | nullable | Keyword que disparou o match |
| `referral_detected_at` | TIMESTAMPTZ | nullable | Timestamp da detecção |

### Database Function: Métricas

```sql
CREATE OR REPLACE FUNCTION public.get_referral_partner_metrics()
RETURNS TABLE(partner_id UUID, partner_nome TEXT, lead_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    rp.id AS partner_id,
    rp.nome AS partner_nome,
    COUNT(c.id) AS lead_count
  FROM public.referral_partners rp
  LEFT JOIN public.customers c ON c.referral_partner_id = rp.id
  WHERE rp.consultant_id = auth.uid()
    AND rp.is_active = true
  GROUP BY rp.id, rp.nome
  ORDER BY lead_count DESC;
$$;
```

### RLS Policies

```sql
ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;

-- Consultores veem/editam apenas seus próprios parceiros
CREATE POLICY "consultants_own_partners" ON public.referral_partners
  FOR ALL USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

-- Service role (Edge Functions) tem acesso total
CREATE POLICY "service_role_all" ON public.referral_partners
  FOR ALL USING (auth.role() = 'service_role');
```

## Error Handling

| Cenário | Comportamento |
|---------|---------------|
| Keyword matcher falha (exceção) | Log warning, continua sem atribuição (fail-open) |
| Parceiro deletado após match | `ON DELETE SET NULL` limpa `referral_partner_id` |
| Consultor sem `igreen_id` | Fallback para `cadastro_url` existente do consultor |
| Nenhum parceiro cadastrado | Skip keyword detection (partners array vazio) |
| Mensagem vazia/mídia | Skip keyword detection (guard `messageText && !isFile`) |
| QR code com telefone inválido | Validação no frontend antes de gerar |
| Database timeout na busca de partners | Catch + log, continua sem atribuição |
| Keyword duplicada entre parceiros | Primeiro parceiro na lista (order by created_at) vence |
| INSERT no painel sem `consultant_id` | RLS `WITH CHECK` rejeita com 403 — frontend SEMPRE estampa `consultant_id = auth.uid()` antes de enviar |

## Testing Strategy

### Unit Tests (keyword-matcher.ts)

- Normalização de texto com acentos, pontuação, emojis
- Substring match exato após normalização
- Fuzzy match com Levenshtein ≤ 1
- Rejeição de matches com distância > 1
- `buildCadastroLink` com e sem `partnerCli`

### Property-Based Tests

- Normalização é idempotente
- Keyword presente no texto sempre produz match
- Link com partner sempre contém `&cli=`
- Link sem partner nunca contém `&cli=`
- Validação rejeita payloads sem campos obrigatórios

### Integration Tests

- Webhook flow: mensagem com keyword → customer.referral_partner_id preenchido
- Detection window: 4ª mensagem com keyword → sem match
- `finalizar_cadastro`: link gerado com `&cli=` correto
- RLS: consultor A não vê parceiros de consultor B

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Text normalization removes all diacritics and punctuation

*For any* input string, `normalizeText(input)` SHALL produce a string that contains no Unicode diacritical marks (U+0300–U+036F), no punctuation characters, and is entirely lowercase.

**Validates: Requirements 2.1**

### Property 2: Keyword exact match after normalization

*For any* message text and keyword where `normalizeText(message)` contains `normalizeText(keyword)` as a substring, `matchKeyword(message, [{partnerId, keywords: [keyword]}])` SHALL return a non-null result with the correct `partnerId`.

**Validates: Requirements 2.2**

### Property 3: Detection window boundary enforcement

*For any* lead with an `inboundCount >= 3`, the keyword detection logic SHALL NOT execute, regardless of whether the message contains a matching keyword.

**Validates: Requirements 2.3**

### Property 4: First chronological match wins

*For any* sequence of messages within the Detection Window where multiple keywords from different partners match, the system SHALL attribute the lead to the partner whose keyword matched in the earliest message (lowest inbound index).

**Validates: Requirements 2.4**

### Property 5: No match within window marks lead as unattributed

*For any* lead whose first 3 inbound messages contain no text matching any registered keyword (after normalization), the lead's `referral_partner_id` SHALL remain NULL after the Detection Window closes.

**Validates: Requirements 2.6**

### Property 6: Link generation with partner includes cli parameter

*For any* valid `consultantIgreenId` and non-null `partnerCli`, `buildCadastroLink(consultantIgreenId, partnerCli)` SHALL return a URL containing both `?id={consultantIgreenId}` and `&cli={partnerCli}`.

**Validates: Requirements 3.1**

### Property 7: Link generation without partner excludes cli parameter

*For any* valid `consultantIgreenId` and null `partnerCli`, `buildCadastroLink(consultantIgreenId, null)` SHALL return a URL containing `?id={consultantIgreenId}` and NOT containing the substring `&cli=`.

**Validates: Requirements 3.2**

### Property 8: Partner validation rejects missing required fields

*For any* submission payload where `nome` is empty/whitespace OR `cli` is empty/whitespace, the system SHALL reject the creation and return a validation error.

**Validates: Requirements 1.7**

### Property 9: Consultant isolation in keyword matching

*For any* lead belonging to consultant A, and any set of partners belonging to consultant B (where A ≠ B), the keyword matcher SHALL never match against consultant B's keywords, even if the message text contains them.

**Validates: Requirements 7.1, 7.2**

### Property 10: QR code URL contains keyword phrase

*For any* partner with a keyword and a valid consultant phone, the generated QR code URL SHALL be a valid `wa.me` link containing the keyword (or custom `qr_phrase`) as the pre-filled message text parameter.

**Validates: Requirements 4.2**

### Property 11: Normalization idempotence

*For any* input string, `normalizeText(normalizeText(input))` SHALL equal `normalizeText(input)` — applying normalization twice produces the same result as applying it once.

**Validates: Requirements 2.1**

### Property 12: Frontend INSERT stamps consultant_id from auth session

*For any* `create` mutation invocation in `useReferralPartners`, the INSERT payload sent to PostgREST SHALL contain a `consultant_id` field equal to `auth.getUser().data.user.id`. If the user is not authenticated, the mutation SHALL throw before issuing the INSERT.

**Validates: Requirements 7.4, 7.5**
