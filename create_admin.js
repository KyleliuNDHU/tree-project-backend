const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const readline = require('readline');

// 載入環境變量
dotenv.config();

const dbPassword = process.env.DB_PASSWORD;
if (dbPassword === undefined) {
    console.error('錯誤：DB_PASSWORD 環境變數未設定。請在 .env 檔案中設定。');
    process.exit(1);
}

// 新增 readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function createAdminUser() {
  // 資料庫連接配置
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'tree_survey_db'
  });

  try {
    // 使用 bcrypt 生成密碼雜湊
    // const password = '12345'; // 移除硬編碼密碼

    rl.question('請為管理員帳號 "admin" 設定一個新密碼: ', async (password) => {
        if (!password || password.trim() === '') {
            console.error('錯誤：密碼不能為空。');
            rl.close();
            await connection.end();
            return;
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // SQL 插入語句
        const sql = `
          INSERT INTO users (
            username,
            password_hash,
            display_name,
            role,
            associated_projects
          ) VALUES (
            'admin',
            ?,
            '維護測試',
            '系統管理員',
            '3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25,26,27,36,48,51,52,53,54,55,57,60,61'
          )
        `;

        // 執行 SQL
        const [result] = await connection.execute(sql, [passwordHash]);
        console.log('管理員帳號 "admin" 創建成功！請使用您剛剛設定的密碼登入。');
        // console.log('插入ID:', result.insertId); // 可選保留，用於調試
        // console.log('密碼雜湊值:', passwordHash); // 不應在生產或交付腳本中顯示雜湊
        // console.log('登入資訊：');
        // console.log('帳號：admin');
        // console.log('密碼：12345'); // 移除明文密碼輸出
        rl.close(); // 關閉 readline 介面
    });
  } catch (error) {
    console.error('創建管理員帳號時發生錯誤：', error);
  } finally {
    // await connection.end(); // 改到 readline 回調中關閉
  }
}

// 執行函數
createAdminUser(); 