-- Ensure items_v2 view has images column
-- PostgREST schema cache might be stale or view was created without images column

-- Drop and recreate view to ensure images column is present
DROP VIEW IF EXISTS public.items_v2 CASCADE;

CREATE VIEW public.items_v2 AS
SELECT 
    id,
    created_at,
    sale_id,
    name,
    description,
    price,
    category,
    condition,
    images,
    is_sold,
    updated_at
FROM lootaura_v2.items;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;

-- Recreate the triggers (they were dropped with CASCADE)
CREATE TRIGGER items_v2_insert_trigger
    INSTEAD OF INSERT ON public.items_v2
    FOR EACH ROW
    EXECUTE FUNCTION public.items_v2_insert();

CREATE TRIGGER items_v2_update_trigger
    INSTEAD OF UPDATE ON public.items_v2
    FOR EACH ROW
    EXECUTE FUNCTION public.items_v2_update();

CREATE TRIGGER items_v2_delete_trigger
    INSTEAD OF DELETE ON public.items_v2
    FOR EACH ROW
    EXECUTE FUNCTION public.items_v2_delete();

