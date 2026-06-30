import { buildYstmCoverageDiagnostics } from '@/lib/admin/buildYstmCoverageDiagnostics'
import { buildYstmIngestionRepairDiagnostics } from '@/lib/admin/buildYstmIngestionRepairDiagnostics'
import { buildYstmStabilizationDiagnostics } from '@/lib/admin/buildYstmStabilizationDiagnostics'
import { evaluateYstmSaleInstanceRolloutGates } from '@/lib/admin/evaluateYstmSaleInstanceRolloutGates'
import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'
import { buildEngineeringReport } from '@/lib/admin/diagnostics/v4/export/buildEngineeringReport'
import { buildOperationsReport } from '@/lib/admin/diagnostics/v4/export/buildOperationsReport'
import { buildExportMetadata, formatExportHeader } from '@/lib/admin/diagnostics/v4/export/exportMetadata'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'

function buildRolloutGatesSection(model: IngestionDiagnosticsModel): string | null {
  if (!model.coverage) return null
  const gates = evaluateYstmSaleInstanceRolloutGates(model.coverage)
  const lines = [
    '## APPENDIX — Engineering Rollout Gates',
    diagnosticBullet('enforcement ready', gates.enforcementReady ? 'yes' : 'no'),
    diagnosticBullet('observability ready', gates.observabilityReady ? 'yes' : 'no'),
    diagnosticBullet(
      'cross-provider enforcement ready',
      gates.crossProviderEnforcementReady ? 'yes' : 'no'
    ),
    '',
    '### Gates',
  ]
  for (const gate of gates.gates) {
    lines.push(
      diagnosticBullet(
        `[${gate.stage}] ${gate.label}`,
        `[${gate.status.toUpperCase()}] ${gate.detail}`
      )
    )
  }
  return lines.join('\n')
}

function buildFullTableOfContents(): string[] {
  return [
    '## TABLE OF CONTENTS',
    '1. Export metadata',
    '2. Engineering Report (V4 authoritative + legacy compatibility)',
    '3. Appendix — ingestion stabilization metrics',
    '4. Appendix — YSTM ingestion repair program',
    '5. Appendix — Coverage internals',
    '6. Appendix — Rollout gates',
    '',
  ]
}

export function buildFullDiagnosticsReport(model: IngestionDiagnosticsModel): string {
  const metadata = buildExportMetadata(model, 'full')
  const engineering = buildEngineeringReport(model)

  const parts: string[] = [
    ...formatExportHeader(metadata, 'Ingestion Full Diagnostics'),
    ...buildFullTableOfContents(),
    engineering,
  ]

  if (model.coverage) {
    parts.push(
      '',
      '---',
      '',
      '## APPENDIX — YSTM Stabilization Exit',
      '',
      buildYstmStabilizationDiagnostics(model.metrics, model.coverage),
      '',
      '## APPENDIX — YSTM Ingestion Repair Program',
      '',
      buildYstmIngestionRepairDiagnostics(model.metrics, model.coverage),
      '',
      '## APPENDIX — Coverage Internals',
      '',
      buildYstmCoverageDiagnostics(model.coverage)
    )
    const rollout = buildRolloutGatesSection(model)
    if (rollout) {
      parts.push('', rollout)
    }
  }

  return parts.join('\n')
}

export function buildDiagnosticsExport(
  model: IngestionDiagnosticsModel,
  mode: 'operations' | 'engineering' | 'full'
): string {
  switch (mode) {
    case 'operations':
      return buildOperationsReport(model)
    case 'engineering':
      return buildEngineeringReport(model)
    case 'full':
      return buildFullDiagnosticsReport(model)
  }
}
