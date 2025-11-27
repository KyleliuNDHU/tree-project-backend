/**
 * 生成知識嵌入向量工具 (Refactored for PostgreSQL)
 * 讀取 tree_carbon_data 資料表中的詳細樹木數據，
 * 使用 OpenAI API 生成嵌入向量，並寫入 tree_knowledge_embeddings_v2 資料庫。
 */
const db = require('../config/db'); // 使用專案統一的 pg 設定
const { getEmbedding } = require('../services/knowledgeEmbeddingService'); // 使用統一的 embedding 服務

const BATCH_SIZE = 5; // 分批處理大小
const DELAY_MS = 1000; // 批次間隔時間

// 垃圾資料過濾器
function isValidData(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  // 過濾明顯的測試資料 (僅保留 test/測試 關鍵字)
  if (lower.includes('test') || lower.includes('測試')) {
    return false;
  }
  return true;
}

// 主要處理函數
async function generateEmbeddings() {
  const client = await db.pool.connect();
  try {
    console.log('開始從 tree_carbon_data 讀取資料並生成細粒度 embeddings...');

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
    
    const { rows: trees } = await client.query(query);

    if (!trees || trees.length === 0) {
      console.log('tree_carbon_data 表中沒有資料可處理。');
      return;
    }

    console.log(`從 tree_carbon_data 讀取到 ${trees.length} 筆樹種資料。`);

    let totalEmbeddingsGenerated = 0;

    // 分批處理
    for (let i = 0; i < trees.length; i += BATCH_SIZE) {
      const batch = trees.slice(i, i + BATCH_SIZE);
      console.log(`Processing tree data batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(trees.length / BATCH_SIZE)}...`);

      await Promise.all(batch.map(async (tree) => {
        // 基礎資料檢查
        if (!isValidData(tree.common_name_zh)) {
            console.log(`Skipping invalid/test data: ${tree.common_name_zh}`);
            return;
        }

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
        
        // console.log(`[INFO] 樹種 ID: ${tree.id} (${commonName}) - 準備生成 ${knowledgeFragments.length} 個知識片段。`);

        for (const fragment of knowledgeFragments) {
            if (!fragment.text_content || fragment.text_content.trim() === '') continue;

            // 檢查是否已經存在 (避免重複生成浪費錢)
            const existCheck = await client.query(
                'SELECT id FROM tree_knowledge_embeddings_v2 WHERE source_type = $1 AND internal_source_record_id = $2 AND original_source_title = $3',
                ['INTERNAL_DB_TREE_CARBON', tree.id.toString(), fragment.original_source_title]
            );

            if (existCheck.rows.length > 0) {
                // console.log(`  [Skip] 已存在: ${fragment.original_source_title}`);
                continue;
            }

            const embeddingVector = await getEmbedding(fragment.text_content);

            if (embeddingVector) {
            totalEmbeddingsGenerated++;
            const vectorBuffer = JSON.stringify(embeddingVector); // PG 使用 TEXT 存儲 JSON

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
                VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                ON CONFLICT (source_type, internal_source_record_id) 
                DO UPDATE SET 
                  text_content = EXCLUDED.text_content,
                  summary_cn = EXCLUDED.summary_cn, 
                  embedding = EXCLUDED.embedding, 
                  original_source_title = EXCLUDED.original_source_title,
                  updated_at = CURRENT_TIMESTAMP
            `; // Using PG specific ON CONFLICT syntax instead of MySQL ON DUPLICATE KEY UPDATE
            // FIX: We need to make the internal_source_record_id UNIQUE for each chunk.
            // Format: "tree_id#chunk_index" e.g. "1#0", "1#1".
            
            const values = [
                'INTERNAL_DB_TREE_CARBON', 
                'tree_carbon_data', 
                `${tree.id}#${totalEmbeddingsGenerated}`, // Make record_id unique per chunk
                fragment.text_content, 
                fragment.text_content, 
                vectorBuffer,
                fragment.original_source_title
            ];
            
            await client.query(insertQuery, values);
            } else {
            console.warn(`無法為樹種ID ${tree.id} (${commonName}) 的片段 "${fragment.original_source_title}" 生成 embedding，已跳過。`);
            }
        }
      }));

      // Delay between batches
      if (i + BATCH_SIZE < trees.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }
    console.log(`所有 tree_carbon_data 資料已處理完畢。總共生成並寫入 ${totalEmbeddingsGenerated} 個細粒度嵌入向量。`);

  } catch (error) {
    console.error('處理 tree_carbon_data 時發生嚴重錯誤:', error);
  } finally {
    client.release();
    if (require.main === module) {
        db.pool.end(); // 只有在直接執行時才關閉 pool
        process.exit(0);
    }
  }
}

// 允許直接執行
if (require.main === module) {
    generateEmbeddings();
}

module.exports = generateEmbeddings; 