
CREATE OR REPLACE FUNCTION public.get_referral_partner_analytics()
RETURNS TABLE(
  partner_id UUID,
  partner_nome TEXT,
  keywords TEXT[],
  leads_total BIGINT,
  leads_30d BIGINT,
  leads_prev_30d BIGINT,
  aprovados BIGINT,
  reprovados BIGINT,
  conta_recebida BIGINT,
  qr_count BIGINT,
  keyword_count BIGINT,
  daily_series JSONB,
  funnel JSONB,
  last_lead_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_partners AS (
    SELECT id, nome, keywords
    FROM public.referral_partners
    WHERE consultant_id = auth.uid()
      AND is_active = true
  ),
  cust AS (
    SELECT
      c.referral_partner_id AS pid,
      c.referral_detected_at,
      c.conversation_step,
      c.pos_venda_stage,
      COALESCE(c.lead_source_detail->>'source', '') AS src
    FROM public.customers c
    WHERE c.referral_partner_id IN (SELECT id FROM my_partners)
  ),
  days AS (
    SELECT generate_series(
      (now()::date - INTERVAL '29 days')::date,
      now()::date,
      INTERVAL '1 day'
    )::date AS d
  ),
  daily AS (
    SELECT
      mp.id AS pid,
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(days.d, 'YYYY-MM-DD'),
          'count', COALESCE(cnt.c, 0)
        )
        ORDER BY days.d
      ) AS series
    FROM my_partners mp
    CROSS JOIN days
    LEFT JOIN (
      SELECT
        pid,
        date_trunc('day', referral_detected_at)::date AS d,
        COUNT(*) AS c
      FROM cust
      WHERE referral_detected_at >= now() - INTERVAL '30 days'
      GROUP BY pid, d
    ) cnt ON cnt.pid = mp.id AND cnt.d = days.d
    GROUP BY mp.id
  )
  SELECT
    mp.id AS partner_id,
    mp.nome AS partner_nome,
    mp.keywords,
    COALESCE(COUNT(cu.pid), 0) AS leads_total,
    COALESCE(COUNT(*) FILTER (WHERE cu.referral_detected_at >= now() - INTERVAL '30 days'), 0) AS leads_30d,
    COALESCE(COUNT(*) FILTER (WHERE cu.referral_detected_at >= now() - INTERVAL '60 days' AND cu.referral_detected_at < now() - INTERVAL '30 days'), 0) AS leads_prev_30d,
    COALESCE(COUNT(*) FILTER (WHERE cu.pos_venda_stage = 'Aprovado'), 0) AS aprovados,
    COALESCE(COUNT(*) FILTER (WHERE cu.pos_venda_stage = 'Reprovado'), 0) AS reprovados,
    COALESCE(COUNT(*) FILTER (WHERE cu.conversation_step IN ('conta_recebida','aguardando_aprovacao','aprovado','pos_venda')), 0) AS conta_recebida,
    COALESCE(COUNT(*) FILTER (WHERE cu.src = 'qr_code'), 0) AS qr_count,
    COALESCE(COUNT(*) FILTER (WHERE cu.src <> 'qr_code' AND cu.pid IS NOT NULL), 0) AS keyword_count,
    COALESCE((SELECT series FROM daily WHERE daily.pid = mp.id), '[]'::jsonb) AS daily_series,
    jsonb_build_object(
      'lead', COALESCE(COUNT(cu.pid), 0),
      'conta', COALESCE(COUNT(*) FILTER (WHERE cu.conversation_step IN ('conta_recebida','aguardando_aprovacao','aprovado','pos_venda')), 0),
      'aprovado', COALESCE(COUNT(*) FILTER (WHERE cu.pos_venda_stage = 'Aprovado'), 0)
    ) AS funnel,
    MAX(cu.referral_detected_at) AS last_lead_at
  FROM my_partners mp
  LEFT JOIN cust cu ON cu.pid = mp.id
  GROUP BY mp.id, mp.nome, mp.keywords
  ORDER BY leads_total DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_partner_analytics() TO authenticated;
