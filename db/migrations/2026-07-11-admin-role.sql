-- Admin role flag: lets the admin panel authenticate with a normal site
-- account (Supabase session) instead of the shared ADMIN_TOKEN. Admin API
-- endpoints accept either. Users can read their own flag via the existing
-- profiles RLS policy but have no write grants, so it cannot be self-set.
--
-- Grant an account admin (run manually per account):
--   update public.profiles set is_admin = true where email = '<email>';

alter table public.profiles add column if not exists is_admin boolean not null default false;
