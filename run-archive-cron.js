#!/usr/bin/env node
/**
 * Script to manually trigger the archive system cron job
 * 
 * Usage:
 *   node run-archive-cron.js [domain]
 * 
 * Environment variables:
 *   CRON_SECRET - Required: Your cron secret token
 * 
 * Examples:
 *   CRON_SECRET=my-secret node run-archive-cron.js
 *   CRON_SECRET=my-secret node run-archive-cron.js https://lootaura.vercel.app
 */

const domain = process.argv[2] || 'http://localhost:3000';
const cronSecret = process.env.CRON_SECRET;

if (!cronSecret) {
  console.error('❌ Error: CRON_SECRET environment variable not set');
  console.error('');
  console.error('Usage:');
  console.error('  CRON_SECRET=your-secret node run-archive-cron.js [domain]');
  console.error('');
  console.error('Examples:');
  console.error('  CRON_SECRET=my-secret node run-archive-cron.js');
  console.error('  CRON_SECRET=my-secret node run-archive-cron.js https://lootaura.vercel.app');
  process.exit(1);
}

const url = `${domain}/api/cron/daily`;

console.log(`🚀 Triggering archive cron job at ${url}`);
console.log('');

fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${cronSecret}`,
    'Content-Type': 'application/json',
  },
})
  .then(async (res) => {
    const data = await res.json();
    const status = res.status;
    
    console.log(`HTTP Status: ${status}`);
    console.log('');
    console.log('Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');
    
    if (status === 200 && data.ok) {
      console.log('✅ Success!');
      if (data.tasks?.archiveSales) {
        const archiveResult = data.tasks.archiveSales;
        console.log(`📦 Archived ${archiveResult.archived || 0} sales`);
      }
    } else {
      console.log('❌ Failed');
      if (data.error) {
        console.log(`Error: ${data.error}`);
      }
    }
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });




