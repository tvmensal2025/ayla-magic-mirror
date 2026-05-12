
-- Drop the policies that didn't work
DROP POLICY IF EXISTS "Allow public upload to video igreen" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to video igreen" ON storage.objects;

-- Recreate with TO clause for anon and authenticated
CREATE POLICY "Allow anon upload video igreen"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'video igreen');

CREATE POLICY "Allow anon update video igreen"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'video igreen');
