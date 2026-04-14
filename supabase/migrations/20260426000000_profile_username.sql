-- Add username to profiles (nullable until users have set one)
ALTER TABLE profiles ADD COLUMN username text;