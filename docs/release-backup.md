# Production Database Backup Guide

**Last updated:** 2026-01-23

This document describes the process for creating and restoring production database backups for LootAura using Supabase PostgreSQL.

## Overview

Regular database backups are critical for:
- **Disaster recovery**: Restore from data loss or corruption
- **Release rollback**: Revert to a known-good state after deployment issues
- **Data migration testing**: Test migrations against production-like data
- **Compliance**: Maintain audit trails and data retention requirements

## Prerequisites

1. **Supabase Project Access**
   - Access to Supabase project dashboard
   - Database connection credentials (found in: Settings → Database → Connection string)

2. **PostgreSQL Client Tools**
   - `pg_dump` (PostgreSQL 14+ recommended)
   - `psql` (for restore operations)
   - Available via:
     - PostgreSQL client installation
     - Docker: `docker run --rm -it postgres:14 psql --version`

3. **Secure Storage**
   - Encrypted backup storage location
   - Access controls and audit logging
   - Off-site backup copies (recommended)

## Backup Process

### Step 1: Get Connection Details

1. Navigate to Supabase Dashboard → Your Project → Settings → Database
2. Find the **Connection string** section
3. Copy the **Connection pooling** URI (recommended) or **Direct connection** URI
4. Extract connection parameters:
   - **Host**: `db.{project-ref}.supabase.co`
   - **Port**: `5432` (default)
   - **Database**: `postgres`
   - **User**: `postgres.{project-ref}`
   - **Password**: Found in connection string or reset in dashboard

### Step 2: Create Backup Directory

```bash
# Create timestamped backup directory
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
```

### Step 3: Run pg_dump

#### Production-Safe Backup Command

```bash
# Set connection variables (DO NOT COMMIT THESE)
export PGHOST="db.{project-ref}.supabase.co"
export PGPORT="5432"
export PGDATABASE="postgres"
export PGUSER="postgres.{project-ref}"
export PGPASSWORD="your_database_password_here"

# Create full database backup
pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --format=custom \
  --verbose \
  --no-owner \
  --no-acl \
  --file="$BACKUP_DIR/lootaura_backup_$(date +%Y%m%d_%H%M%S).dump"

# Verify backup file was created
ls -lh "$BACKUP_DIR"/*.dump
```

#### Alternative: Using Connection String

```bash
# Using connection string (more secure, password not in env)
pg_dump \
  "postgresql://postgres.{project-ref}:{password}@db.{project-ref}.supabase.co:5432/postgres?sslmode=require" \
  --format=custom \
  --verbose \
  --no-owner \
  --no-acl \
  --file="$BACKUP_DIR/lootaura_backup_$(date +%Y%m%d_%H%M%S).dump"
```

#### Backup Options Explained

- `--format=custom`: Binary format (faster, smaller, recommended)
- `--verbose`: Show progress during backup
- `--no-owner`: Don't include ownership commands (prevents restore errors)
- `--no-acl`: Don't include access control lists (prevents permission errors)
- `--file`: Output file path

#### Schema-Only Backup (Structure Only)

```bash
# Backup schema only (no data) - useful for migration testing
pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --schema-only \
  --format=custom \
  --file="$BACKUP_DIR/lootaura_schema_$(date +%Y%m%d_%H%M%S).dump"
```

#### Data-Only Backup (No Schema)

```bash
# Backup data only (no schema) - useful for data migration
pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --data-only \
  --format=custom \
  --file="$BACKUP_DIR/lootaura_data_$(date +%Y%m%d_%H%M%S).dump"
```

### Step 4: Verify Backup

```bash
# Check backup file size (should be > 0)
ls -lh "$BACKUP_DIR"/*.dump

# Verify backup integrity (list contents)
pg_restore --list "$BACKUP_DIR"/*.dump | head -20

# Check backup metadata
pg_restore --list "$BACKUP_DIR"/*.dump | grep -E "TABLE|INDEX|FUNCTION|TRIGGER" | wc -l
```

### Step 5: Compress and Store

```bash
# Compress backup (optional, custom format is already compressed)
gzip "$BACKUP_DIR"/*.dump

# Move to secure storage
# Example: AWS S3, encrypted cloud storage, or secure file server
# aws s3 cp "$BACKUP_DIR"/*.dump.gz s3://your-backup-bucket/lootaura/
```

## Restore Process

### ⚠️ WARNING: Restore Operations

**Restoring a backup will OVERWRITE existing data.** Always:
1. Create a backup of current state before restoring
2. Test restore operations on a staging/development database first
3. Verify backup file integrity before restoring
4. Have a rollback plan ready

### Step 1: Prepare Restore Environment

```bash
# Set connection variables for target database
export PGHOST="db.{project-ref}.supabase.co"
export PGPORT="5432"
export PGDATABASE="postgres"
export PGUSER="postgres.{project-ref}"
export PGPASSWORD="your_database_password_here"

# Or use connection string
CONNECTION_STRING="postgresql://postgres.{project-ref}:{password}@db.{project-ref}.supabase.co:5432/postgres?sslmode=require"
```

### Step 2: Create Backup of Current State

```bash
# ALWAYS backup current state before restore
CURRENT_BACKUP="backups/pre_restore_$(date +%Y%m%d_%H%M%S).dump"
pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --format=custom \
  --file="$CURRENT_BACKUP"
```

### Step 3: Restore from Backup

#### Full Database Restore

