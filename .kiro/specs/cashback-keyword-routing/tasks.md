# Implementation Plan: Cashback Keyword Routing

## Overview

Implementação do sistema de roteamento de cashback por palavras-chave. O plano segue uma abordagem incremental: primeiro a infraestrutura de dados (migration), depois o módulo puro de matching (testável isoladamente), integração nos webhooks existentes, e por fim o frontend de gestão. Cada etapa valida funcionalidade antes de avançar.

## Tasks

- [x] 1. Database migration: tabela, colunas, RLS e função de métricas
  - [x] 1.1 Create migration file for `referral_partners` table, `customers` columns, RLS policies, and `get_referral_partner_metrics` function
    - Create table `referral_partners` with columns: `id` (UUID PK), `consultant_id` (FK → consultants), `nome` (TEXT NOT NULL), `keywords` (TEXT[] NOT NULL DEFAULT '{}'), `cli` (TEXT NOT NULL), `qr_phrase` (TEXT nullable), `is_active` (BOOLEAN DEFAULT true), `created_at`, `updated_at`
    - Add columns to `customers`: `referral_partner_id` (UUID FK → referral_partners ON DELETE SET NULL), `referral_keyword_matched` (TEXT), `referral_detected_at` (TIMESTAMPTZ)
    - Enable RLS on `referral_partners` with policy `consultants_own_partners` (FOR ALL USING consultant_id = auth.uid() WITH CHECK consultant_id = auth.uid())
    - Add policy `service_role_all` (FOR ALL USING auth.role() = 'service_role')
    - Create function `get_referral_partner_metrics()` RETURNS TABLE(partner_id UUID, partner_nome TEXT, lead_count BIGINT) with SECURITY DEFINER scoped to auth.uid()
    - _Requirements: 1.2, 7.1, 7.3, 5.1_

- [x] 2. Shared module `keyword-matcher.ts`
  - [x] 2.1 Implement `normalizeText`, `matchKeyword`, `buildCadastroLink`, and `levenshtein` in `supabase/functions/_shared/keyword-matcher.ts`
    - `normalizeText`: NFD decompose → strip diacritics (U+0300–U+036F) → lowercase → punctuation to space → collapse whitespace → trim
    - `matchKeyword`: iterate partners/keywords, exact substring match first, then Levenshtein ≤ 1 for keywords with 5+ chars (word-level)
    - `buildCadastroLink`: base URL `https://digital.igreenenergy.com.br/` + `?id={consultantIgreenId}` + optional `&cli={partnerCli}`
    - `levenshtein`: standard DP implementation
    - Export interfaces `KeywordMatchResult` and `PartnerKeywords`
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

  - [ ]* 2.2 Write unit tests for `keyword-matcher.ts` in `supabase/functions/_shared/keyword-matcher_test.ts`
    - Test `normalizeText` with accents (café → cafe), punctuation, emojis, empty strings
    - Test `matchKeyword` exact substring match after normalization
    - Test `matchKeyword` fuzzy match with Levenshtein ≤ 1 for 5+ char keywords
    - Test `matchKeyword` rejects matches with distance > 1
    - Test `matchKeyword` returns null for empty partners array
    - Test `buildCadastroLink` with partnerCli (includes `&cli=`)
    - Test `buildCadastroLink` without partnerCli (no `&cli=`)
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

  - [ ]* 2.3 Write property test: normalization removes all diacritics and punctuation
    - **Property 1: Text normalization removes all diacritics and punctuation**
    - Use fast-check to generate arbitrary Unicode strings, assert output has no chars in U+0300–U+036F range, no punctuation, all lowercase
    - **Validates: Requirements 2.1**

  - [ ]* 2.4 Write property test: normalization idempotence
    - **Property 11: Normalization idempotence**
    - For any input, `normalizeText(normalizeText(input)) === normalizeText(input)`
    - **Validates: Requirements 2.1**

  - [ ]* 2.5 Write property test: keyword exact match after normalization
    - **Property 2: Keyword exact match after normalization**
    - For any message containing a keyword as substring (post-normalization), `matchKeyword` returns non-null with correct partnerId
    - **Validates: Requirements 2.2**

  - [ ]* 2.6 Write property test: link with partner includes cli parameter
    - **Property 6: Link generation with partner includes cli parameter**
    - For any valid consultantIgreenId and non-null partnerCli, result contains `?id={id}` and `&cli={cli}`
    - **Validates: Requirements 3.1**

  - [ ]* 2.7 Write property test: link without partner excludes cli parameter
    - **Property 7: Link generation without partner excludes cli parameter**
    - For any valid consultantIgreenId and null partnerCli, result contains `?id={id}` and does NOT contain `&cli=`
    - **Validates: Requirements 3.2**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Webhook integration: keyword detection in both channels
  - [x] 4.1 Add keyword detection logic to `supabase/functions/whapi-webhook/index.ts`
    - Import `matchKeyword` and `PartnerKeywords` from `../_shared/keyword-matcher.ts`
    - After customer find/create, before engine: check `!customer.referral_partner_id && messageText && !isFile`
    - Query inbound message count from `conversations` for detection window (< 3)
    - Query active `referral_partners` for the customer's `consultant_id`
    - Call `matchKeyword()` and update `customers` with `referral_partner_id`, `referral_keyword_matched`, `referral_detected_at`
    - Fail-open: wrap in try/catch, log warning on error, continue without attribution
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 7.2_

  - [x] 4.2 Add keyword detection logic to `supabase/functions/evolution-webhook/index.ts`
    - Same logic as 4.1 but adapted to Evolution webhook's message handling structure
    - Ensure identical behavior to Whapi webhook (same shared module, same detection window)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.2, 7.2_

