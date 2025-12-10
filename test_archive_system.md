# How to Manually Trigger the Archive System

The archive system runs as part of the daily cron job at `/api/cron/daily`. To manually trigger it for testing:

## Method 1: Using cURL (Terminal/Command Line)

```bash
curl -X POST https://your-domain.com/api/cron/daily \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Replace:
- `your-domain.com` with your actual domain (e.g., `lootaura.vercel.app` or `localhost:3000` for local)
- `YOUR_CRON_SECRET` with your actual `CRON_SECRET` environment variable value

## Method 2: Using a REST Client (Postman, Insomnia, etc.)

1. **URL**: `POST https://your-domain.com/api/cron/daily`
2. **Headers**:
   - `Authorization: Bearer YOUR_CRON_SECRET`
   - `Content-Type: application/json`

## Method 3: Using Browser DevTools (if running locally)

If testing locally, you can use the browser console:

```javascript
fetch('/api/cron/daily', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_CRON_SECRET'
  }
})
.then(res => res.json())
.then(data => console.log('Archive result:', data))
.catch(err => console.error('Error:', err))
```

## Method 4: Create a Test Script

Create a file `test-archive.js`:

```javascript
const CRON_SECRET = process.env.CRON_SECRET || 'your-secret-here';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

fetch(`${BASE_URL}/api/cron/daily`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${CRON_SECRET}`,
    'Content-Type': 'application/json'
  }
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Archive system triggered successfully!');
    console.log('Results:', JSON.stringify(data, null, 2));
    
    if (data.tasks?.archiveSales) {
      const archiveResult = data.tasks.archiveSales;
      console.log(`\n📦 Archived ${archiveResult.archived || 0} sales`);
    }
  })
  .catch(err => {
    console.error('❌ Error:', err);
  });
```

Run with: `node test-archive.js`

## What to Expect

A successful response will look like:

```json
{
  "ok": true,
  "job": "daily",
  "runAt": "2024-01-15T10:30:00.000Z",
  "env": "production",
  "tasks": {
    "archiveSales": {
      "ok": true,
      "archived": 5,
      "errors": 0
    },
    "favoriteSalesStartingSoon": {
      "ok": true,
      "sent": 3,
      "errors": 0
    }
  }
}
```

## Verify Archive Results

After running, check your database:

```sql
-- See recently archived sales
SELECT id, title, date_end, status, archived_at 
FROM lootaura_v2.sales 
WHERE archived_at IS NOT NULL 
ORDER BY archived_at DESC 
LIMIT 10;

-- Count archived sales
SELECT COUNT(*) as archived_count 
FROM lootaura_v2.sales 
WHERE status = 'archived' AND archived_at IS NOT NULL;
```

## Troubleshooting

- **401 Unauthorized**: Check that your `CRON_SECRET` matches the environment variable
- **500 Error**: Check server logs for details about what failed
- **No sales archived**: This is normal if no sales have ended yet. Create a test sale with `date_end` in the past to test




