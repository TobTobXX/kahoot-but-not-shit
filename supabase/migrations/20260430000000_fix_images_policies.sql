-- Fix two gaps in the images storage policies:
--   1. INSERT had no path restriction — pro users could upload to other users' folders.
--   2. No DELETE policy — uploaded images accumulated permanently with no way to remove them.

-- Restrict INSERT to own folder only.
DROP POLICY IF EXISTS "Pro users can upload images" ON storage.objects;
CREATE POLICY "Pro users can upload images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'images' AND
    (storage.foldername(name))[1] = auth.uid()::text AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_pro = true
    )
  );

-- Allow pro users to delete their own images.
CREATE POLICY "Pro users can delete own images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'images' AND
    (storage.foldername(name))[1] = auth.uid()::text AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_pro = true
    )
  );
