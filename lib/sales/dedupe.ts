// lib/sales/dedupe.ts
import { Sale } from '@/lib/types';

// Deduplicate sales by canonical sale ID
export function deduplicateSales(sales: Sale[]): Sale[] {
  const seen = new Set<string>();
  const unique = sales.filter(sale => {
    const canonicalId = sale.id;
    if (seen.has(canonicalId)) {
      return false;
    }
    seen.add(canonicalId);
    return true;
  });
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true' && unique.length !== sales.length) {
    console.log('[DEDUPE] input=', sales.length, 'output=unique=', unique.length, 'keys=[', unique.slice(0, 3).map(s => s.id), '...]');
  }
  
  return unique;
}
