const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Parse semicolon-delimited CSV line
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ';' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function estimateFileSize(lines, header) {
  const allLines = [header, ...lines].join('\n');
  return Buffer.byteLength(allLines, 'utf8');
}

async function splitCSV(inputPath, maxSizeMB = 4.0) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  const outputDir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const extension = path.extname(inputPath);

  console.log(`📂 Reading CSV file: ${inputPath}`);
  console.log(`📏 Maximum file size: ${maxSizeMB} MB (${maxSizeBytes.toLocaleString()} bytes)\n`);

  const fileStream = fs.createReadStream(inputPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let header = null;
  let currentChunk = [];
  let chunkNumber = 1;
  let totalRows = 0;

  for await (const line of rl) {
    if (!header) {
      header = line;
      console.log(`📋 Header line: ${header.substring(0, 100)}...\n`);
      continue;
    }

    totalRows++;

    // Estimate size with this new line
    const testChunk = [...currentChunk, line];
    const estimatedSize = estimateFileSize(testChunk, header);

    // If adding this line would exceed the limit, write current chunk and start new one
    if (estimatedSize >= maxSizeBytes && currentChunk.length > 0) {
      const outputPath = path.join(outputDir, `${baseName}-part${chunkNumber}${extension}`);
      const content = [header, ...currentChunk].join('\n');
      fs.writeFileSync(outputPath, content, 'utf-8');
      
      const actualSize = Buffer.byteLength(content, 'utf8');
      console.log(`✅ Created part ${chunkNumber}: ${outputPath}`);
      console.log(`   Rows: ${currentChunk.length.toLocaleString()}, Size: ${(actualSize / 1024 / 1024).toFixed(2)} MB\n`);

      chunkNumber++;
      currentChunk = [line];
    } else {
      currentChunk.push(line);
    }

    // Progress indicator every 10000 rows
    if (totalRows % 10000 === 0) {
      process.stdout.write(`\r   Processed ${totalRows.toLocaleString()} rows...`);
    }
  }

  // Write the last chunk
  if (currentChunk.length > 0) {
    const outputPath = path.join(outputDir, `${baseName}-part${chunkNumber}${extension}`);
    const content = [header, ...currentChunk].join('\n');
    fs.writeFileSync(outputPath, content, 'utf-8');
    
    const actualSize = Buffer.byteLength(content, 'utf8');
    console.log(`\r✅ Created part ${chunkNumber}: ${outputPath}`);
    console.log(`   Rows: ${currentChunk.length.toLocaleString()}, Size: ${(actualSize / 1024 / 1024).toFixed(2)} MB\n`);
  }

  console.log(`\n✅ Split complete!`);
  console.log(`   Total rows: ${totalRows.toLocaleString()}`);
  console.log(`   Created ${chunkNumber} file(s)`);
  console.log(`   Output directory: ${outputDir}`);
}

// Main execution
async function main() {
  const inputPath = process.argv[2];
  const maxSizeMB = parseFloat(process.argv[3] || '4.0');

  if (!inputPath) {
    console.error('❌ Error: CSV file path required');
    console.log('\nUsage:');
    console.log('  node scripts/split-csv.js <path-to-csv-file> [max-size-mb]');
    console.log('\nExample:');
    console.log('  node scripts/split-csv.js "C:\\Users\\jw831\\Downloads\\zips\\georef-united-states-of-america-zc-point.csv" 4.0');
    process.exit(1);
  }

  try {
    await splitCSV(inputPath, maxSizeMB);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

