import { deduplicateSales } from '@/lib/sales/dedupe';

test('deduplicateSales uses canonical sale id', () => {
  const input = [{id:'A'}, {id:'A'}, {id:'B'}] as any;
  expect(deduplicateSales(input).map(x=>x.id)).toEqual(['A','B']);
});

test('deduplicateSales handles empty array', () => {
  expect(deduplicateSales([])).toEqual([]);
});

test('deduplicateSales handles single item', () => {
  const input = [{id:'A'}] as any;
  expect(deduplicateSales(input)).toEqual(input);
});
