import type { DiagnosticsExportMode } from '@/lib/admin/diagnostics/v4/types'

export type ExportMetadata = {
  diagnosticsExportVersion: string
  diagnosticsModelVersion: string
  generatedAt: string
  environment: string
  exportMode: DiagnosticsExportMode
}

export function buildExportMetadata(
  model: import('@/lib/admin/diagnostics/v4/types').IngestionDiagnosticsModel,
  exportMode: DiagnosticsExportMode
): ExportMetadata {
  return {
    diagnosticsExportVersion: '4.0.0',
    diagnosticsModelVersion: model.diagnosticsModelVersion,
    generatedAt: model.generatedAt,
    environment: model.environment,
    exportMode,
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
    '',
  ]
}
