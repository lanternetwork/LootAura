/**
 * Minimal typings for the `zipcodes` npm package (no upstream @types).
 * @see https://www.npmjs.com/package/zipcodes
 */
declare module 'zipcodes' {
  export interface ZipCodeRecord {
    zip: string
    latitude: number
    longitude: number
    city: string
    state: string
    country?: string
  }

  export function lookup(zip: string | null | undefined): ZipCodeRecord | null
}
