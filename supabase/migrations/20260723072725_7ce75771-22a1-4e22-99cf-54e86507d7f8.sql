CREATE POLICY "document-templates owner can select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'document-templates' AND owner = auth.uid());

CREATE POLICY "document-templates owner can insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'document-templates' AND owner = auth.uid());

CREATE POLICY "document-templates owner can update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'document-templates' AND owner = auth.uid())
WITH CHECK (bucket_id = 'document-templates' AND owner = auth.uid());

CREATE POLICY "document-templates owner can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'document-templates' AND owner = auth.uid());