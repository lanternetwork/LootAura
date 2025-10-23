import { isCauseCompatibleWithIntent } from '@/lib/sales/intent';

describe('Intent compatibility', () => {
  it('filters own the list while Filters intent', () => {
    expect(isCauseCompatibleWithIntent('Filters', { kind: 'Filters' })).toBe(true);
    expect(isCauseCompatibleWithIntent('UserPan', { kind: 'Filters' })).toBe(false);
    expect(isCauseCompatibleWithIntent('ClusterDrilldown', { kind: 'Filters' })).toBe(false);
  });

  it('UserPan results apply during UserPan or ClusterDrilldown intent', () => {
    expect(isCauseCompatibleWithIntent('UserPan', { kind: 'UserPan' })).toBe(true);
    expect(isCauseCompatibleWithIntent('UserPan', { kind: 'ClusterDrilldown' })).toBe(true);
    expect(isCauseCompatibleWithIntent('UserPan', { kind: 'Filters' })).toBe(false);
  });

  it('ClusterDrilldown results apply during ClusterDrilldown or UserPan intent', () => {
    expect(isCauseCompatibleWithIntent('ClusterDrilldown', { kind: 'ClusterDrilldown' })).toBe(true);
    expect(isCauseCompatibleWithIntent('ClusterDrilldown', { kind: 'UserPan' })).toBe(true);
    expect(isCauseCompatibleWithIntent('ClusterDrilldown', { kind: 'Filters' })).toBe(false);
  });
});
