# Requirements Document

## Introduction

Sistema de roteamento de cashback por palavras-chave que permite consultores cadastrarem "parceiros indicadores". Quando um lead novo envia uma mensagem contendo uma palavra-chave associada a um parceiro, o link de cadastro iGreen gerado inclui o parâmetro `&cli=` do parceiro, garantindo que o parceiro receba cashback pela indicação. Se nenhuma palavra-chave for detectada nas primeiras mensagens, o link padrão do consultor (sem `&cli=`) é utilizado.

## Glossary

- **Sistema**: O conjunto de Edge Functions (Supabase/Deno), banco PostgreSQL e painel React que compõem a plataforma Ayla Magic Mirror
- **Consultor**: Usuário autenticado no painel que gerencia leads e parceiros indicadores
- **Parceiro_Indicador**: Entidade cadastrada pelo consultor contendo nome, palavras-chave e `cli` (ID do cliente no portal iGreen)
- **Lead**: Cliente potencial que inicia conversa via WhatsApp
- **Keyword_Matcher**: Módulo responsável por detectar palavras-chave nas mensagens do lead usando correspondência fuzzy
- **Detection_Window**: Janela de detecção limitada às primeiras 3 mensagens inbound de um lead
- **Link_Cadastro**: URL de cadastro no formato `https://digital.igreenenergy.com.br/?id={consultor_igreen_id}&cli={parceiro_cli_id}`
- **Link_Padrao**: URL de cadastro no formato `https://digital.igreenenergy.com.br/?id={consultor_igreen_id}` (sem parâmetro `cli`)
- **Painel**: Interface web React + shadcn/ui onde o consultor gerencia parceiros e visualiza métricas
- **QR_Code**: Código QR gerado a partir de uma frase pré-definida para o parceiro divulgar

## Requirements

### Requirement 1: CRUD de Parceiros Indicadores

**User Story:** As a Consultor, I want to create, read, update, and delete referral partners with their keywords, so that I can manage which partners earn cashback from leads they refer.

#### Acceptance Criteria

1. THE Painel SHALL provide a self-service interface for the Consultor to create a Parceiro_Indicador with nome, lista de palavras-chave, e cli
2. WHEN the Consultor submits a new Parceiro_Indicador, THE Sistema SHALL persist the record in PostgreSQL associated with the Consultor's ID
3. THE Painel SHALL allow the Consultor to assign multiple keywords to a single Parceiro_Indicador
4. WHEN the Consultor edits a Parceiro_Indicador, THE Sistema SHALL update the nome, palavras-chave, or cli fields accordingly
5. WHEN the Consultor deletes a Parceiro_Indicador, THE Sistema SHALL remove the record and disassociate all related keywords
6. THE Painel SHALL display the list of all Parceiro_Indicador records belonging to the authenticated Consultor
7. IF the Consultor submits a Parceiro_Indicador without nome or cli, THEN THE Sistema SHALL reject the submission and display a validation error

### Requirement 2: Detecção Fuzzy de Palavras-Chave

**User Story:** As a Consultor, I want the system to detect partner keywords in lead messages using fuzzy matching, so that minor typos or accent variations do not prevent partner attribution.

#### Acceptance Criteria

1. WHEN a Lead sends an inbound message, THE Keyword_Matcher SHALL normalize the text by removing accents, punctuation, and converting to lowercase before comparison
2. WHEN a normalized message contains a substring that matches a registered keyword within fuzzy tolerance, THE Sistema SHALL associate the Lead with the corresponding Parceiro_Indicador
3. THE Keyword_Matcher SHALL evaluate keyword matches only within the Detection_Window of the first 3 inbound messages from the Lead
4. WHEN multiple keywords from different Parceiro_Indicador records match within the Detection_Window, THE Sistema SHALL use the first match found chronologically
5. WHEN a keyword match is detected, THE Sistema SHALL persist the matched Parceiro_Indicador ID and matched keyword on the Lead's customer record
6. IF no keyword match is detected after the Detection_Window closes, THEN THE Sistema SHALL mark the Lead as having no partner attribution

### Requirement 3: Roteamento de Link de Cadastro

**User Story:** As a Consultor, I want the registration link to automatically include the partner's cli parameter when a keyword match is found, so that the referring partner receives cashback.

#### Acceptance Criteria

1. WHEN the conversational flow reaches the `finalizar_cadastro` step and the Lead has a matched Parceiro_Indicador, THE Sistema SHALL generate the Link_Cadastro using the format `https://digital.igreenenergy.com.br/?id={consultor_igreen_id}&cli={parceiro_cli_id}`
2. WHEN the conversational flow reaches the `finalizar_cadastro` step and the Lead has no matched Parceiro_Indicador, THE Sistema SHALL generate the Link_Padrao using the format `https://digital.igreenenergy.com.br/?id={consultor_igreen_id}`
3. THE Sistema SHALL use the same link routing logic for both Whapi Cloud and Evolution API channels

### Requirement 4: Geração de QR Code para Parceiro

**User Story:** As a Consultor, I want to generate a QR code with a pre-defined phrase for each partner, so that the partner can share it with potential leads to trigger keyword detection.

#### Acceptance Criteria

1. THE Painel SHALL provide a button to generate a QR_Code for each Parceiro_Indicador
2. WHEN the Consultor clicks the QR_Code generation button, THE Sistema SHALL encode a pre-defined phrase containing the partner's keyword into the QR_Code
3. THE Painel SHALL display the generated QR_Code for download or sharing

### Requirement 5: Dashboard de Métricas por Parceiro

**User Story:** As a Consultor, I want to see how many leads came from each referral partner, so that I can evaluate partner performance.

#### Acceptance Criteria

1. THE Painel SHALL display a metrics view showing the count of leads attributed to each Parceiro_Indicador
2. WHEN a new Lead is attributed to a Parceiro_Indicador, THE Painel SHALL reflect the updated count upon page refresh or navigation
3. THE Painel SHALL show the Parceiro_Indicador nome alongside the lead count for each entry

### Requirement 6: Compatibilidade Multi-Canal

**User Story:** As a Consultor, I want keyword detection to work identically on both WhatsApp channels (Whapi Cloud and Evolution API), so that partner attribution is consistent regardless of which channel the lead uses.

#### Acceptance Criteria

1. WHEN a Lead sends a message via Whapi Cloud webhook, THE Keyword_Matcher SHALL execute the same fuzzy detection logic as for Evolution API messages
2. WHEN a Lead sends a message via Evolution API webhook, THE Keyword_Matcher SHALL execute the same fuzzy detection logic as for Whapi Cloud messages
3. THE Sistema SHALL store partner attribution data in the same database structure regardless of the inbound channel

### Requirement 7: Isolamento por Consultor

**User Story:** As a Consultor, I want my referral partners and keywords to be isolated from other consultants, so that there is no cross-contamination of partner data.

#### Acceptance Criteria

1. THE Sistema SHALL scope all Parceiro_Indicador records to the owning Consultor's ID
2. WHEN the Keyword_Matcher evaluates messages for a Lead, THE Sistema SHALL only compare against keywords belonging to the Lead's assigned Consultor
3. IF a Consultor attempts to access or modify another Consultor's Parceiro_Indicador, THEN THE Sistema SHALL deny the request
