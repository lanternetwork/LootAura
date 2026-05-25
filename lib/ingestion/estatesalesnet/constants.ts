/** EstateSales.NET provider adapter constants. */

export const ESNET_SOURCE_PLATFORM = 'estatesales_net' as const

export const ESNET_PARSER_VERSION_LIST = 'estatesales_net_list_v1' as const

export const ESNET_PARSER_VERSION_DETAIL = 'estatesales_net_detail_v1' as const

export const ESNET_INGEST_ENABLED_ENV = 'ESNET_INGEST_ENABLED'

/** When false, list persist for `estatesales_net` configs is a no-op (safe default). */
export function isEsnetIngestEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[ESNET_INGEST_ENABLED_ENV]
  if (raw === undefined || raw === '') return false
  return raw === '1' || /^true$/i.test(raw.trim())
}

export function parserVersionForEsnetPlatform(sourcePlatform: string): string {
  return sourcePlatform === ESNET_SOURCE_PLATFORM
    ? ESNET_PARSER_VERSION_LIST
    : 'external_page_source_mvp_v3'
}
