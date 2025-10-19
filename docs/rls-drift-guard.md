# RLS Drift Guard

**Last updated: 2025-10-19**

## Overview

The RLS Drift Guard is a nightly CI job that monitors Row Level Security (RLS) policies for unauthorized changes. It compares current database policies against the expected policies defined in migration files and reports any discrepancies.

## How It Works

### Policy Extraction
The drift guard extracts current RLS policies from the database and compares them against the expected policies defined in migration files.

### Comparison Process
1. **Extract Current Policies**: Query database for current RLS policies
2. **Load Expected Policies**: Parse migration files for expected policies
3. **Compare Policies**: Compare current vs expected policies
4. **Generate Report**: Create diff report for any discrepancies
5. **Post Artifact**: Attach comparison report to CI run

### Drift Detection
The guard detects:
- **Policy Changes**: Modified RLS policies
- **Policy Additions**: New policies not in migrations
- **Policy Deletions**: Missing policies from migrations
- **Permission Changes**: Modified permissions in policies
- **Table Changes**: RLS enabled/disabled on tables

## CI Job Implementation

### Nightly Schedule
```yaml
# .github/workflows/rls-drift-guard.yml
name: RLS Drift Guard
on:
  schedule:
    # Run every night at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch: # Allow manual runs

jobs:
  rls-drift-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Extract current RLS policies
        run: |
          # Connect to database and extract current policies
          node scripts/extract-rls-policies.js > current-policies.json
        env:
          SUPABASE_SERVICE_ROLE: ${{ secrets.SUPABASE_SERVICE_ROLE }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          
      - name: Generate expected policies
        run: |
          # Parse migration files and generate expected policies
          node scripts/generate-expected-policies.js > expected-policies.json
          
      - name: Compare policies
        run: |
          # Compare current vs expected policies
          node scripts/compare-rls-policies.js > drift-report.md
          
      - name: Upload drift report
        uses: actions/upload-artifact@v4
        with:
          name: rls-drift-report
          path: drift-report.md
          
      - name: Post summary
        run: |
          echo "## RLS Drift Guard Report" >> $GITHUB_STEP_SUMMARY
          if [ -s drift-report.md ]; then
            echo "⚠️ RLS policy drift detected" >> $GITHUB_STEP_SUMMARY
            echo "See drift-report.md for details" >> $GITHUB_STEP_SUMMARY
          else
            echo "✅ No RLS policy drift detected" >> $GITHUB_STEP_SUMMARY
          fi
```

### Policy Extraction Script
```javascript
// scripts/extract-rls-policies.js
const { createClient } = require('@supabase/supabase-js')

async function extractRLSPolicies() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE
  )
  
  // Query current RLS policies
  const { data: policies, error } = await supabase
    .from('information_schema.table_privileges')
    .select('*')
    .eq('grantee', 'anon')
    .eq('grantee', 'authenticated')
  
  if (error) {
    console.error('Error extracting policies:', error)
    process.exit(1)
  }
  
  console.log(JSON.stringify(policies, null, 2))
}

extractRLSPolicies()
```

### Policy Comparison Script
```javascript
// scripts/compare-rls-policies.js
const fs = require('fs')

function comparePolicies() {
  const current = JSON.parse(fs.readFileSync('current-policies.json', 'utf8'))
  const expected = JSON.parse(fs.readFileSync('expected-policies.json', 'utf8'))
  
  const differences = []
  
  // Compare policies
  for (const table in expected) {
    if (!current[table]) {
      differences.push(`Missing table: ${table}`)
    } else {
      // Compare table policies
      const currentPolicies = current[table].policies || []
      const expectedPolicies = expected[table].policies || []
      
      if (currentPolicies.length !== expectedPolicies.length) {
        differences.push(`Policy count mismatch for ${table}: current=${currentPolicies.length}, expected=${expectedPolicies.length}`)
      }
      
      // Compare individual policies
      for (const expectedPolicy of expectedPolicies) {
        const currentPolicy = currentPolicies.find(p => p.name === expectedPolicy.name)
        if (!currentPolicy) {
          differences.push(`Missing policy: ${table}.${expectedPolicy.name}`)
        } else if (currentPolicy.definition !== expectedPolicy.definition) {
          differences.push(`Policy definition mismatch: ${table}.${expectedPolicy.name}`)
        }
      }
    }
  }
  
  if (differences.length > 0) {
    console.log('# RLS Policy Drift Detected\n')
    console.log('## Differences Found:\n')
    differences.forEach(diff => console.log(`- ${diff}`))
    console.log('\n## Action Required:')
    console.log('1. Review the differences above')
    console.log('2. Determine if changes are intentional')
    console.log('3. Update migration files if needed')
    console.log('4. Revert unauthorized changes')
  } else {
    console.log('# RLS Policy Drift Check Passed\n')
    console.log('✅ No policy drift detected')
  }
}

comparePolicies()
```

## Expected Policies

