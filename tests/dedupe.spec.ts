import { deduplicateSales } from '@/lib/sales/dedupe';

describe('Deduplication', () => {
  it('deduplicates by canonical sale id', () => {
    const input = [{id:'A'}, {id:'A'}, {id:'B'}] as any;
    const result = deduplicateSales(input);
    expect(result.map(x => x.id)).toEqual(['A', 'B']);
  });

  it('handles empty arrays', () => {
    const input = [] as any;
    const result = deduplicateSales(input);
    expect(result).toEqual([]);
  });

  it('handles single items', () => {
    const input = [{id:'A'}] as any;
    const result = deduplicateSales(input);
    expect(result.map(x => x.id)).toEqual(['A']);
  });
});