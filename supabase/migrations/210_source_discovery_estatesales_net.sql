-- Provider-scoped nationwide discovery cursor for EstateSales.NET (separate from YSTM).

INSERT INTO lootaura_v2.ingestion_discovery_state (key, state_cursor)
VALUES ('source_discovery_estatesales_net', 0)
ON CONFLICT (key) DO NOTHING;
