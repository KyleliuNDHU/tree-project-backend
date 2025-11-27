// require('dotenv').config({ path: '../.env' }); // Removed to use centralized config
const db = require('../config/db'); // *** Changed to use pg pool ***

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
  '中高': 0.15, 
  '中等': 0,
  '中低': -0.25,
  '低': -0.5
};


async function populateScores() {
  const client = await db.pool.connect();
  try {
    console.log('已連接到資料庫 (PG)');

    // 1. 清空舊資料
    await client.query('DELETE FROM species_region_score');
        console.log('已清空 species_region_score 表格');

    // 2. 讀取 tree_carbon_data 並 JOIN tree_species 以獲取正確的 species_id (varchar)
    const speciesDataQuery = `
      SELECT 
        tcd.*, 
        ts.id as tree_species_varchar_id
      FROM 
        tree_carbon_data tcd
      JOIN 
        tree_species ts ON tcd.common_name_zh = ts.name;
    `; // Removed COLLATE utf8mb4_unicode_ci as PG usually handles utf8 fine, but if collation issues arise, adjust DB
    
    const speciesResult = await client.query(speciesDataQuery);
    const speciesData = speciesResult.rows;

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

          // 插入資料庫 (PG parameter syntax $1, $2, $3)
          const insertQuery = 'INSERT INTO species_region_score (species_id, region_code, score) VALUES ($1, $2, $3)';
          await client.query(insertQuery, [speciesVarcharId, region.code, finalScore]);
              insertedCount++;
        }
      }
    }

    console.log(`成功為 species_region_score 表格插入 ${insertedCount} 筆評分資料`);

  } catch (error) {
    console.error('填充 species_region_score 時發生錯誤:', error);
  } finally {
    client.release();
    if (require.main === module) {
        db.pool.end();
    }
  }
}

if (require.main === module) {
populateScores(); 
}

module.exports = populateScores; 
// populateScores(); // Removed automatic execution on require to prevent double run when imported by migrate.js 