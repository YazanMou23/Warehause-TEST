const { Pool } = require('pg');
const fs = require('fs');

async function run() {
  const envContent = fs.readFileSync('/home/ubuntu/Warehause-TEST/.env', 'utf8');
  const match = envContent.match(/DATABASE_URL=["']?([^"'\n]+)/);
  if (!match) {
    console.error('No DATABASE_URL found');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: match[1] });
  const sql = fs.readFileSync('/home/ubuntu/Warehause-TEST/prisma/migrations/20261029120000_add_container_lists/migration.sql', 'utf8');
  
  try {
    console.log('Applying additive migration to Neon DB...');
    await pool.query(sql);
    console.log('Migration applied successfully!');
    
    // Also record the migration in _prisma_migrations if table exists
    const checkTable = await pool.query("SELECT to_regclass('_prisma_migrations') as exists;");
    if (checkTable.rows[0].exists) {
      const crypto = require('crypto');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      await pool.query(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)
        ON CONFLICT ("id") DO NOTHING;
      `, ['20261029120000_add_container_lists', checksum, '20261029120000_add_container_lists']);
      console.log('Recorded migration in _prisma_migrations');
    }
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      console.log('Tables already exist, migration safe.');
    } else {
      console.error('Migration error:', err.message);
    }
  } finally {
    await pool.end();
  }
}

run();
