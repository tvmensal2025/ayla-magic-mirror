-- Recursive team helper: leader + all descendants via referred_by
CREATE OR REPLACE FUNCTION public.get_team_consultant_ids(_leader uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE team AS (
    SELECT id FROM public.consultants WHERE id = _leader
    UNION
    SELECT c.id
      FROM public.consultants c
      JOIN team t ON c.referred_by = t.id
  )
  SELECT array_agg(id) FROM team;
$$;

-- Check membership without leaking the array on every row
CREATE OR REPLACE FUNCTION public.is_team_member(_leader uuid, _member uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _member = ANY(public.get_team_consultant_ids(_leader));
$$;

-- Leader can SELECT customers of the whole downline
DROP POLICY IF EXISTS "Leader reads team customers" ON public.customers;
CREATE POLICY "Leader reads team customers"
ON public.customers
FOR SELECT
TO authenticated
USING (public.is_team_member(auth.uid(), consultant_id));