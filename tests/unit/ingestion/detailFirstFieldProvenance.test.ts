import { describe, expect, it } from 'vitest'
import {
  buildDetailFirstFieldProvenance,
  chosenAddressSourceForDetailFirst,
  dateSourceForDetailFirst,
  mergeIngestionDiagnosticsForDetailFirst,
} from '@/lib/ingestion/acquisition/detailFirstFieldProvenance'
import type { YstmDetailPageParsed } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'

const LIST_SEED = {
  title: 'List title',
  description: 'List description',
  addressRaw: 'bad slug address',
  city: 'Chicago',
  state: 'IL',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  sourceUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago/x/1/userlisting.html',
  imageSourceUrl: null,
  rawPayload: {
    ingestionDiagnostics: {
      chosenAddressSource: 'slug',
      slugWasPlaceholder: false,
    },
  },
}

function detailPage(overrides: Partial<YstmDetailPageParsed> = {}): YstmDetailPageParsed {
  return {
    title: 'Detail title',
    description: 'Detail description',
    addressRaw: '4443 S St Louis Ave, Chicago, IL',
    startDate: '2026-05-23',
    endDate: '2026-05-24',
    city: 'Chicago',
    state: 'IL',
    imageUrls: [],
    nativeCoords: null,
    cityConflict: false,
    addressSource: 'detail_dom',
    ...overrides,
  }
}

describe('detailFirstFieldProvenance', () => {
  it('prefers detail page fields over list seed', () => {
    const provenance = buildDetailFirstFieldProvenance(detailPage(), LIST_SEED)
    expect(provenance).toEqual({
      title: 'detail_page',
      description: 'detail_page',
      addressRaw: 'detail_page',
      city: 'detail_page',
      state: 'detail_page',
      startDate: 'detail_page',
      endDate: 'detail_page',
    })
  })

  it('falls back to list seed when detail omits a field', () => {
    const provenance = buildDetailFirstFieldProvenance(
      detailPage({ startDate: undefined, endDate: undefined, addressRaw: null }),
      LIST_SEED
    )
    expect(provenance.addressRaw).toBe('list_seed')
    expect(provenance.startDate).toBe('list_seed')
    expect(provenance.endDate).toBe('list_seed')
  })

  it('uses ystm_detail_page chosenAddressSource when detail supplies address', () => {
    const provenance = buildDetailFirstFieldProvenance(detailPage(), LIST_SEED)
    expect(chosenAddressSourceForDetailFirst(provenance, { chosenAddressSource: 'slug' }, detailPage())).toBe(
      'ystm_detail_dom'
    )
  })

  it('records detail vs seed diagnostics on the enriched listing', () => {
    const provenance = buildDetailFirstFieldProvenance(detailPage(), LIST_SEED)
    const validatedListing = { ...LIST_SEED, addressRaw: detailPage().addressRaw }
    const page = detailPage()
    const diagnostics = mergeIngestionDiagnosticsForDetailFirst(
      LIST_SEED,
      provenance,
      validatedListing,
      page
    )
    expect(diagnostics.chosenAddressSource).toBe('ystm_detail_dom')
    expect(diagnostics.detailFirstAddressSource).toBe('detail_dom')
    expect(diagnostics.listSeedAddressRaw).toBe('bad slug address')
    expect(diagnostics.validatedAddressRaw).toContain('4443 S St Louis Ave')
    expect(diagnostics.detailFirstValidated).toBe(true)
  })

  it('sets date_source from detail vs list seed provenance', () => {
    expect(
      dateSourceForDetailFirst(
        buildDetailFirstFieldProvenance(detailPage(), LIST_SEED)
      )
    ).toBe('ystm_detail_page')
    expect(
      dateSourceForDetailFirst(
        buildDetailFirstFieldProvenance(
          detailPage({ startDate: undefined, endDate: undefined }),
          LIST_SEED
        )
      )
    ).toBe('external_list_page')
  })
})
