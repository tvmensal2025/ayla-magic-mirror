INSERT INTO public.user_roles (user_id, role)
VALUES ('0063ce99-2be3-44c2-ac63-9caa2407333f', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;