export class DiagnosticsWriteCounter {
  total = 0
  sequential = 0
  private readonly tables = new Set<string>()

  recordUpdate(table: string, options?: { sequential?: boolean }): void {
    this.total += 1
    if (options?.sequential) {
      this.sequential += 1
    }
    this.tables.add(table)
  }

  recordUpsertBatch(table: string, statementCount: number): void {
    if (statementCount <= 0) return
    this.total += statementCount
    this.tables.add(table)
  }

  getTables(): string[] {
    return [...this.tables].sort()
  }
}
