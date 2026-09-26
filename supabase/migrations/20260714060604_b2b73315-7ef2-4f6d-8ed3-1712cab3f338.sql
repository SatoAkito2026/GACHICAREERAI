DROP POLICY IF EXISTS "Interview owners can read recordings" ON storage.objects;
CREATE POLICY "Interview owners can read recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'interview-recordings'
  AND EXISTS (
    SELECT 1 FROM public.interviews i
    WHERE i.id::text = split_part(storage.objects.name, '/', 1)
      AND i.user_id = auth.uid()
  )
);