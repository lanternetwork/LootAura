-- PostgREST uses the anon role for /api/share (createSupabaseServerClient + anon key).
-- Migration 051 created public.shared_states without explicit GRANTS; anon must be able
-- to INSERT new shortlinks and SELECT for resolution.
GRANT SELECT, INSERT ON TABLE public.shared_states TO anon, authenticated;
