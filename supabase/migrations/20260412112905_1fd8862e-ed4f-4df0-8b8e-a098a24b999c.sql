
CREATE POLICY "Allow public upload to video igreen"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'video igreen');

CREATE POLICY "Allow public update to video igreen"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'video igreen');
