# How to Run the ZIP Code Import

## Prerequisites

1. **Node.js must be installed and in your PATH**
2. **Environment variables must be set** (`.env.local` file with Supabase credentials)

## Running the Import Script

### Option 1: Using npm scripts (recommended)

If you add this to your `package.json` scripts:
```json
"import:zipcodes": "tsx scripts/import-zipcodes.ts"
```

Then run:
```bash
npm run import:zipcodes "C:\Users\jw831\Downloads\zips\georef-united-states-of-america-zc-point.csv"
```

### Option 2: Direct execution

Make sure Node.js is in your PATH, then run:
```bash
tsx scripts/import-zipcodes.ts "C:\Users\jw831\Downloads\zips\georef-united-states-of-america-zc-point.csv"
```

Or with npx:
```bash
npx tsx scripts/import-zipcodes.ts "C:\Users\jw831\Downloads\zips\georef-united-states-of-america-zc-point.csv"
```

### Option 3: Using Node directly

If you have the full path to node:
```bash
"C:\Program Files\nodejs\node.exe" node_modules/.bin/tsx scripts/import-zipcodes.ts "C:\Users\jw831\Downloads\zips\georef-united-states-of-america-zc-point.csv"
```

## Required Environment Variables

Make sure your `.env.local` file contains:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE=your_service_role_key_here
```

## Expected Output

The script will:
1. Read and parse the CSV file
2. Show progress every 5000 rows
3. Display final statistics:
   - Total rows processed
   - Valid ZIP codes imported
   - Skipped entries

Example output:
```
📂 Reading CSV file: C:\Users\jw831\Downloads\zips\georef-united-states-of-america-zc-point.csv
🔄 Processing CSV file...

📋 Header columns: 17
   Sample: Zip Code, Official USPS city name, Official USPS State Code...

   Processed 5000 rows, 4850 valid, 150 skipped...
   Processed 10000 rows, 9700 valid, 300 skipped...

✅ Import complete!
   Total rows: 33122
   Valid ZIP codes: 32800
   Skipped: 322
```

