---
name: super-admin-template-fork
description: Roles super_admin vs admin, fork de templates ao editar, e tags Facebook por consultor
type: feature
---
## Roles
- `app_role` enum: `user`, `admin`, `super_admin`
- `is_super_admin(uuid)` SECURITY DEFINER, retorna boolean
- Super Admin único: rafael.ids@icloud.com (id 0c2711ad-4836-41e6-afba-edd94f698ae3)
- Admin não-super (ex: Rafael Ferreira 2) é tratado como consultor para templates

## Fork de templates
- `message_templates` e `ad_templates` têm `origin_template_id uuid` (e ad_templates ganhou `consultant_id`)
- RPCs: `fork_message_template(_origin_id)` e `fork_ad_template(_origin_id)` retornam o id da cópia (idempotente por dono)
- RLS: Super Admin gerencia originais (consultant_id IS NULL ou origin IS NULL); demais só seu próprio fork
- UI: TemplateListItem mostra Pencil para super/dono e Copy para outros (chama RPC e abre o fork em edição)
- TemplateManager esconde o original quando o usuário já tem fork

## Bucket IMAGE
- SELECT público; Super Admin gerencia tudo; consultor gerencia só pasta `consultant-{uid}/`

## Facebook Ads — tags por consultor
- `consultants.facebook_label_id` cacheia o id do adlabel Meta (criado via POST /{ad_account}/adlabels com nome `consultor:{license}:{name}`)
- Edge `facebook-create-campaign` anexa `adlabels=[{id}]` em campaign, adset e ad
- Nomes padronizados: `[CONS-{license}] {distribuidora} · {detalhe} · {data}`
- `url_tags` no creative e UTMs no link wa.me: utm_source=facebook, utm_medium=cpc, utm_campaign={{campaign.id}}, utm_content=consultor_{license}, utm_term={{adset.id}}
