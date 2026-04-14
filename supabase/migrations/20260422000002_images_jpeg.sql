-- Switch the images bucket from JPEG-XL to JPEG.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg']
WHERE id = 'images';