```bash
# Restore full database (WARNING: Overwrites existing data)
pg_restore \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --verbose \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  "$BACKUP_DIR/lootaura_backup_YYYYMMDD_HHMMSS.dump"
```

#### Restore Options Explained

- `--verbose`: Show progress during restore
- `--clean`: Drop existing objects before creating (use with caution)
- `--if-exists`: Don't error if object doesn't exist
- `--no-owner`: Don't set ownership (prevents permission errors)
- `--no-acl`: Don't restore access control lists

#### Selective Restore (Specific Tables)

```bash
# Restore specific table only
pg_restore \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --table=sales \
  --verbose \
  --data-only \
  "$BACKUP_DIR/lootaura_backup_YYYYMMDD_HHMMSS.dump"
```

#### Schema-Only Restore

```bash
# Restore schema only (structure, no data)
pg_restore \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --schema-only \
  --verbose \
  "$BACKUP_DIR/lootaura_schema_YYYYMMDD_HHMMSS.dump"
```

### Step 4: Verify Restore

```bash
# Connect to database and verify
psql \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  -c "SELECT COUNT(*) FROM sales;"

# Check specific tables
psql \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  -c "\dt"  # List tables

# Verify data integrity
psql \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  -c "SELECT table_name, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

## Backup Schedule Recommendations

### Production Backups

- **Daily**: Full database backup (automated via Supabase dashboard or cron)
- **Pre-release**: Manual backup before major deployments
- **Post-release**: Backup after successful deployment verification
- **Weekly**: Full backup + schema-only backup for migration testing
- **Monthly**: Archive backups to long-term storage

### Automated Backup Script Example

```bash
#!/bin/bash
# backup-lootaura.sh
# Run via cron: 0 2 * * * /path/to/backup-lootaura.sh

set -euo pipefail

# Configuration
PGHOST="db.{project-ref}.supabase.co"
PGPORT="5432"
PGDATABASE="postgres"
PGUSER="postgres.{project-ref}"
BACKUP_DIR="/secure/backups/lootaura"
RETENTION_DAYS=30

# Create backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/lootaura_backup_$TIMESTAMP.dump"

mkdir -p "$BACKUP_DIR"

pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$BACKUP_FILE"

# Verify backup
if [ ! -s "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file is empty or missing"
  exit 1
fi

# Compress and encrypt (optional)
gzip "$BACKUP_FILE"

# Clean up old backups
find "$BACKUP_DIR" -name "*.dump.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $BACKUP_FILE.gz"
```

## Supabase Dashboard Backups

Supabase provides automated daily backups via the dashboard:

1. Navigate to: **Project Settings → Database → Backups**
2. View available backups (last 7 days retained)
3. Download backups or restore via dashboard
4. **Note**: Dashboard backups may have limitations; manual `pg_dump` provides more control

## Security Best Practices

1. **Never commit credentials**
   - Store connection strings in secure environment variables
   - Use secret management tools (AWS Secrets Manager, HashiCorp Vault, etc.)

2. **Encrypt backups**
   - Use encrypted storage for backup files
   - Consider `gpg` encryption for sensitive backups:
     ```bash
     gpg --symmetric --cipher-algo AES256 "$BACKUP_FILE"
     ```

3. **Access control**
   - Limit backup access to authorized personnel only
   - Use read-only database credentials for backups when possible
   - Audit backup access logs

4. **Secure transmission**
   - Use SSL/TLS for database connections (`sslmode=require`)
   - Use secure file transfer (SFTP, SCP) for backup storage

5. **Test restore procedures**
   - Regularly test restore operations on staging databases
   - Document any issues encountered during restore
   - Maintain restore runbooks

## Troubleshooting

### Connection Issues

```bash
# Test database connection
psql \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  -c "SELECT version();"
```

**Common errors:**
- `connection refused`: Check host/port, firewall rules
- `authentication failed`: Verify username/password
- `SSL required`: Add `?sslmode=require` to connection string

### Backup Failures

```bash
# Check backup file integrity
pg_restore --list "$BACKUP_FILE" > /dev/null && echo "Backup is valid" || echo "Backup is corrupted"

# Check disk space
df -h "$BACKUP_DIR"

# Check PostgreSQL logs (if accessible)
# Supabase: Dashboard → Logs → Database
```

### Restore Failures

```bash
# Restore with verbose output to identify issues
pg_restore --verbose "$BACKUP_FILE" 2>&1 | tee restore.log

# Check for specific errors
grep -i error restore.log

# Restore specific objects if full restore fails
pg_restore --list "$BACKUP_FILE" | grep -E "TABLE|INDEX" > restore_plan.txt
```

## Backup Verification Checklist

Before considering a backup complete, verify:

- [ ] Backup file exists and has non-zero size
- [ ] Backup file can be listed (`pg_restore --list`)
- [ ] Backup contains expected tables/schemas
- [ ] Backup timestamp matches expected backup time
- [ ] Backup is stored in secure, encrypted location
- [ ] Backup retention policy is followed
- [ ] Restore procedure has been tested (at least once)

## Related Documentation

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL pg_dump Documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
- [PostgreSQL pg_restore Documentation](https://www.postgresql.org/docs/current/app-pgrestore.html)
- [Production Environment Variables](./PRODUCTION_ENV.md)

## Support

For backup/restore issues:
1. Check Supabase dashboard logs
2. Review PostgreSQL error messages
3. Test on staging database first
4. Contact Supabase support if infrastructure issues persist

---

**⚠️ Remember**: Always test restore procedures on non-production databases before performing production restores.
