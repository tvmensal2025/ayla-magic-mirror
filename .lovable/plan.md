## Reorganização do Painel do Consultor (`/admin`)

### 1. Navegação principal (limpeza)
Remover 3 abas da barra: **Preview**, **Histórico** e **Dados**. A barra fica:

`Dashboard · CRM · Clientes · Rede · WhatsApp · Central de Anúncios · Links · Materiais`

### 2. Preview → dentro de **Links**
- `LinksTab.tsx` ganha um sub-toggle no topo: **Links** | **Preview**.
- Conteúdo atual fica em "Links"; "Preview" renderiza o `PreviewTab` existente (mesmas props que já passamos hoje).
- Em `Admin.tsx` remover o case `activeTab === "preview"` e o item da array `tabs`.

### 3. Histórico → dentro de **WhatsApp**
- `WhatsAppTab.tsx` ganha um sub-toggle (ou aba interna) **Conversas** | **Histórico Automático**.
- "Histórico Automático" renderiza `<AutoMessageLog consultantId={userId} />`.
- Em `Admin.tsx` remover o case `activeTab === "historico"` e o item da array `tabs`.

### 4. Dados → engrenagem no header
- No header (ao lado do sino de notificações), adicionar botão `Settings` (ícone engrenagem) que abre um **Sheet/Drawer lateral** com o `DadosTab` atual dentro (sem mudar o componente, só envolver).
- Remover o item `"dados"` da array `tabs` e o case correspondente.

### 5. Onboarding obrigatório (gating)
Antes de liberar o painel, o consultor precisa preencher **4 campos obrigatórios**:

1. Nome completo (`name`)
2. ID iGreen (`igreen_id`)
3. WhatsApp principal (`phone`)
4. WhatsApp para alertas (`notification_phone`)

Implementação:
- Criar `OnboardingGate.tsx` que recebe `form` e renderiza um **modal fullscreen bloqueante** quando qualquer um dos 4 campos está vazio.
- O modal mostra um mini-formulário com só esses 4 campos + botão "Liberar painel" (chama o mesmo `handleSave` do `useConsultantForm`).
- Em `Admin.tsx`, logo após o gate de `approved`, montar `<OnboardingGate>` envolvendo todo o conteúdo. Enquanto não preenchidos, o resto do painel fica inacessível (a engrenagem também não abre — só o gate).

### 6. Auto-sync do telefone para Facebook Ads
Hoje `loadConsultantAdSettings` (edge function) já faz fallback para `consultants.phone` quando `consultant_ad_settings.whatsapp_destination_number` está vazio, mas só é gravado on-demand. Vamos garantir no momento do save:

- No `useConsultantForm` (handler de save), **logo após** persistir `consultants`, fazer um `upsert` em `consultant_ad_settings`:
  ```
  { consultant_id: userId,
    whatsapp_destination_number: form.phone }   // só dígitos, sem +55
  ```
  com `onConflict: "consultant_id"`.
- Disparado sempre que o usuário salvar com `phone` e `notification_phone` preenchidos (regra do usuário: "assim que ele colocar o telefone para alerta, ativar o telefone principal para o Facebook anunciar").
- Resultado: novos anúncios criados via plataforma usam o número do consultor como destino do botão WhatsApp do Meta Ads. Leads chegam direto no WhatsApp dele; toda a telemetria (gasto, CPL, CRM) continua centralizada no admin (sem mudança de fluxo de dados).

### Técnico — arquivos tocados

```text
src/pages/Admin.tsx
  - remover tabs preview/historico/dados (array + cases)
  - adicionar botão engrenagem no header → Sheet com <DadosTab/>
  - envolver <main> com <OnboardingGate form={form} onSave={handleSave}>

src/components/admin/LinksTab.tsx
  - adicionar Tabs interna [Links | Preview]
  - importar PreviewTab e renderizar nas mesmas condições

src/components/whatsapp/WhatsAppTab.tsx
  - adicionar Tabs interna [Conversas | Histórico]
  - importar AutoMessageLog

src/components/admin/OnboardingGate.tsx  (novo)
  - modal bloqueante com 4 campos obrigatórios

src/hooks/useConsultantForm.ts
  - no save, upsert em consultant_ad_settings
    com whatsapp_destination_number = phone (só dígitos)
```

Sem migrations — `consultant_ad_settings` já existe.
Sem mudança de lógica de anúncios/CRM — só plumbing de UI e um upsert.