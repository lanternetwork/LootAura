-- Published sale quality audit (READ-ONLY)
-- Run in Supabase SQL editor or psql against the correct schema (lootaura_v2 vs public).
-- Do not run UPDATE sections unless you have reviewed impact; this file is SELECT-only.

-- 1) Placeholder / weak addresses on linked ingested sales
SELECT id,
       ingested_sale_id,
       address,
       city,
       state,
       cover_image_url,
       created_at
FROM lootaura_v2.sales
WHERE ingested_sale_id IS NOT NULL
  AND (
    address ILIKE '%unknown%address%'
    OR address ILIKE '%address%unknown%'
    OR address ILIKE '%pending%address%'
    OR address ILIKE '%n/a%'
    OR address ~* '(^|, )[[:space:]]*none[[:space:]]*(,|$)'
  )
ORDER BY created_at DESC
LIMIT 500;

-- 2) Likely all-lowercase street (heuristic: no uppercase letter in address line)
SELECT id,
       ingested_sale_id,
       address,
       city,
       state
FROM lootaura_v2.sales
WHERE ingested_sale_id IS NOT NULL
  AND address IS NOT NULL
  AND address !~ '[A-Z]'
  AND length(trim(address)) > 5
ORDER BY updated_at DESC NULLS LAST
LIMIT 500;

-- 3) Cover / gallery URLs with YSTM or obvious branding tokens (pattern tune as needed)
SELECT id,
       ingested_sale_id,
       cover_image_url,
       images
FROM lootaura_v2.sales
WHERE ingested_sale_id IS NOT NULL
  AND (
    cover_image_url ILIKE '%ystm%'
    OR cover_image_url ILIKE '%yardsale%time%machine%'
    OR cover_image_url ILIKE '%/logo%'
    OR cover_image_url ILIKE '%site-logo%'
    OR images::text ILIKE '%ystm%'
    OR images::text ILIKE '%yardsale%time%machine%'
  )
ORDER BY updated_at DESC NULLS LAST
LIMIT 500;

-- 4) Ingested row status snapshot (reconcile with “not visible” counts)
SELECT status, COUNT(*) AS n
FROM lootaura_v2.ingested_sales
GROUP BY status
ORDER BY n DESC;

-- 5) Optional: remediation UPDATE templates (DO NOT RUN blindly)
-- UPDATE lootaura_v2.sales SET address = ... WHERE id = '...';
-- Prefer fixing source ingested row + republish workflow over ad-hoc SQL.
