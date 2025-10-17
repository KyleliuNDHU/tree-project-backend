/**
 * 生成知識嵌入向量工具
 * 讀取 tree_knowledge_data.js 中的樹木知識，
 * 使用 OpenAI API 生成嵌入向量，並寫入資料庫。
 */
const mysql = require('mysql');
const { OpenAI } = require('openai');
const path = require('path'); 

// 正確的 dotenv 配置，使用相對路徑，並確保 path 模組已引入（儘管此處未直接使用 path.resolve）
require('dotenv').config({ path: '../.env' }); 

const apiKey = process.env.OPENAI_API_KEY;

// 初始化 OpenAI
const openai = new OpenAI({
  apiKey: apiKey // 使用從環境變數讀取的 API 金鑰
});

// 連接到資料庫
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) {
    console.error('資料庫連接失敗:', err);
    process.exit(1);
  }
  console.log('已連接到資料庫');
  processKnowledgeData();
});

// 生成嵌入向量的函數
async function getEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large', // 確保使用 OpenAI V3 embedding 模型
      input: text
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error('生成 OpenAI embedding 時發生錯誤:', err.message);
    if (err.response) {
      console.error('OpenAI API 錯誤詳情:', err.response.data);
    }
    return null;
  }
}

// 主要處理函數
async function processKnowledgeData() {
  try {
    console.log('開始從 tree_carbon_data 讀取資料並生成細粒度 embeddings...');

    // **步驟 1: 清除舊的 INTERNAL_DB_TREE_CARBON 記錄 (已註釋掉)**
    /*
    console.log('正在清除 tree_knowledge_embeddings_v2 表中舊的樹種碳數據相關嵌入向量...');
    await new Promise((resolve, reject) => {
      db.query("DELETE FROM tree_knowledge_embeddings_v2 WHERE source_type = 'INTERNAL_DB_TREE_CARBON'", (err, result) => {
        if (err) {
          console.error('清除舊嵌入向量時發生錯誤:', err);
          return reject(err);
        }
        console.log(`成功清除 ${result.affectedRows} 條舊記錄。`);
        resolve(result);
      });
    });
    */

    const query = `
      SELECT 
        id, 
        common_name_zh, 
        scientific_name, 
        carbon_absorption_min, 
        carbon_absorption_max, 
        growth_rate, 
        carbon_efficiency,
        climate_conditions, 
        notes,
        north_taiwan,
        central_taiwan,
        south_taiwan,
        east_taiwan,
        coastal_area,
        mountain_area,
        urban_area,
        wood_density_min, wood_density_max,
        lifespan_min, lifespan_max,
        max_height_min, max_height_max,
        drought_tolerance, wet_tolerance, salt_tolerance, pollution_resistance,
        soil_types,
        economic_value,
        ecological_value
      FROM tree_carbon_data
    `;
    
    const trees = await new Promise((resolve, reject) => {
      db.query(query, (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

    if (!trees || trees.length === 0) {
      console.log('tree_carbon_data 表中沒有資料可處理。');
      return;
    }

    console.log(`從 tree_carbon_data 讀取到 ${trees.length} 筆樹種資料。`);

    let totalEmbeddingsGenerated = 0;

    for (const tree of trees) {
      const knowledgeFragments = [];
      const commonName = tree.common_name_zh || '該樹種';
      const scientificName = tree.scientific_name ? `(${tree.scientific_name})` : '';

      // 片段1: 碳吸存與效率
      if (tree.carbon_absorption_min !== null && tree.carbon_absorption_max !== null && tree.carbon_efficiency) {
        knowledgeFragments.push({
          text_content: `${commonName}${scientificName}的年碳吸存量約為 ${tree.carbon_absorption_min} 至 ${tree.carbon_absorption_max} 公斤。其碳吸收效率評估為：${tree.carbon_efficiency}。`,
          original_source_title: `${commonName} - 碳吸存特性`
        });
      }

      // 片段2: 生長速率與壽命
      let growthLifespanText = '';
      if (tree.growth_rate) growthLifespanText += `${commonName}${scientificName}的生長速率為${tree.growth_rate}。`;
      if (tree.lifespan_min !== null && tree.lifespan_max !== null) growthLifespanText += `${commonName}預期壽命約 ${tree.lifespan_min}-${tree.lifespan_max}年。`;
      else if (tree.lifespan_min !== null) growthLifespanText += `${commonName}預期壽命至少${tree.lifespan_min}年。`;
      if (tree.max_height_min !== null && tree.max_height_max !== null) growthLifespanText += `${commonName}平均最大樹高可達 ${(tree.max_height_min + tree.max_height_max)/2} 公尺。`;
      if (growthLifespanText) {
        knowledgeFragments.push({
          text_content: growthLifespanText.trim(),
          original_source_title: `${commonName} - 生長與壽命`
        });
      }

      // 片段3: 適宜氣候與分佈
      let climateDistributionText = '';
      if (tree.climate_conditions) climateDistributionText += `${commonName}${scientificName}適合生長的氣候條件是${tree.climate_conditions}。`;
      let suitableAreas = [];
      if (tree.north_taiwan) suitableAreas.push('台灣北部');
      if (tree.central_taiwan) suitableAreas.push('台灣中部');
      if (tree.south_taiwan) suitableAreas.push('台灣南部');
      if (tree.east_taiwan) suitableAreas.push('台灣東部');
      if (suitableAreas.length > 0) climateDistributionText += `${commonName}主要分佈於${suitableAreas.join('、')}。`;
      if (climateDistributionText) {
        knowledgeFragments.push({
          text_content: climateDistributionText.trim(),
          original_source_title: `${commonName} - 適宜氣候與分佈`
        });
      }
      
      // 片段4: 區域適應性
      let areaTypes = [];
      if (tree.coastal_area) areaTypes.push('沿海地區');
      if (tree.mountain_area) areaTypes.push('山區');
      if (tree.urban_area) areaTypes.push('都市地區');
      if (areaTypes.length > 0) {
        knowledgeFragments.push({
          text_content: `${commonName}${scientificName}也適合種植於${areaTypes.join('、')}。`,
          original_source_title: `${commonName} - 區域適應性`
        });
      }

      // 片段5: 環境耐受性
      let toleranceText = '';
      if (tree.drought_tolerance) toleranceText += `耐旱性：${tree.drought_tolerance}；`;
      if (tree.wet_tolerance) toleranceText += `耐濕性：${tree.wet_tolerance}；`;
      if (tree.salt_tolerance) toleranceText += `耐鹽性：${tree.salt_tolerance}；`;
      if (tree.pollution_resistance) toleranceText += `抗污染能力：${tree.pollution_resistance}。`;
      if (toleranceText) {
        knowledgeFragments.push({
          text_content: `${commonName}${scientificName}的環境耐受性表現為：${toleranceText.trim().replace(/；$/, '.')}`,
          original_source_title: `${commonName} - 環境耐受性`
        });
      }

      // 片段6: 土壤偏好
      if (tree.soil_types) {
        knowledgeFragments.push({
          text_content: `${commonName}${scientificName}適合的土壤類型包括：${tree.soil_types}。`,
          original_source_title: `${commonName} - 土壤偏好`
        });
      }

      // 片段7: 經濟價值
      if (tree.economic_value) {
        knowledgeFragments.push({
          text_content: `${commonName}${scientificName}的經濟價值評估為：${tree.economic_value}。`,
          original_source_title: `${commonName} - 經濟價值`
        });
      }

      // 片段8: 生態價值與備註
      let ecoNotesText = '';
      if (tree.ecological_value) ecoNotesText += `${commonName}${scientificName}的生態價值評估為：${tree.ecological_value}。`;
      if (tree.notes) ecoNotesText += `補充說明：${tree.notes}`;
      if (ecoNotesText) {
        knowledgeFragments.push({
          text_content: ecoNotesText.trim(),
          original_source_title: `${commonName} - 生態價值與備註`
        });
      }
      
      console.log(`[INFO] 樹種 ID: ${tree.id} (${commonName}) - 準備生成 ${knowledgeFragments.length} 個知識片段。`);

      for (const fragment of knowledgeFragments) {
        if (!fragment.text_content || fragment.text_content.trim() === '') continue;

        // console.log(`  [Sub-INFO] 片段標題: ${fragment.original_source_title}, 內容長度: ${fragment.text_content.length}`);
        const embeddingVector = await getEmbedding(fragment.text_content);

        if (embeddingVector) {
          totalEmbeddingsGenerated++;
          const vectorBuffer = Buffer.from(JSON.stringify(embeddingVector));

          const insertQuery = `
            INSERT INTO tree_knowledge_embeddings_v2 (
              source_type, 
              internal_source_table_name, 
              internal_source_record_id, 
              text_content, 
              summary_cn, 
              embedding, 
              original_source_title,
              updated_at
            ) 
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE 
              text_content = VALUES(text_content),
              summary_cn = VALUES(summary_cn), 
              embedding = VALUES(embedding), 
              original_source_title = VALUES(original_source_title),
              updated_at = CURRENT_TIMESTAMP
          `; // Note: ON DUPLICATE KEY UPDATE might behave unexpectedly if we intend to insert multiple fragments for the same tree.id as truly new rows.
             // For now, this would UPDATE existing rows if a combination of unique keys matched. 
             // Since id is auto-increment and primary, it will always insert new rows UNLESS we had another unique key on (internal_source_record_id, original_source_title) for example.
             // Given current structure, this will insert new rows for each fragment.
          
          const values = [
              'INTERNAL_DB_TREE_CARBON', 
              'tree_carbon_data', 
              tree.id.toString(), 
              fragment.text_content, 
              fragment.text_content, // Using full text_content as summary_cn for these fine-grained fragments
              vectorBuffer,
              fragment.original_source_title
          ];
          
          await new Promise((resolve, reject) => {
            db.query(insertQuery, values, (err, result) => {
              if (err) {
                console.error(`寫入細粒度 embedding 到資料庫 v2 失敗 (樹種ID: ${tree.id}, 片段: ${fragment.original_source_title}):`, err);
                return reject(err);
              }
              // console.log(`    [Sub-SUCCESS] 已成功寫入樹種 ID: ${tree.id}, 片段: ${fragment.original_source_title}`);
              resolve(result);
            });
          });
        } else {
          console.warn(`無法為樹種ID ${tree.id} (${commonName}) 的片段 "${fragment.original_source_title}" 生成 embedding，已跳過。`);
        }
      }
    }
    console.log(`所有 tree_carbon_data 資料已處理完畢。總共生成並嘗試寫入 ${totalEmbeddingsGenerated} 個細粒度嵌入向量。`);

  } catch (error) {
    console.error('處理 tree_carbon_data 時發生嚴重錯誤:', error);
  } finally {
    db.end((err) => {
      if (err) {
        console.error('關閉資料庫連接時發生錯誤:', err);
      } else {
        console.log('資料庫連接已關閉。');
      }
    });
  }
}

// 處理未捕獲的異常
process.on('unhandledRejection', (reason, promise) => {
  console.error('未處理的 Promise 拒絕:', reason);
  db.end();
  process.exit(1);
}); 