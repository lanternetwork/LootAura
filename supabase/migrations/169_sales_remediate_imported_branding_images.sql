-- =============================================================================
-- One-time remediation: remove persisted platform branding / non-sale image URLs
-- from imported lootaura_v2.sales rows (cover_image_url + images[]).
--
-- Scope: rows with ingested_sale_id IS NOT NULL OR non-empty import_source only
-- (does not touch user-authored sales with no import provenance).
--
-- Logic MUST stay aligned with:
--   - lib/ingestion/nonSaleImageHeuristics.ts (urlSuggestsNonListingPhoto + filterBrandingFromSaleMediaUrls)
--
-- Idempotent: rerunning leaves rows unchanged once no branding URLs remain.
-- =============================================================================

CREATE OR REPLACE FUNCTION lootaura_v2.url_matches_ingest_branding_asset(p_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  u text;
  low text;
  host_part text;
  path_only text;
  tail text;
  psh text;
  base text;
  m text[];
  w int;
  h int;
  ratio numeric;
BEGIN
  IF p_url IS NULL THEN
    RETURN false;
  END IF;
  u := trim(both from p_url);
  IF u = '' OR u !~* '^https://' THEN
    RETURN false;
  END IF;

  low := lower(u);
  host_part := (regexp_match(low, '^https://([^/?#]+)'))[1];
  IF host_part IS NULL THEN
    RETURN false;
  END IF;

  path_only := lower(coalesce(substring(u from '^https://[^/]+(/[^?#]*)'), ''));
  tail := lower(coalesce(substring(u from '([?#].*)$'), ''));
  psh := path_only || tail;
  base := lower(regexp_replace(regexp_replace(path_only, '.*/', ''), '[?#].*$', ''));

  IF host_part ~ '^(www\.)?yardsaletreasuremap\.(com|net|org)$'
     AND path_only ~ '/pics/'
     AND (
       base ~ '(logo|site_logo|ystm_site|(^|[^[:alnum:]_])ystm([^[:alnum:]_]|$)|favicon|sprite|placeholder|treasuremap|app[-_]store|googleplay|opengraph|^og[-_])'
       OR base ~ 'header[-_]|[-_]header|[-_]nav[-_]|^nav[-_]'
     ) THEN
    RETURN true;
  END IF;

  IF host_part ~ '^(www\.)?yardsaletreasuremap\.(com|net|org)$'
     AND path_only ~ '^/(assets|static|img|images|media)/'
     AND psh ~ '(^|[/_-])(logo|logos|brand|banner|hero|site[-_]logo|ystm)([/_-]|\.|$)' THEN
    RETURN true;
  END IF;

  IF low ~ 'ystm_site_logo|ystm[-_]?site[-_]?logo|yard[-_]?sale[-_]?treasure[-_]?map[-_]?(logo|badge|icon|banner)' THEN
    RETURN true;
  END IF;

  IF psh ~ 'header[_-]|[-_]header|/header(/|$)|/nav(/|$)|navbar|(^|[^[:alnum:]_])banner([^[:alnum:]_]|$)'
     OR psh ~ '(^|[^[:alnum:]_])avatar([^[:alnum:]_]|$)'
     OR psh ~ '(^|[^[:alnum:]_])ystm([^[:alnum:]_]|$)'
     OR psh ~ 'yardsale[_-]?time[_-]?machine'
     OR psh ~ 'ystm[-_]?(site|logo|banner|brand|header|hero)(^|[^[:alnum:]_]|$)'
     OR psh ~ '(site[-_]logo|site[-_]header|provider[-_]logo|white[-_]label)'
     OR psh ~ '(^|[/_-])(logo|logos)([/_-]|\.|$)'
     OR psh ~ '(^|[^[:alnum:]_])logo([^[:alnum:]_]|$)'
     OR psh ~ '(branding|brand-asset|brand_asset)'
     OR psh ~ '(^|[/_-])sprites?([/_-]|\.|$)'
     OR psh ~ '(favicon|apple-touch-icon|touch-icon|site-icon|mstile)'
     OR psh ~ '(navbar|nav-icon|nav_icon|header-bg|footer-bg|footer_bg)'
     OR psh ~ '(hero-banner|hero_banner|banner-ad|banner_ad|ad-banner)'
     OR psh ~ '(sponsored|sponsor[-_]|affiliate|tracking-pixel|tracking_pixel)'
     OR psh ~ '(watermark|placeholder|spacer|shim)'
     OR psh ~ '(app-store|googleplay|play[-_]?store)' THEN
    RETURN true;
  END IF;

  IF psh ~ '(^|[^[:alnum:]_])(pixel|blank|clear|transparent)([-_]?1x1)?([^[:alnum:]_]|$)'
     OR psh ~ '(^|[^[:alnum:]_])1x1([^[:alnum:]_]|$)' THEN
    RETURN true;
  END IF;

  m := regexp_match(
    path_only,
    '[_/-]([0-9]{2,4})x([0-9]{2,4})[^/]*\.(png|jpe?g|webp|gif)$',
    'i'
  );
  IF m IS NOT NULL THEN
    w := (m[1])::int;
    h := (m[2])::int;
    IF w > 0 AND h > 0 THEN
      IF (w * h) < 2800 THEN
        RETURN true;
      END IF;
      ratio := (w::numeric / h::numeric);
      IF ratio >= 3.8 AND h <= 120 THEN
        RETURN true;
      END IF;
      IF ratio <= 0.28 AND w <= 120 THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  IF path_only ~ '\.svg($|[?#])'
     AND psh ~ '(logo|icon|sprite|favicon|brand|(^|[^[:alnum:]_])ystm([^[:alnum:]_]|$))' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$fn$;

COMMENT ON FUNCTION lootaura_v2.url_matches_ingest_branding_asset(text) IS
  'True when URL matches ingest-time branding/non-sale heuristics (see nonSaleImageHeuristics.ts).';

CREATE OR REPLACE FUNCTION lootaura_v2.filter_branding_urls_from_sale_media(p_cover text, p_images text[])
RETURNS TABLE(new_cover text, new_images text[])
LANGUAGE sql
IMMUTABLE
AS $f2$
  WITH merged AS (
    SELECT trim(both from p_cover) AS x, 0::bigint AS ord
    WHERE p_cover IS NOT NULL AND trim(both from p_cover) <> ''
    UNION ALL
    SELECT trim(both from u.x) AS x, u.ord::bigint
    FROM unnest(coalesce(p_images, '{}'::text[])) WITH ORDINALITY AS u(x, ord)
    WHERE trim(both from u.x) <> ''
  ),
  ordered AS (
    SELECT x, min(ord) AS ord
    FROM merged
    GROUP BY x
  ),
  kept AS (
    SELECT o.x, o.ord
    FROM ordered o
    WHERE NOT lootaura_v2.url_matches_ingest_branding_asset(o.x)
  ),
  arr AS (
    SELECT coalesce(array_agg(x ORDER BY ord), '{}'::text[]) AS imgs
    FROM kept
  )
  SELECT
    (CASE WHEN cardinality(a.imgs) > 0 THEN a.imgs[1] ELSE NULL END) AS new_cover,
    a.imgs AS new_images
  FROM arr a;
$f2$;

COMMENT ON FUNCTION lootaura_v2.filter_branding_urls_from_sale_media(text, text[]) IS
  'Dedupe cover+images (cover first), drop branding URLs, return new cover (first kept) and images[]; see filterBrandingFromSaleMediaUrls in TS.';

DO $blk$
DECLARE
  n_before int;
  n_after int;
BEGIN
  SELECT count(*)::int
  INTO n_before
  FROM lootaura_v2.sales s
  WHERE (
      s.ingested_sale_id IS NOT NULL
      OR (s.import_source IS NOT NULL AND btrim(s.import_source) <> '')
    )
    AND (
      lootaura_v2.url_matches_ingest_branding_asset(s.cover_image_url)
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(s.images, '{}'::text[])) u(x)
        WHERE lootaura_v2.url_matches_ingest_branding_asset(x)
      )
    );

  RAISE NOTICE 'migration_169_branding_media_remediation: candidate_imported_sales=%', n_before;

  -- UPDATE target alias "s" must not appear in this statement's FROM (not even inside
  -- LATERAL); use a derived table on sales as s_inner, then join back on id.
  UPDATE lootaura_v2.sales s
  SET
    cover_image_url = v.new_cover,
    images = v.new_images,
    updated_at = now()
  FROM (
    SELECT
      s_inner.id,
      f.new_cover,
      f.new_images
    FROM lootaura_v2.sales s_inner
    INNER JOIN LATERAL lootaura_v2.filter_branding_urls_from_sale_media(
      s_inner.cover_image_url,
      s_inner.images
    ) AS f ON true
    WHERE (
        s_inner.ingested_sale_id IS NOT NULL
        OR (s_inner.import_source IS NOT NULL AND btrim(s_inner.import_source) <> '')
      )
      AND (
        lootaura_v2.url_matches_ingest_branding_asset(s_inner.cover_image_url)
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(s_inner.images, '{}'::text[])) u(x)
          WHERE lootaura_v2.url_matches_ingest_branding_asset(x)
        )
      )
      AND (
        s_inner.cover_image_url IS DISTINCT FROM f.new_cover
        OR s_inner.images IS DISTINCT FROM f.new_images
      )
  ) v
  WHERE s.id = v.id;

  GET DIAGNOSTICS n_after = ROW_COUNT;
  RAISE NOTICE 'migration_169_branding_media_remediation: rows_updated=%', n_after;
END;
$blk$;

REVOKE ALL ON FUNCTION lootaura_v2.url_matches_ingest_branding_asset(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lootaura_v2.filter_branding_urls_from_sale_media(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lootaura_v2.url_matches_ingest_branding_asset(text) TO service_role;
GRANT EXECUTE ON FUNCTION lootaura_v2.filter_branding_urls_from_sale_media(text, text[]) TO service_role;

-- Post-run verification (read-only): scripts/remediation/verify_imported_sales_branding_media.sql
