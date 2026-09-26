-- Add ownership-scoped RLS policies to storage.objects for the private job-thumbnails bucket.
-- Files are stored under a top-level folder named after the uploader's user id (auth.uid()).

CREATE POLICY "job-thumbnails: owner can read own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'job-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "job-thumbnails: owner can insert own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "job-thumbnails: owner can update own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'job-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'job-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "job-thumbnails: owner can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
);