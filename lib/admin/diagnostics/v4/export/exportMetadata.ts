import type { DiagnosticsExportMode } from '@/lib/admin/diagnostics/v4/types'
import { DIAGNOSTICS_EXPORT_VERSION } from '@/lib/admin/diagnostics/v4/constants'

export type ExportMetadata = {
  diagnosticsExportVersion: string
  diagnosticsModelVersion: string
  generatedAt: string
  environment: string
  exportMode: DiagnosticsExportMode
  authoritativeModel: 'v4'
  gitSha: string | null
  deploymentId: string | null
}

export function buildExportMetadata(
  model: import('@/lib/admin/diagnostics/v4/types').IngestionDiagnosticsModel,
  exportMode: DiagnosticsExportMode
): ExportMetadata {
  return {
    diagnosticsExportVersion: DIAGNOSTICS_EXPORT_VERSION,
    diagnosticsModelVersion: model.diagnosticsModelVersion,
    generatedAt: model.generatedAt,
    environment: model.environment,
    exportMode,
    authoritativeModel: 'v4',
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  }
}

export function formatExportHeader(metadata: ExportMetadata, title: string): string[] {
  return [
    `# ${title}`,
    '',
    `- diagnostics_export_version: ${metadata.diagnosticsExportVersion}`,
    `- diagnostics_model_version: ${metadata.diagnosticsModelVersion}`,
    `- generated_at: ${metadata.generatedAt}`,
    `- environment: ${metadata.environment}`,
    `- export_mode: ${metadata.exportMode}`,
    `- authoritative_model: ${metadata.authoritativeModel}`,
    ...(metadata.gitSha ? [`- git_sha: ${metadata.gitSha}`] : []),
    ...(metadata.deploymentId ? [`- deployment_id: ${metadata.deploymentId}`] : []),
    '',
    '> V4 model is authoritative. Legacy sections (when present) are compatibility appendices only.',
    '',
  ]
}

export function formatExportNotes(): string[] {
  return [
    '## EXPORT NOTES',
    '- PII-free operational snapshot.',
    '- Trend fields show unavailable when no snapshot history exists.',
    '- Scheduler rows marked unknown include telemetry_unavailable_reason when known.',
    '',
  ]
}
