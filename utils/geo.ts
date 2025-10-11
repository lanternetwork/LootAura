/**
 * Geographic distance conversion utilities
 */

export const milesToKm = (miles: number): number => {
  return miles * 1.60934
}

export const kmToMiles = (km: number): number => {
  return km / 1.60934
}
