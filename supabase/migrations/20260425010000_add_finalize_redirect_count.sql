-- Add finalize_redirect_count column to customers table
-- Used by anti-loop logic to prevent infinite redirect loops in finalizando step
ALTER TABLE customers ADD COLUMN IF NOT EXISTS finalize_redirect_count integer DEFAULT 0;
