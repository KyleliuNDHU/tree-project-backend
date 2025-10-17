require('dotenv').config({ path: '../.env' }); // 指定 .env 檔案的路徑
const mysql = require('mysql');

// 資料庫連接設定
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Enum 到分數的映射
const carbonEfficiencyScores = {
  '極高': 1,
  '高': 0.5,
  '中高': 0.25,
  '中等': 0,
  '中低': -0.25,
  '低': -0.5
};

const growthRateScores = {
  '極快': 1,
  '快': 0.5,
  '中快': 0.25,
  '中等': 0,
  '中慢': -0.25,
  '慢': -0.5
};

const ecologicalValueScores = {
  '極高': 0.5,
  '高': 0.25,
  '中高': 0.15, // 新增 '中高' 的評分
  '中等': 0,
  '中低': -0.25,
  '低': -0.5
};


async function populateScores() {
  try {
    // await db.connect(); // connect 方法不返回 Promise，應使用回調或事件
    await new Promise((resolve, reject) => {
        db.connect(err => {
            if (err) return reject(err);
            resolve();
        });
    });
    console.log('已連接到資料庫');

    // 1. 清空舊資料
    await new Promise((resolve, reject) => {
      db.query('DELETE FROM species_region_score', (err, result) => {
        if (err) return reject(err);
        console.log('已清空 species_region_score 表格');
        resolve(result);
      });
    });

    // 2. 讀取 tree_carbon_data 並 JOIN tree_species 以獲取正確的 species_id (varchar)
    //    在 JOIN 條件中指定校對規則以避免 ER_CANT_AGGREGATE_2COLLATIONS 錯誤
    const speciesDataQuery = `
      SELECT 
        tcd.*, 
        ts.id as tree_species_varchar_id
      FROM 
        tree_carbon_data tcd
      JOIN 
        tree_species ts ON tcd.common_name_zh = ts.name COLLATE utf8mb4_unicode_ci;
    `;
    const speciesData = await new Promise((resolve, reject) => {
      db.query(speciesDataQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

    console.log(`從 tree_carbon_data 和 tree_species 讀取到 ${speciesData.length} 筆有效的樹種資料`);

    let insertedCount = 0;
    const regionMappings = [
      { flag: 'north_taiwan', code: 'NORTH' },
      { flag: 'central_taiwan', code: 'CENTRAL' },
      { flag: 'south_taiwan', code: 'SOUTH' },
      { flag: 'east_taiwan', code: 'EAST' },
      { flag: 'coastal_area', code: 'COASTAL' },
      { flag: 'mountain_area', code: 'MOUNTAIN' },
      { flag: 'urban_area', code: 'URBAN' }
    ];

    for (const species of speciesData) {
      // 使用從 tree_species 表獲取的 varchar ID
      const speciesVarcharId = species.tree_species_varchar_id; 

      if (!speciesVarcharId) {
        console.warn(`警告: 樹種 ${species.common_name_zh} (tree_carbon_data.id: ${species.id}) 在 tree_species 表中找不到對應的 ID，將跳過此樹種。`);
        continue;
      }

      for (const region of regionMappings) {
        if (species[region.flag] === 1 || species[region.flag] === true) {
          let baseScore = 3; // 基礎分，如果適用於該區域
          let score = baseScore;

          // 修飾因子
          score += carbonEfficiencyScores[species.carbon_efficiency] || 0;
          score += growthRateScores[species.growth_rate] || 0;
          score += ecologicalValueScores[species.ecological_value] || 0;
          
          // 將評分限制在 1-5 之間，並四捨五入到小數點後一位
          let finalScore = Math.round(Math.max(1, Math.min(5, score)) * 10) / 10;

          // 插入資料庫
          const insertQuery = 'INSERT INTO species_region_score (species_id, region_code, score) VALUES (?, ?, ?)';
          await new Promise((resolve, reject) => {
            db.query(insertQuery, [speciesVarcharId, region.code, finalScore], (err, result) => {
              if (err) {
                // 即使有錯誤，也打印 speciesVarcharId 以便追蹤
                console.error(`插入錯誤: species_id (varchar)=${speciesVarcharId}, tree_carbon_data.id=${species.id}, region_code=${region.code}`, err.message);
                return reject(err); 
              }
              insertedCount++;
              resolve(result);
            });
          });
        }
      }
    }

    console.log(`成功為 species_region_score 表格插入 ${insertedCount} 筆評分資料`);

  } catch (error) {
    console.error('填充 species_region_score 時發生錯誤:', error);
  } finally {
    if (db && db.state !== 'disconnected') {
        db.end(err => {
            if(err) console.error('關閉資料庫連接時發生錯誤:', err);
            else console.log('資料庫連接已關閉');
        });
    }
  }
}

populateScores(); 