- [ ] 5. Link generation in `finalizar_cadastro` step
  - [x] 5.1 Modify `finalizar_cadastro` handler in whapi-webhook's `bot-flow.ts` to use `buildCadastroLink`
    - Import `buildCadastroLink` from `../_shared/keyword-matcher.ts`
    - If `customer.referral_partner_id` exists, query `referral_partners` for `cli`
    - Replace direct `cadastro_url` assignment with `buildCadastroLink(consultantRow.igreen_id, partnerCli)`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 5.2 Modify `finalizar_cadastro` handler in evolution-webhook's `bot-flow.ts` to use `buildCadastroLink`
    - Same logic as 5.1 for Evolution webhook channel
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 6. Checkpoint - Ensure webhook integration compiles and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Frontend: CRUD de Parceiros Indicadores
  - [x] 7.1 Create `src/components/admin/parceiros/hooks/useReferralPartners.ts`
    - Implement React Query hook with `queryFn` fetching from `referral_partners` table
    - Implement `create` mutation (insert with nome, keywords, cli, qr_phrase)
    - Implement `update` mutation (patch by id)
    - Implement `remove` mutation (soft-delete: set `is_active = false`)
    - Implement `metrics` query calling `get_referral_partner_metrics` RPC
    - Export `ReferralPartner` and `PartnerMetric` interfaces
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 5.1_

  - [x] 7.2 Create `src/components/admin/parceiros/PartnerForm.tsx`
    - Modal/dialog form with fields: nome (required), cli (required), keywords (tag input), qr_phrase (optional)
    - Use react-hook-form + zod validation: reject empty nome or cli
    - Support both create and edit modes (pre-fill when `partnerId` provided)
    - Display validation errors for missing required fields
    - _Requirements: 1.1, 1.3, 1.4, 1.7_

  - [x] 7.3 Create `src/components/admin/parceiros/PartnerList.tsx`
    - Table component displaying partner nome, keywords (as badges), cli, created_at
    - Action buttons: Edit, Delete, QR Code per row
    - Loading skeleton state
    - _Requirements: 1.6_

  - [x] 7.4 Create `src/components/admin/parceiros/ParceirosTab.tsx`
    - Main tab component composing PartnerList + PartnerForm + PartnerMetrics
    - "Novo Parceiro" button to open form
    - Wire edit/delete actions from PartnerList to hook mutations
    - _Requirements: 1.1, 1.6_

- [x] 8. Frontend: QR Code generation
  - [x] 8.1 Create `src/components/admin/parceiros/PartnerQrCode.tsx`
    - Modal component receiving partnerName, keyword, consultantPhone, qr_phrase
    - Build `wa.me` URL with pre-filled message text (qr_phrase or keyword)
    - Render QR code using `qrcode.react` library (already in dependencies)
    - Add download button for the QR code image
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 8.2 Write property test: QR code URL contains keyword phrase
    - **Property 10: QR code URL contains keyword phrase**
    - For any partner keyword and valid phone, the generated URL is a valid `wa.me` link with the keyword as pre-filled text parameter
    - Implement in `src/components/admin/parceiros/__tests__/partner-qrcode.property.test.ts` using vitest + fast-check
    - **Validates: Requirements 4.2**

