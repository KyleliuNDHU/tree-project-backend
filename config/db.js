// 為了統一管理，這個檔案將會直接導出 database.js 的連接池
// 這樣可以確保整個應用程式使用同一個連接池實例
const { pool } = require('./database');

console.log('Config/DB: 已載入共享的 PostgreSQL 連接池。');

module.exports = pool;