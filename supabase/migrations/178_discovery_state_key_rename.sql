-- Rename legacy discovery state key (ystm_nationwide) to source_discovery_nationwide.
-- Idempotent: safe to re-run; no dependency on old key after apply.

DO $migrate$
DECLARE
  v_old_key constant text := 'ystm_nationwide';
  v_new_key constant text := 'source_discovery_nationwide';
  v_has_old boolean;
  v_has_new boolean;
  r_old lootaura_v2.ingestion_discovery_state%ROWTYPE;
  r_new lootaura_v2.ingestion_discovery_state%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM lootaura_v2.ingestion_discovery_state WHERE key = v_old_key
  ) INTO v_has_old;

  SELECT EXISTS (
    SELECT 1 FROM lootaura_v2.ingestion_discovery_state WHERE key = v_new_key
  ) INTO v_has_new;

  IF v_has_old AND NOT v_has_new THEN
    UPDATE lootaura_v2.ingestion_discovery_state
    SET key = v_new_key,
        updated_at = v_now
    WHERE key = v_old_key;
  ELSIF v_has_old AND v_has_new THEN
    SELECT * INTO r_old FROM lootaura_v2.ingestion_discovery_state WHERE key = v_old_key;
    SELECT * INTO r_new FROM lootaura_v2.ingestion_discovery_state WHERE key = v_new_key;

    UPDATE lootaura_v2.ingestion_discovery_state
    SET
      state_cursor = GREATEST(r_old.state_cursor, r_new.state_cursor),
      lease_owner = CASE
        WHEN r_new.lease_expires_at IS NOT NULL AND r_new.lease_expires_at > v_now THEN r_new.lease_owner
        WHEN r_old.lease_expires_at IS NOT NULL AND r_old.lease_expires_at > v_now THEN r_old.lease_owner
        ELSE NULL
      END,
      lease_expires_at = CASE
        WHEN r_new.lease_expires_at IS NOT NULL AND r_new.lease_expires_at > v_now THEN r_new.lease_expires_at
        WHEN r_old.lease_expires_at IS NOT NULL AND r_old.lease_expires_at > v_now THEN r_old.lease_expires_at
        ELSE NULL
      END,
      last_started_at = CASE
        WHEN r_old.last_started_at IS NULL THEN r_new.last_started_at
        WHEN r_new.last_started_at IS NULL THEN r_old.last_started_at
        ELSE GREATEST(r_old.last_started_at, r_new.last_started_at)
      END,
      last_completed_at = CASE
        WHEN r_old.last_completed_at IS NULL THEN r_new.last_completed_at
        WHEN r_new.last_completed_at IS NULL THEN r_old.last_completed_at
        ELSE GREATEST(r_old.last_completed_at, r_new.last_completed_at)
      END,
      updated_at = GREATEST(r_old.updated_at, r_new.updated_at, v_now)
    WHERE key = v_new_key;

    DELETE FROM lootaura_v2.ingestion_discovery_state WHERE key = v_old_key;
  ELSIF NOT v_has_old AND NOT v_has_new THEN
    INSERT INTO lootaura_v2.ingestion_discovery_state (key, state_cursor)
    VALUES (v_new_key, 0)
    ON CONFLICT (key) DO NOTHING;
  END IF;
END;
$migrate$;

COMMENT ON TABLE lootaura_v2.ingestion_discovery_state IS
  'Singleton lease + resumable state cursor for nationwide external source discovery cron (key: source_discovery_nationwide).';