- [x] 9. Frontend: Dashboard de métricas
  - [x] 9.1 Create `src/components/admin/parceiros/PartnerMetrics.tsx`
    - Card component showing lead count per partner (bar chart or simple table)
    - Use data from `useReferralPartners().metrics`
    - Display partner nome alongside lead count
    - Handle empty state (no partners or no leads yet)
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 10. Wire ParceirosTab into admin panel
  - [x] 10.1 Add ParceirosTab to the admin panel navigation/tabs
    - Import and register ParceirosTab in the existing admin tabs structure
    - Add "Parceiros" tab label with appropriate icon
    - _Requirements: 1.1, 1.6_

- [x] 11. Checkpoint - Ensure frontend builds and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. E2E test: keyword routing flow
  - [ ]* 12.1 Write E2E scenario in `supabase/functions/bot-e2e-runner/` for keyword routing
    - Scenario: create referral_partner → simulate inbound message with keyword → assert customer.referral_partner_id is set
    - Scenario: simulate 4th message with keyword → assert no match (detection window closed)
    - Scenario: finalizar_cadastro with matched partner → assert link contains `&cli=`
    - Scenario: finalizar_cadastro without match → assert link does NOT contain `&cli=`
    - _Requirements: 2.2, 2.3, 3.1, 3.2_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Bugfix: RLS 403 ao criar parceiro no painel
  - [x] 14.1 Stamp `consultant_id` in `useReferralPartners.create` mutation
    - In `src/components/admin/parceiros/hooks/useReferralPartners.ts`, resolve current user via `supabase.auth.getUser()` inside the `mutationFn`
    - Throw `"Usuário não autenticado"` if no user
    - Add `consultant_id: user.id` to the INSERT payload so RLS `WITH CHECK (consultant_id = auth.uid())` passes
    - _Requirements: 7.4, 7.5_

  - [x] 14.2 Manual smoke test in admin panel
    - Open admin panel as authenticated consultant
    - Click "Novo Parceiro", fill nome + cli + 1 keyword, save
    - Assert no 403 in network tab and partner appears in list
    - Edit partner (update mutation also runs under RLS — verify it works)
    - Soft-delete partner (remove mutation) — verify it disappears from list
    - _Requirements: 1.2, 1.4, 1.5_
    - _Validated 2026-05-26 via Playwright: POST 201, PATCH (update) 204, PATCH (soft-delete) 204, list refetched correctly. RLS policy `consultants_own_partners` working as expected._

  - [ ] 14.3 Commit and push the bugfix
    - Stage `src/components/admin/parceiros/hooks/useReferralPartners.ts`
    - Stage `.kiro/specs/cashback-keyword-routing/{requirements,design,tasks}.md` (spec alignment)
    - Commit on branch `fix/flow-engine-v3-rewrite` with message `fix(parceiros): stamp consultant_id on INSERT to satisfy RLS WITH CHECK`
    - Push to origin
    - _Requirements: 7.4_

- [ ] 15. Deploy edge functions with keyword-matcher integration
  - [ ] 15.1 Deploy `whapi-webhook` and `evolution-webhook` to production
    - Use Supabase CLI or MCP `deploy_edge_function`
    - Verify deployment with smoke test message containing a registered keyword
    - Confirm `customers.referral_partner_id` is populated after the inbound
    - _Requirements: 6.1, 6.2_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `keyword-matcher.ts` module is pure (no I/O) and can be tested in isolation with `deno test`
- Frontend tests use vitest + fast-check for property-based testing
- E2E tests follow the existing `bot-e2e-runner` pattern (synthetic scenarios, no real WhatsApp calls)
- Deploy is excluded as it's not a coding task — use existing CI/CD pipeline

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "id": 3, "tasks": ["4.1", "4.2", "7.1"] },
    { "id": 4, "tasks": ["5.1", "5.2", "7.2", "7.3", "9.1"] },
    { "id": 5, "tasks": ["7.4", "8.1"] },
    { "id": 6, "tasks": ["8.2", "10.1"] },
    { "id": 7, "tasks": ["12.1"] }
  ]
}
```
