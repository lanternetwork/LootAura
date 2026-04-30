BEGIN;

DO $$
DECLARE
  repaired_count integer := 0;
  moved_to_needs_geocode_count integer := 0;
  still_needs_check_count integer := 0;
  remaining_missing_city_config_count integer := 0;
BEGIN
  WITH candidate_rows AS (
    SELECT
      s.id,
      s.failure_reasons,
      s.status,
      s.source_platform,
      s.city,
      s.state
    FROM lootaura_v2.ingested_sales s
    WHERE s.status = 'needs_check'
      AND s.failure_reasons @> '["missing_city_config"]'::jsonb
  ),
  normalized_candidates AS (
    SELECT
      c.id,
      c.failure_reasons,
      c.status,
      c.source_platform,
      lower(trim(regexp_replace(regexp_replace(regexp_replace(coalesce(c.city, ''), '\bst[.]?(?=\s|$)', 'saint', 'gi'), '[^a-zA-Z0-9\s]', ' ', 'g'), '\s+', ' ', 'g'))) AS city_norm,
      CASE
        WHEN length(regexp_replace(lower(trim(coalesce(c.state, ''))), '[^a-z]', '', 'g')) = 2 THEN upper(regexp_replace(lower(trim(coalesce(c.state, ''))), '[^a-z]', '', 'g'))
        WHEN lower(trim(coalesce(c.state, ''))) = 'alabama' THEN 'AL'
        WHEN lower(trim(coalesce(c.state, ''))) = 'alaska' THEN 'AK'
        WHEN lower(trim(coalesce(c.state, ''))) = 'arizona' THEN 'AZ'
        WHEN lower(trim(coalesce(c.state, ''))) = 'arkansas' THEN 'AR'
        WHEN lower(trim(coalesce(c.state, ''))) = 'california' THEN 'CA'
        WHEN lower(trim(coalesce(c.state, ''))) = 'colorado' THEN 'CO'
        WHEN lower(trim(coalesce(c.state, ''))) = 'connecticut' THEN 'CT'
        WHEN lower(trim(coalesce(c.state, ''))) = 'delaware' THEN 'DE'
        WHEN lower(trim(coalesce(c.state, ''))) = 'district of columbia' THEN 'DC'
        WHEN lower(trim(coalesce(c.state, ''))) = 'florida' THEN 'FL'
        WHEN lower(trim(coalesce(c.state, ''))) = 'georgia' THEN 'GA'
        WHEN lower(trim(coalesce(c.state, ''))) = 'hawaii' THEN 'HI'
        WHEN lower(trim(coalesce(c.state, ''))) = 'idaho' THEN 'ID'
        WHEN lower(trim(coalesce(c.state, ''))) = 'illinois' THEN 'IL'
        WHEN lower(trim(coalesce(c.state, ''))) = 'indiana' THEN 'IN'
        WHEN lower(trim(coalesce(c.state, ''))) = 'iowa' THEN 'IA'
        WHEN lower(trim(coalesce(c.state, ''))) = 'kansas' THEN 'KS'
        WHEN lower(trim(coalesce(c.state, ''))) = 'kentucky' THEN 'KY'
        WHEN lower(trim(coalesce(c.state, ''))) = 'louisiana' THEN 'LA'
        WHEN lower(trim(coalesce(c.state, ''))) = 'maine' THEN 'ME'
        WHEN lower(trim(coalesce(c.state, ''))) = 'maryland' THEN 'MD'
        WHEN lower(trim(coalesce(c.state, ''))) = 'massachusetts' THEN 'MA'
        WHEN lower(trim(coalesce(c.state, ''))) = 'michigan' THEN 'MI'
        WHEN lower(trim(coalesce(c.state, ''))) = 'minnesota' THEN 'MN'
        WHEN lower(trim(coalesce(c.state, ''))) = 'mississippi' THEN 'MS'
        WHEN lower(trim(coalesce(c.state, ''))) = 'missouri' THEN 'MO'
        WHEN lower(trim(coalesce(c.state, ''))) = 'montana' THEN 'MT'
        WHEN lower(trim(coalesce(c.state, ''))) = 'nebraska' THEN 'NE'
        WHEN lower(trim(coalesce(c.state, ''))) = 'nevada' THEN 'NV'
        WHEN lower(trim(coalesce(c.state, ''))) = 'new hampshire' THEN 'NH'
        WHEN lower(trim(coalesce(c.state, ''))) = 'new jersey' THEN 'NJ'
        WHEN lower(trim(coalesce(c.state, ''))) = 'new mexico' THEN 'NM'
        WHEN lower(trim(coalesce(c.state, ''))) = 'new york' THEN 'NY'
        WHEN lower(trim(coalesce(c.state, ''))) = 'north carolina' THEN 'NC'
        WHEN lower(trim(coalesce(c.state, ''))) = 'north dakota' THEN 'ND'
        WHEN lower(trim(coalesce(c.state, ''))) = 'ohio' THEN 'OH'
        WHEN lower(trim(coalesce(c.state, ''))) = 'oklahoma' THEN 'OK'
        WHEN lower(trim(coalesce(c.state, ''))) = 'oregon' THEN 'OR'
        WHEN lower(trim(coalesce(c.state, ''))) = 'pennsylvania' THEN 'PA'
        WHEN lower(trim(coalesce(c.state, ''))) = 'rhode island' THEN 'RI'
        WHEN lower(trim(coalesce(c.state, ''))) = 'south carolina' THEN 'SC'
        WHEN lower(trim(coalesce(c.state, ''))) = 'south dakota' THEN 'SD'
        WHEN lower(trim(coalesce(c.state, ''))) = 'tennessee' THEN 'TN'
        WHEN lower(trim(coalesce(c.state, ''))) = 'texas' THEN 'TX'
        WHEN lower(trim(coalesce(c.state, ''))) = 'utah' THEN 'UT'
        WHEN lower(trim(coalesce(c.state, ''))) = 'vermont' THEN 'VT'
        WHEN lower(trim(coalesce(c.state, ''))) = 'virginia' THEN 'VA'
        WHEN lower(trim(coalesce(c.state, ''))) = 'washington' THEN 'WA'
        WHEN lower(trim(coalesce(c.state, ''))) = 'west virginia' THEN 'WV'
        WHEN lower(trim(coalesce(c.state, ''))) = 'wisconsin' THEN 'WI'
        WHEN lower(trim(coalesce(c.state, ''))) = 'wyoming' THEN 'WY'
        ELSE upper(trim(coalesce(c.state, '')))
      END AS state_norm
    FROM candidate_rows c
  ),
  normalized_configs AS (
    SELECT
      cfg.source_platform,
      lower(trim(regexp_replace(regexp_replace(regexp_replace(coalesce(cfg.city, ''), '\bst[.]?(?=\s|$)', 'saint', 'gi'), '[^a-zA-Z0-9\s]', ' ', 'g'), '\s+', ' ', 'g'))) AS city_norm,
      CASE
        WHEN length(regexp_replace(lower(trim(coalesce(cfg.state, ''))), '[^a-z]', '', 'g')) = 2 THEN upper(regexp_replace(lower(trim(coalesce(cfg.state, ''))), '[^a-z]', '', 'g'))
        WHEN lower(trim(coalesce(cfg.state, ''))) = 'illinois' THEN 'IL'
        WHEN lower(trim(coalesce(cfg.state, ''))) = 'indiana' THEN 'IN'
        ELSE upper(trim(coalesce(cfg.state, '')))
      END AS state_norm
    FROM lootaura_v2.ingestion_city_configs cfg
    WHERE cfg.enabled = true
  ),
  rows_to_repair AS (
    SELECT DISTINCT nc.id, nc.failure_reasons
    FROM normalized_candidates nc
    JOIN normalized_configs cfg
      ON cfg.source_platform = nc.source_platform
     AND cfg.city_norm = nc.city_norm
     AND cfg.state_norm = nc.state_norm
  ),
  repaired AS (
    UPDATE lootaura_v2.ingested_sales s
    SET
      failure_reasons = (
        SELECT COALESCE(
          jsonb_agg(reason) FILTER (WHERE reason <> '"missing_city_config"'::jsonb),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(s.failure_reasons) AS reason
      ),
      status = CASE
        WHEN (
          SELECT COALESCE(
            jsonb_agg(reason) FILTER (WHERE reason <> '"missing_city_config"'::jsonb),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(s.failure_reasons) AS reason
        ) = '[]'::jsonb THEN 'needs_geocode'
        ELSE 'needs_check'
      END,
      updated_at = now()
    FROM rows_to_repair r
    WHERE s.id = r.id
    RETURNING s.id, s.status
  )
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE status = 'needs_geocode')::integer,
    COUNT(*) FILTER (WHERE status = 'needs_check')::integer
  INTO repaired_count, moved_to_needs_geocode_count, still_needs_check_count
  FROM repaired;

  SELECT COUNT(*)::integer
  INTO remaining_missing_city_config_count
  FROM lootaura_v2.ingested_sales s
  WHERE s.status = 'needs_check'
    AND s.failure_reasons @> '["missing_city_config"]'::jsonb;

  RAISE NOTICE 'Repair summary: rows_repaired=% moved_to_needs_geocode=% still_needs_check=% remaining_missing_city_config=%',
    repaired_count,
    moved_to_needs_geocode_count,
    still_needs_check_count,
    remaining_missing_city_config_count;
END $$;

COMMIT;
