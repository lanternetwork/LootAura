-- Create RPC function for inserting ZIP codes directly into lootaura_v2.zipcodes
-- This function accepts a JSON array and inserts/updates ZIP codes
-- Used by the admin ZIP import API route

CREATE OR REPLACE FUNCTION public.upsert_zipcodes(
    zipcodes_json JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, lootaura_v2
AS $$
DECLARE
    inserted_count INTEGER := 0;
    updated_count INTEGER := 0;
    error_count INTEGER := 0;
    result JSONB;
BEGIN
    -- Insert/update ZIP codes from JSON array
    INSERT INTO lootaura_v2.zipcodes (zip_code, city, state, lat, lng)
    SELECT 
        (zip->>'zip_code')::TEXT as zip_code,
        NULLIF(zip->>'city', 'null')::TEXT as city,
        NULLIF(zip->>'state', 'null')::TEXT as state,
        NULLIF((zip->>'lat')::TEXT, 'null')::NUMERIC(10, 8) as lat,
        NULLIF((zip->>'lng')::TEXT, 'null')::NUMERIC(11, 8) as lng
    FROM jsonb_array_elements(zipcodes_json) as zip
    WHERE zip->>'zip_code' IS NOT NULL 
      AND zip->>'zip_code' != ''
      AND zip->>'lat' IS NOT NULL 
      AND zip->>'lng' IS NOT NULL
    ON CONFLICT (zip_code) 
    DO UPDATE SET
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        updated_at = NOW();
    
    -- Count inserted (new) and updated (existing) rows
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    
    -- Return result summary
    result := jsonb_build_object(
        'success', true,
        'processed', jsonb_array_length(zipcodes_json),
        'inserted', inserted_count
    );
    
    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        -- Return error information
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'processed', 0
        );
END;
$$;

-- Grant execute permission to authenticated users (for admin routes)
GRANT EXECUTE ON FUNCTION public.upsert_zipcodes(JSONB) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION public.upsert_zipcodes IS 'Inserts or updates ZIP codes from JSON array into lootaura_v2.zipcodes table. Accepts JSONB array with objects containing zip_code, city, state, lat, lng.';

