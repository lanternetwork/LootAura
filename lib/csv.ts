// CSV import/export utilities

export interface CSVRow {
  title: string
  description?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  start_at?: string
  end_at?: string
  tags?: string
  price_min?: string
  price_max?: string
  contact?: string
  source?: string
}

export function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const rows: CSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length !== headers.length) continue

    const row: CSVRow = { title: '' }
    headers.forEach((header, index) => {
      const value = values[index]?.trim().replace(/"/g, '')
      if (value) {
        row[header as keyof CSVRow] = value
      }
    })
    rows.push(row)
  }

  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  
  result.push(current)
  return result
}

export function exportToCSV(sales: any[]): string {
  const headers = [
    'title', 'description', 'address', 'city', 'state', 'zip',
    'start_at', 'end_at', 'tags', 'price_min', 'price_max', 'contact', 'source'
  ]

  const csvRows = [
    headers.join(','),
    ...sales.map(sale => 
      headers.map(header => {
        const value = sale[header]
        if (value === null || value === undefined) return ''
        if (Array.isArray(value)) return `"${value.join(';')}"`
        if (typeof value === 'string' && value.includes(',')) return `"${value}"`
        return value
      }).join(',')
    )
  ]

  return csvRows.join('\n')
}

export function downloadCSV(csvContent: string, filename: string = 'sales.csv') {
  const blob = new Blob([csvContent], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
