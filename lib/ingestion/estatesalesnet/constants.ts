/** EstateSales.NET provider adapter constants. */

export const ESNET_SOURCE_PLATFORM = 'estatesales_net' as const

export const ESNET_PARSER_VERSION_LIST = 'estatesales_net_list_v1' as const

export const ESNET_PARSER_VERSION_DETAIL = 'estatesales_net_detail_v1' as const

export function parserVersionForEsnetPlatform(
  sourcePlatform: string,
  options?: { detailEnriched?: boolean }
): string {
  if (sourcePlatform !== ESNET_SOURCE_PLATFORM) return 'external_page_source_mvp_v3'
  return options?.detailEnriched ? ESNET_PARSER_VERSION_DETAIL : ESNET_PARSER_VERSION_LIST
}
