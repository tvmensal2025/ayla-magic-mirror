
CREATE POLICY "Public read video igreen"
ON storage.objects
FOR SELECT
USING (bucket_id = 'video igreen');

CREATE POLICY "Public delete video igreen"
ON storage.objects
FOR DELETE
USING (bucket_id = 'video igreen');
