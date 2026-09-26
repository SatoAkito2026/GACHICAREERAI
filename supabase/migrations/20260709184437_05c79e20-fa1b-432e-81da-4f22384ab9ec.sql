DROP POLICY IF EXISTS "job-thumbnails: owner can read own files" ON storage.objects;

CREATE POLICY "job-thumbnails: anyone can read files"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'job-thumbnails');