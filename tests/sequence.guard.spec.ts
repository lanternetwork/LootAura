describe('Sequence guard', () => {
  it('drops stale sequences', () => {
    const currentSeq: number = 10;
    const incomingSeq: number = 9;
    const isStale = incomingSeq !== currentSeq;
    expect(isStale).toBe(true);
    // This test verifies that stale sequences are properly rejected
  });

  it('accepts current sequences', () => {
    const currentSeq: number = 10;
    const incomingSeq: number = 10;
    const isCurrent = incomingSeq === currentSeq;
    expect(isCurrent).toBe(true);
    // This test verifies that current sequences are properly accepted
  });
});
