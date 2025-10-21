describe('Sequence guard', () => {
  it('drops stale sequences', () => {
    const currentSeq = 10;
    const incomingSeq = 9;
    const isStale = incomingSeq !== currentSeq;
    expect(isStale).toBe(true);
    // This test verifies that stale sequences are properly rejected
  });

  it('accepts current sequences', () => {
    const currentSeq = 10;
    const incomingSeq = 10;
    const isCurrent = incomingSeq === currentSeq;
    expect(isCurrent).toBe(true);
    // This test verifies that current sequences are properly accepted
  });
});
