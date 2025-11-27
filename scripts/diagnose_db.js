const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function diagnose() {
  const client = await pool.connect();
  try {
    console.log('=== DB DIAGNOSIS START ===');
    
    // 1. 檢查當前連接的資料庫名稱
    const dbNameRes = await client.query('SELECT current_database()');
    console.log('Connected to DB:', dbNameRes.rows[0].current_database);

    // 2. 檢查 tree_survey 表的所有欄位
    const columnsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tree_survey'
      ORDER BY ordinal_position;
    `);
    
    console.log('Columns in tree_survey:');
    columnsRes.rows.forEach(row => {
      console.log(` - ${row.column_name} (${row.data_type})`);
    });

    // 3. 特別檢查 project_id 是否存在
    const hasProjectId = columnsRes.rows.some(r => r.column_name === 'project_id');
    console.log('Has project_id column?', hasProjectId ? 'YES' : 'NO');

    console.log('=== DB DIAGNOSIS END ===');
  } catch (err) {
    console.error('Diagnosis failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

diagnose();

