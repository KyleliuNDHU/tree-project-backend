const { Pool } = require('pg');
const dotenv = require('dotenv');

// 載入環境變量
dotenv.config();

// Render 會提供一個 DATABASE_URL 環境變數，pg 套件會自動使用它
// 如果在本地開發，可以在 .env 檔案中設定 DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 如果您的服務器需要 SSL 連接，可以加上這個設定
  // 在 Render 上部署時，通常需要
  ssl: {
    rejectUnauthorized: false
  }
});

// 創建一個查詢函數，pg 的 pool.query 本身就返回 Promise
const query = (sql, params) => {
    return pool.query(sql, params);
};

module.exports = {
    query,
    pool
}; 