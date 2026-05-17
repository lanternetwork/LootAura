-- Phase C: per-lane ingestion orchestration state rows (cursor + lease per lane).

INSERT INTO lootaura_v2.ingestion_orchestration_state (key, cursor)
VALUES
  ('external_page_source:global', 0),
  ('external_page_source:region:northeast', 0),
  ('external_page_source:region:southeast', 0),
  ('external_page_source:region:midwest', 0),
  ('external_page_source:region:southwest', 0),
  ('external_page_source:region:west', 0),
  ('ingestion_lane_rotation', 0)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE lootaura_v2.ingestion_orchestration_state IS
  'Per-key ingestion orchestration lease + resumable cursor (global, regional lanes, rotation index).';
