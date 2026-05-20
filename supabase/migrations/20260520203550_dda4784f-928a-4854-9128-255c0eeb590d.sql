UPDATE public.facebook_campaigns
SET rejection_reason = 'SESSION_INVALIDATED: O token do Facebook foi invalidado (senha alterada ou sessão encerrada por segurança). Reconecte a conta Facebook no painel.'
WHERE rejection_reason ILIKE '%session has been invalidated%'
   OR rejection_reason ILIKE '%code=190%'
   OR rejection_reason ILIKE '%subcode=460%'
   OR rejection_reason ILIKE '%session for security reasons%';