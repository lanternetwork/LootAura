// app/sales/lib/extractSales.ts
import { Sale } from '@/lib/types';

type SalesArray = Sale[];
type SalesFetchResult =
  | SalesArray
  | { data?: SalesArray; sales?: SalesArray }
  | null
  | undefined;

export function extractSales(result: SalesFetchResult): SalesArray {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  const r: any = result;
  if (Array.isArray(r?.data)) return r.data;
  if (Array.isArray(r?.sales)) return r.sales;
  // last resort: some APIs return {data: {items: []}}
  if (Array.isArray(r?.data?.items)) return r.data.items;
  // Warn once to help us find stray shapes, but don't crash the app.
  try { console.warn('[FETCH] Unexpected result shape; returning []', result); } catch {}
  return [];
}
