-- Create read-only view for analytics_events in public schema
-- This allows RLS-protected reads via the public schema

CREATE OR REPLACE VIEW public.analytics_events_v2 AS
  SELECT id, sale_id, owner_id, user_id, event_type, ts, referrer, user_agent, is_test
  FROM lootaura_v2.analytics_events;

-- Grant select on view to authenticated users (RLS policies on base table will apply)
GRANT SELECT ON public.analytics_events_v2 TO authenticated;

