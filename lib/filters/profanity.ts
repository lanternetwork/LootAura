// Profanity/unsavory filter: case-insensitive and punctuation-intolerant.
// Strategy: normalize input and check against a deny set (tokens and compact substrings).

const UNSAVORY_LIST = [
  'fuck','shit','bitch','ass','asshole','bastard','dick','pussy','cunt','bollocks','bugger',
  'damn','crap','prick','twat','wank','wanker','motherfucker','mf','fucker','douche','douchebag',
  'slut','whore','skank','jackass','arse','arsehole','bloody','git','tosser','nob','knob',
  'dildo','jerkoff','cum','cumshot','cums','jizz','spunk','blowjob','handjob','rimjob','buttfuck',
  'buttsex','buttplug','tit','tits','titty','boobs','boob','nipple','nips','porn','porno',
  'sperm','semen','fag','faggot','dyke','tranny','retard','retarded'
] as const

const UNSAVORY_SET = new Set<string>(UNSAVORY_LIST)

function normalizeTokenized(input: string): string {
  return input.toLowerCase().replace(/[^a-z]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function normalizeCompact(input: string): string {
  return input.toLowerCase().replace(/[^a-z]+/g, '')
}

export function containsUnsavory(text: string | undefined | null): { ok: boolean; match?: string } {
  if (!text) return { ok: true }

  const tokenized = normalizeTokenized(text)
  const compact = normalizeCompact(text)

  if (tokenized.length > 0) {
    for (const token of tokenized.split(' ')) {
      if (UNSAVORY_SET.has(token)) {
        return { ok: false, match: token }
      }
    }
  }

  if (compact.length > 0) {
    for (const word of UNSAVORY_SET) {
      if (word.length > 1 && compact.includes(word)) {
        return { ok: false, match: word }
      }
    }
  }

  return { ok: true }
}

export function assertNoUnsavory(fields: Array<[string, string | undefined | null]>): { ok: boolean; field?: string; match?: string } {
  for (const [field, value] of fields) {
    const res = containsUnsavory(value)
    if (!res.ok) return { ok: false, field, match: res.match }
  }
  return { ok: true }
}


