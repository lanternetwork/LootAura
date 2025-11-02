param(
    [Parameter(Mandatory=$true)]
    [string]$InputFile,
    [double]$MaxSizeMB = 4.0
)

$maxSizeBytes = $MaxSizeMB * 1024 * 1024

if (-not (Test-Path $InputFile)) {
    Write-Host "Error: File not found: $InputFile" -ForegroundColor Red
    exit 1
}

$outputDir = Split-Path $InputFile -Parent
$baseName = [System.IO.Path]::GetFileNameWithoutExtension($InputFile)
$extension = [System.IO.Path]::GetExtension($InputFile)

Write-Host "Reading CSV file: $InputFile"
Write-Host "Maximum file size: $MaxSizeMB MB ($([int]$maxSizeBytes) bytes)"
Write-Host ""

$lines = Get-Content $InputFile -Encoding UTF8
$header = $lines[0]
$dataLines = $lines[1..($lines.Count - 1)]

Write-Host "Header line: $($header.Substring(0, [Math]::Min(100, $header.Length)))..."
Write-Host ""

$chunkNumber = 1
$currentChunk = @()
$totalRows = 0

foreach ($line in $dataLines) {
    $totalRows++
    
    # Test if adding this line would exceed the limit
    $testChunk = $currentChunk + $line
    $testContent = ($header + "`n" + ($testChunk -join "`n"))
    $testSize = [System.Text.Encoding]::UTF8.GetByteCount($testContent)
    
    # If adding this line would exceed the limit, write current chunk
    if ($testSize -ge $maxSizeBytes -and $currentChunk.Count -gt 0) {
        $outputPath = Join-Path $outputDir "${baseName}-part${chunkNumber}${extension}"
        $content = ($header + "`n" + ($currentChunk -join "`n"))
        [System.IO.File]::WriteAllText($outputPath, $content, [System.Text.Encoding]::UTF8)
        
        $actualSize = (Get-Item $outputPath).Length
        Write-Host "Created part $chunkNumber : $outputPath"
        Write-Host "  Rows: $($currentChunk.Count), Size: $([math]::Round($actualSize / 1MB, 2)) MB"
        Write-Host ""
        
        $chunkNumber++
        $currentChunk = @($line)
    } else {
        $currentChunk += $line
    }
    
    # Progress indicator
    if ($totalRows % 10000 -eq 0) {
        Write-Host "  Processed $totalRows rows..." -NoNewline
        Write-Host "`r" -NoNewline
    }
}

# Write the last chunk
if ($currentChunk.Count -gt 0) {
    $outputPath = Join-Path $outputDir "${baseName}-part${chunkNumber}${extension}"
    $content = ($header + "`n" + ($currentChunk -join "`n"))
    [System.IO.File]::WriteAllText($outputPath, $content, [System.Text.Encoding]::UTF8)
    
    $actualSize = (Get-Item $outputPath).Length
    Write-Host ""
    Write-Host "Created part $chunkNumber : $outputPath"
    Write-Host "  Rows: $($currentChunk.Count), Size: $([math]::Round($actualSize / 1MB, 2)) MB"
    Write-Host ""
}

Write-Host ""
Write-Host "Split complete!"
Write-Host "  Total rows: $totalRows"
Write-Host "  Created $chunkNumber file(s)"
Write-Host "  Output directory: $outputDir"
