update public.customers
set ocr_review_pending = null,
    ocr_review_decided_at = coalesce(ocr_review_decided_at, bill_data_confirmed_at, doc_data_confirmed_at, now()),
    ocr_review_decided_by = coalesce(ocr_review_decided_by, 'consultant'),
    updated_at = now()
where ocr_review_pending is not null
  and (
    (ocr_review_pending = 'bill' and bill_data_confirmed_at is not null) or
    (ocr_review_pending = 'doc'  and doc_data_confirmed_at  is not null)
  );