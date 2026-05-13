## Bug
Ao publicar campanha, a Meta retorna:
> "A idade máxima está abaixo do limite | Com conjuntos de anúncios que usam o público Advantage+, o controle de público de idade máxima não pode ser configurado para menos de 65 anos." (subcode 1870189)

## Causa raiz
Em `supabase/functions/facebook-create-campaign/index.ts` (linhas 299-304), o objeto `targeting` enviado para `/adsets` contém:
- `age_min: 25` ✓
- `age_range: [25, 65]` ✗ (campo inexistente no endpoint `/adsets` — Meta ignora silenciosamente)
- `targeting_automation: { advantage_audience: 1 }` ✓

Como `age_max` nunca chega à Meta e Advantage+ Audience exige `age_max ≥ 65` explícito, a validação falha. O `Math.max(..., 65)` na linha 219 já calcula o valor certo (`ageMax = 65`), mas ele **nunca é incluído** no payload — só é gravado no banco (linha 589).

Confirma-se observando que `facebook-preflight-check` (linha 112) e `facebook-cbo-to-abo` (linha 141) já enviam `age_max` corretamente, por isso o pré-voo passou mas a criação real falhou.

## Correção (1 arquivo, 3 linhas)

`supabase/functions/facebook-create-campaign/index.ts`, bloco do `targeting` (linhas 293-304):

```ts
const targeting: Record<string, unknown> = {
  geo_locations: {
    cities: body.cities.map((c) => ({ key: c.key, radius: 25, distance_unit: "kilometer" })),
    location_types: ["home", "recent"],
  },
  age_min: ageMin,
  age_max: ageMax,                              // ← ADICIONAR (Advantage+ exige >= 65)
  targeting_automation: { advantage_audience: 1 },
};
```

Mudanças:
1. Remover `age_range: [ageMin, ageMax]` (campo inválido em `/adsets`).
2. Adicionar `age_max: ageMax` (já calculado na linha 219 como `Math.max(body.age_max ?? 65, 65)`).
3. Atualizar o comentário acima para refletir a regra correta da Meta.

## Validação
- Republicar a mesma campanha do screenshot e confirmar que o erro 1870189 some.
- Conferir nos logs da edge function (`facebook-create-campaign`) que não aparece mais `subcode=1870189`.
- O fluxo de pré-voo continua igual (já estava correto).

## Fora de escopo
- Não mexer em `facebook-preflight-check` nem `facebook-cbo-to-abo` (já corretos).
- Não alterar `age_min` (cap em 25 já está correto).
- Sem mudanças de UI nem de schema.
