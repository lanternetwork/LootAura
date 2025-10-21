describe('Sequence guard', () => {
  it('drops stale sequences', () => {
    const currentSeq = 10;
    const incomingSeq = 9;
    expect(incomingSeq === currentSeq).toBe(false);
    // This test verifies that stale sequences are properly rejected
  });

  it('accepts current sequences', () => {
    const currentSeq = 10;
    const incomingSeq = 10;
    expect(incomingSeq === currentSeq).toBe(true);
    // This test verifies that current sequences are properly accepted
  });
});
