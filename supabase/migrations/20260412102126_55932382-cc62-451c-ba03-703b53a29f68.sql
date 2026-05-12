
-- Allow anyone to upload to 'video igreen' bucket (public bucket)
CREATE POLICY "Allow public upload to video igreen"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'video igreen');

-- Allow anyone to update objects in 'video igreen' bucket
CREATE POLICY "Allow public update to video igreen"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'video igreen');
