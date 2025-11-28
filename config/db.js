const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10 // 最大連接數，避免連線過多
});

pool.on('connect', () => {
  console.log('成功連接到 PostgreSQL 資料庫！');
});

pool.on('error', (err) => {
  console.error('資料庫連接發生非預期錯誤:', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};