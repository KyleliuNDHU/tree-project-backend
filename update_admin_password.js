const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const readline = require('readline');

// 載入環境變量
dotenv.config();

const dbPassword = process.env.DB_PASSWORD;
if (!dbPassword) {
    console.error('錯誤：DB_PASSWORD 環境變數未設定。請在 .env 檔案中設定。');
    process.exit(1);
}

// 新增 readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function updateAdminPassword() {
  // 資料庫連接配置
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    database: process.env.DB_NAME || 'tree_survey_db'
  });

  try {
    rl.question('請輸入要更新密碼的用戶名 (預設: admin): ', async (usernameInput) => {
        const username = usernameInput.trim() || 'admin'; // 如果未輸入，則使用 admin

        rl.question(`請為用戶 "${username}" 設定新的密碼: `, async (newPassword) => {
            if (!newPassword || newPassword.trim() === '') {
                console.error('錯誤：新密碼不能為空。');
                rl.close();
                await connection.end();
                return;
            }

            // 使用 bcrypt 生成新的密碼雜湊
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(newPassword, saltRounds);

            // SQL 更新語句
            const sql = `
              UPDATE users 
              SET password_hash = ?
              WHERE username = ?
            `;

            // 執行 SQL
            const [result] = await connection.execute(sql, [passwordHash, username]);
            
            if (result.affectedRows > 0) {
                console.log(`用戶 "${username}" 的密碼更新成功！請使用新設定的密碼。`);
            } else {
                console.log(`未找到用戶名為 "${username}" 的帳號，或密碼未變更。`);
            }
            rl.close(); // 關閉 readline 介面
            await connection.end(); // 在所有操作完成後關閉連接
        });
    });
  } catch (error) {
    console.error('更新管理員密碼時發生錯誤：', error);
    // 如果 try 塊本身發生同步錯誤，確保 readline 和連接關閉
    rl.close();
    if (connection && connection.end) { // 確保 connection 已定義
        await connection.end();
    }
  } finally {
    // await connection.end(); // 主要的關閉邏輯已移至 rl.question 的回調中
  }
}

// 執行函數
updateAdminPassword(); 