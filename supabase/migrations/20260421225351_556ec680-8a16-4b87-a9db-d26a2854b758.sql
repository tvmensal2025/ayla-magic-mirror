UPDATE public.customers
SET status = 'data_complete',
    otp_code = NULL,
    otp_received_at = NULL,
    error_message = NULL,
    updated_at = now()
WHERE id = '24712654-5b2d-40fe-a7d0-fe71cfec7cfe';