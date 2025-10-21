import { isCauseCompatibleWithIntent } from '@/lib/sales/intent';

test('ClusterDrilldown results apply while drilling or slight pan', () => {
  expect(isCauseCompatibleWithIntent('ClusterDrilldown', { kind: 'ClusterDrilldown', targetBounds: [[0,0],[1,1]] })).toBe(true);
  expect(isCauseCompatibleWithIntent('ClusterDrilldown', { kind: 'UserPan' })).toBe(true);
  expect(isCauseCompatibleWithIntent('ClusterDrilldown', { kind: 'Filters' })).toBe(false);
});

test('Filters results only apply during Filters intent', () => {
  expect(isCauseCompatibleWithIntent('Filters', { kind: 'Filters' })).toBe(true);
  expect(isCauseCompatibleWithIntent('Filters', { kind: 'UserPan' })).toBe(false);
});

test('UserPan results apply during UserPan or ClusterDrilldown', () => {
  expect(isCauseCompatibleWithIntent('UserPan', { kind: 'UserPan' })).toBe(true);
  expect(isCauseCompatibleWithIntent('UserPan', { kind: 'ClusterDrilldown', targetBounds: [[0,0],[1,1]] })).toBe(true);
  expect(isCauseCompatibleWithIntent('UserPan', { kind: 'Filters' })).toBe(false);
});
