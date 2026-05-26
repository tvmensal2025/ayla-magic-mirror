CREATE OR REPLACE VIEW public.v_flow_engine_health
WITH (security_invoker = true)
AS
SELECT
  c.id AS consultant_id,
  c.name AS consultant_name,
  c.flow_engine_v3 AS flag,
  count(cfs.customer_id) FILTER (WHERE cfs.updated_at > (now() - interval '24 hours')) AS turns_24h,
  count(cfs.customer_id) FILTER (WHERE cfs.status LIKE 'paused_%') AS paused_total,
  count(cfs.customer_id) FILTER (WHERE cfs.status = 'delegated_legacy') AS delegated_total,
  count(cfs.customer_id) FILTER (WHERE cfs.status = 'converted') AS converted_total,
  count(cfs.customer_id) AS state_rows_total,
  max(cfs.updated_at) AS last_tick_at,
  COALESCE(dl.dark_outputs_24h, 0)::bigint AS dark_outputs_24h,
  COALESCE(dl.dark_output_errors_24h, 0)::bigint AS dark_output_errors_24h,
  CASE
    WHEN COALESCE(dl.dark_outputs_24h, 0) = 0 THEN NULL
    ELSE ROUND(
      (COALESCE(dl.dark_output_errors_24h, 0)::numeric * 100.0)
      / NULLIF(dl.dark_outputs_24h, 0)::numeric,
    2)
  END AS dark_output_error_pct
FROM consultants c
LEFT JOIN customers cu ON cu.consultant_id = c.id
LEFT JOIN customer_flow_state cfs ON cfs.customer_id = cu.id
LEFT JOIN LATERAL (
  SELECT
    count(*) AS dark_outputs_24h,
    count(*) FILTER (
      WHERE (el.payload ->> 'engine_error') IS NOT NULL
        AND (el.payload ->> 'engine_error') <> ''
    ) AS dark_output_errors_24h
  FROM public.engine_logs el
  JOIN public.customers cu2 ON cu2.id = el.customer_id
  WHERE cu2.consultant_id = c.id
    AND el.kind = 'engine_dark_output'
    AND el.at > now() - interval '24 hours'
) dl ON true
GROUP BY c.id, c.name, c.flow_engine_v3, dl.dark_outputs_24h, dl.dark_output_errors_24h;

GRANT SELECT ON public.v_flow_engine_health TO authenticated;
GRANT SELECT ON public.v_flow_engine_health TO service_role;