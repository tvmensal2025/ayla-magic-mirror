UPDATE customers
SET status = 'data_complete',
    otp_code = NULL,
    error_message = NULL,
    portal_submitted_at = NULL,
    link_facial = NULL,
    updated_at = now()
WHERE id = '8e859d0b-38b1-46ab-972e-99f8086a12c0';