-- Add INSTEAD OF triggers to sale_drafts view to enable INSERT, UPDATE, DELETE operations
-- PostgreSQL views are read-only by default and need INSTEAD OF triggers for writes
-- This is required because PostgREST can only access the 'public' schema, not 'lootaura_v2'
-- These triggers route writes from public.sale_drafts to lootaura_v2.sale_drafts

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS sale_drafts_insert_trigger ON public.sale_drafts;
DROP TRIGGER IF EXISTS sale_drafts_update_trigger ON public.sale_drafts;
DROP TRIGGER IF EXISTS sale_drafts_delete_trigger ON public.sale_drafts;

-- Create INSTEAD OF INSERT trigger function
CREATE OR REPLACE FUNCTION public.sale_drafts_insert()
RETURNS TRIGGER AS $$
DECLARE
    inserted_id UUID;
BEGIN
    INSERT INTO lootaura_v2.sale_drafts (
        user_id,
        draft_key,
        title,
        payload,
        status,
        expires_at
    ) VALUES (
        NEW.user_id,
        NEW.draft_key,
        NEW.title,
        NEW.payload,
        COALESCE(NEW.status, 'active'),
        COALESCE(NEW.expires_at, NOW() + INTERVAL '30 days')
    )
    RETURNING id INTO inserted_id;
    
    -- Populate NEW with the inserted row data for RETURNING clause
    SELECT * INTO NEW FROM lootaura_v2.sale_drafts WHERE id = inserted_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sale_drafts_insert_trigger
    INSTEAD OF INSERT ON public.sale_drafts
    FOR EACH ROW
    EXECUTE FUNCTION public.sale_drafts_insert();

-- Create INSTEAD OF UPDATE trigger function
CREATE OR REPLACE FUNCTION public.sale_drafts_update()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE lootaura_v2.sale_drafts SET
        title = NEW.title,
        payload = NEW.payload,
        status = NEW.status,
        expires_at = NEW.expires_at,
        updated_at = NOW()
    WHERE id = OLD.id
    RETURNING * INTO NEW;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sale_drafts_update_trigger
    INSTEAD OF UPDATE ON public.sale_drafts
    FOR EACH ROW
    EXECUTE FUNCTION public.sale_drafts_update();

-- Create INSTEAD OF DELETE trigger function
CREATE OR REPLACE FUNCTION public.sale_drafts_delete()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM lootaura_v2.sale_drafts WHERE id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sale_drafts_delete_trigger
    INSTEAD OF DELETE ON public.sale_drafts
    FOR EACH ROW
    EXECUTE FUNCTION public.sale_drafts_delete();

-- Add comments for documentation
COMMENT ON FUNCTION public.sale_drafts_insert() IS 'INSTEAD OF trigger for INSERT on sale_drafts view - routes writes to lootaura_v2.sale_drafts';
COMMENT ON FUNCTION public.sale_drafts_update() IS 'INSTEAD OF trigger for UPDATE on sale_drafts view';
COMMENT ON FUNCTION public.sale_drafts_delete() IS 'INSTEAD OF trigger for DELETE on sale_drafts view';

