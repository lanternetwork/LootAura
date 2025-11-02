# ZIP Code Import Scripts

This directory contains scripts to import ZIP code data from CSV files into the Supabase database and generate hardcoded lists for performance.

## Scripts

### 1. `import-zipcodes.ts`

Bulk imports ZIP codes from a CSV file into the `lootaura_v2.zipcodes` table.

**Usage:**
```bash
tsx scripts/import-zipcodes.ts <path-to-csv-file>
```

**Example:**
```bash
tsx scripts/import-zipcodes.ts "C:\Users\jw831\Downloads\zips\georef-united-states-of-america-zc-point.csv"
```

**CSV Format Required:**
- Semicolon-delimited (`;`)
- Required columns:
  - `Zip Code`: 5-digit ZIP code
  - `Official USPS city name`: City name
  - `Official USPS State Code`: 2-letter state code (e.g., "KY", "TX")
  - `Geo Point`: Coordinates in format `"lat, lng"` (space-separated)

**What it does:**
1. Parses the CSV file line by line
2. Extracts ZIP, city, state, lat, lng
3. Normalizes ZIP codes to 5 digits (pads with zeros)
4. Validates coordinates
5. Bulk imports in batches of 1000 (uses UPSERT to avoid duplicates)

**Output:**
- Prints progress every 5000 rows
- Shows total rows processed, valid ZIP codes, and skipped entries

---

### 2. `generate-hardcoded-zips.ts`

Generates a TypeScript hardcoded list of ZIP codes from the database.

**Usage:**
```bash
tsx scripts/generate-hardcoded-zips.ts [options]
```

**Options:**
- `--limit <number>`: Maximum number of ZIPs to include (default: 500)
- `--output <file>`: Output to file instead of stdout

**Examples:**
```bash
# Generate 500 ZIP codes to stdout
tsx scripts/generate-hardcoded-zips.ts

# Generate 1000 ZIP codes to a file
tsx scripts/generate-hardcoded-zips.ts --limit 1000 --output lib/data/hardcoded-zips.ts

# Generate 2000 ZIP codes
tsx scripts/generate-hardcoded-zips.ts --limit 2000
```

**What it does:**
1. Queries the database for ZIP codes
2. Filters out entries without city/state
3. Groups by city/state for better organization
4. Generates TypeScript code ready to paste into the ZIP geocoding route

**Output Format:**
```typescript
const hardcodedZips: Record<string, { lat: number; lng: number; city: string; state: string }> = {
  // Louisville, KY
  '40204': { lat: 38.2380249, lng: -85.7246945, city: 'Louisville', state: 'KY' },
  '40202': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
  // ...
}
```

---

## Workflow

### Initial Import

1. **Import CSV data:**
   ```bash
   tsx scripts/import-zipcodes.ts "path/to/georef-united-states-of-america-zc-point.csv"
   ```

2. **Generate hardcoded list:**
   ```bash
   tsx scripts/generate-hardcoded-zips.ts --limit 500 --output lib/data/hardcoded-zips.ts
   ```

3. **Update ZIP geocoding route:**
   - Copy the generated code
   - Replace the `hardcodedZips` object in `app/api/geocoding/zip/route.ts`

### Regular Updates

You can re-run the generate script periodically to update the hardcoded list with new or more popular ZIP codes:

```bash
tsx scripts/generate-hardcoded-zips.ts --limit 1000
```

---

## CSV File Source

The recommended CSV file is:
- **File:** `georef-united-states-of-america-zc-point.csv`
- **Source:** GeoNames or similar US ZIP code datasets
- **Format:** Semicolon-delimited
- **Size:** ~33,000 rows (covers most US ZIP codes)

---

## Database Schema

The scripts import into `lootaura_v2.zipcodes` table with the following schema:

```sql
CREATE TABLE lootaura_v2.zipcodes (
  zip TEXT PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  city TEXT,
  state TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Environment Variables Required

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE`: Service role key (for admin operations)

Make sure these are set in your `.env.local` file.

---

## Performance Impact

- **Database import:** ~33,000 ZIP codes imported in a few minutes
- **Hardcoded list:** 500-2000 ZIP codes adds minimal bundle size (~50-200KB)
- **Lookup speed:** Hardcoded ZIPs are instant, database lookups are fast (indexed), Nominatim is slow (external API)

---

## Troubleshooting

### "Missing SUPABASE_SERVICE_ROLE"
- Check your `.env.local` file
- Ensure `SUPABASE_SERVICE_ROLE` is set

### "CSV file not found"
- Use absolute path or relative path from project root
- On Windows, use quotes around paths with spaces

### "Batch insert error"
- Check database connection
- Verify table exists: `lootaura_v2.zipcodes`
- Check RLS policies (admin client should bypass RLS)

### "Invalid Geo Point"
- Verify CSV format has coordinates in `"lat, lng"` format
- Check for missing or malformed coordinate data