### Sales Table Policies
```sql
-- Public read: only published sales with minimal fields
CREATE POLICY "sales_public_read" ON lootaura_v2.sales
    FOR SELECT
    USING (status = 'published');

-- Owner can insert their own sales
CREATE POLICY "sales_owner_insert" ON lootaura_v2.sales
    FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

-- Owner can update their own sales
CREATE POLICY "sales_owner_update" ON lootaura_v2.sales
    FOR UPDATE
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- Owner can delete their own sales
CREATE POLICY "sales_owner_delete" ON lootaura_v2.sales
    FOR DELETE
    USING (auth.uid() = owner_id);
```

### Profiles Table Policies
```sql
-- Public read: only display_name and avatar_url
CREATE POLICY "profiles_public_read" ON lootaura_v2.profiles
    FOR SELECT
    USING (true);

-- Owner can insert their own profile
CREATE POLICY "profiles_owner_insert" ON lootaura_v2.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Owner can update their own profile
CREATE POLICY "profiles_owner_update" ON lootaura_v2.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
```

### Favorites Table Policies
```sql
-- Owner can read their own favorites
CREATE POLICY "favorites_owner_read" ON lootaura_v2.favorites
    FOR SELECT
    USING (auth.uid() = user_id);

-- Owner can insert their own favorites
CREATE POLICY "favorites_owner_insert" ON lootaura_v2.favorites
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Owner can delete their own favorites
CREATE POLICY "favorites_owner_delete" ON lootaura_v2.favorites
    FOR DELETE
    USING (auth.uid() = user_id);
```

### Items Table Policies
```sql
-- Public read: only items from published sales
CREATE POLICY "items_public_read" ON lootaura_v2.items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND status = 'published'
        )
    );

-- Owner can insert items for their own sales
CREATE POLICY "items_owner_insert" ON lootaura_v2.items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND owner_id = auth.uid()
        )
    );

-- Owner can update items for their own sales
CREATE POLICY "items_owner_update" ON lootaura_v2.items
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND owner_id = auth.uid()
        )
    );

-- Owner can delete items from their own sales
CREATE POLICY "items_owner_delete" ON lootaura_v2.items
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM lootaura_v2.sales 
            WHERE id = sale_id AND owner_id = auth.uid()
        )
    );
```

## Drift Report Format

### Report Structure
```markdown
# RLS Policy Drift Report
**Generated**: 2025-10-19T02:00:00Z
**Status**: ⚠️ Drift Detected

## Summary
- **Tables Checked**: 4
- **Policies Checked**: 16
- **Differences Found**: 2

## Differences

### Table: lootaura_v2.sales
- **Missing Policy**: sales_owner_delete
- **Modified Policy**: sales_public_read (definition changed)

### Table: lootaura_v2.profiles
- **Added Policy**: profiles_admin_read (not in migrations)

## Action Required
1. Review the differences above
2. Determine if changes are intentional
3. Update migration files if needed
4. Revert unauthorized changes

## Next Steps
- [ ] Investigate missing policies
- [ ] Review modified policies
- [ ] Update migration files
- [ ] Revert unauthorized changes
- [ ] Re-run drift guard
```

## Monitoring & Alerts

### Drift Detection Alerts
- **Slack**: #security channel for policy drift
- **Email**: security@lootaura.com for critical drift
- **Dashboard**: Security dashboard for policy status
- **Reports**: Weekly security reports

### Response Procedures
1. **Immediate**: Review drift report
2. **Investigate**: Determine if changes are intentional
3. **Action**: Update migrations or revert changes
4. **Verify**: Re-run drift guard to confirm fix
5. **Document**: Update security documentation

## Security Considerations

### Policy Integrity
- **No Direct Changes**: Policies should only be changed via migrations
- **Audit Trail**: All policy changes should be tracked
- **Review Process**: Policy changes should be reviewed
- **Testing**: Policy changes should be tested

### Access Control
- **Service Role**: Only service role can modify policies
- **Migration Order**: Policies applied in correct order
- **Rollback**: Ability to rollback policy changes
- **Verification**: Policy changes verified after application

## Troubleshooting

### Common Issues
- **Connection Errors**: Database connection issues
- **Permission Errors**: Insufficient database permissions
- **Parse Errors**: Migration file parsing errors
- **Comparison Errors**: Policy comparison failures

### Resolution Steps
1. **Check Connection**: Verify database connectivity
2. **Check Permissions**: Verify service role permissions
3. **Check Files**: Verify migration files are valid
4. **Check Logic**: Verify comparison logic is correct
5. **Re-run**: Re-run drift guard after fixes

## Maintenance

### Weekly Tasks
- [ ] Review drift reports
- [ ] Check for policy changes
- [ ] Update documentation
- [ ] Verify policy integrity

### Monthly Tasks
- [ ] Audit policy changes
- [ ] Review security posture
- [ ] Update drift guard logic
- [ ] Test rollback procedures

### Quarterly Tasks
- [ ] Security review
- [ ] Policy optimization
- [ ] Access control review
- [ ] Compliance verification
