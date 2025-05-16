-- Drop the trigger first since it depends on the function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function that handles user creation
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Drop the policies (they'll be dropped with the table, but it's good to be explicit)
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Finally drop the profiles table
DROP TABLE IF EXISTS profiles;
