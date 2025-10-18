const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 從 index_8.js 遷移過來
// 獲取所有樹種列表 (用於前端選擇)
router.get('/species-list', async (req, res) => {
    console.log(`[API] Received GET /api/tree-carbon-data/species-list`);
    try {
        const query = 'SELECT id, common_name_zh FROM tree_carbon_data ORDER BY common_name_zh';
        const { rows } = await db.query(query);
        console.log(`[API Success] Fetched ${rows.length} species.`);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('[API Error] Internal error fetching species list:', error);
        res.status(500).json({ success: false, message: '獲取樹種列表時發生內部錯誤' });
    }
});

// 從 index_8.js 遷移過來
// 獲取選定樹種在特定區域的詳細比較數據
router.post('/species-comparison/details', async (req, res) => {
    const { species_ids, region_code } = req.body;
    console.log(`[API] Received POST /api/species-comparison/details with species_ids: ${JSON.stringify(species_ids)}, region_code: ${region_code}`);

    if (!species_ids || !Array.isArray(species_ids) || species_ids.length === 0) {
        return res.status(400).json({ success: false, message: '請提供有效的 species_ids (樹種ID陣列)' });
    }
    if (!region_code) {
        return res.status(400).json({ success: false, message: '請提供 region_code (區域代碼)' });
    }

    try {
        // PostgreSQL 的 ANY 語法比 IN (...) 更適合處理陣列參數
        const query = `
            SELECT 
                tcd.id AS species_id,
                tcd.common_name_zh,
                tcd.scientific_name,
                (tcd.carbon_absorption_min + tcd.carbon_absorption_max) / 2 AS avg_carbon_absorption,
                srs.score AS region_score,
                tcd.growth_rate,
                (tcd.max_height_min + tcd.max_height_max) / 2 AS max_height_avg,
                (tcd.lifespan_min + tcd.lifespan_max) / 2 AS lifespan_avg,
                tcd.drought_tolerance,
                tcd.salt_tolerance,
                tcd.ecological_value,
                tcd.carbon_efficiency
            FROM 
                tree_carbon_data tcd
            LEFT JOIN 
                species_region_score srs ON tcd.id = srs.species_id AND srs.region_code = $1
            WHERE 
                tcd.id = ANY($2::int[]);
        `;
        
        const queryParams = [region_code, species_ids];
        console.log(`[API Query] Executing SQL with params: ${JSON.stringify(queryParams)}`);

        const { rows: comparisonData } = await db.query(query, queryParams);

        if (comparisonData.length === 0) {
            console.log(`[API Info] No comparison data found for species_ids: ${JSON.stringify(species_ids)} and region_code: ${region_code}`);
            return res.status(404).json({ success: false, message: '找不到指定樹種或區域的比較數據。' });
        }
        
        const formattedData = comparisonData.map(item => ({
            ...item,
            avg_carbon_absorption: parseFloat(item.avg_carbon_absorption?.toFixed(2) ?? 0),
            max_height_avg: parseFloat(item.max_height_avg?.toFixed(2) ?? 0),
            lifespan_avg: parseFloat(item.lifespan_avg?.toFixed(2) ?? 0),
            region_score: item.region_score === null ? 0 : item.region_score
        }));

        console.log(`[API Success] Fetched comparison data: ${JSON.stringify(formattedData)}`);
        res.json({ success: true, data: formattedData });

    } catch (error) {
        console.error('[API Error] Internal error fetching species comparison details:', error);
        res.status(500).json({ success: false, message: '獲取樹種比較數據時發生內部錯誤' });
    }
});


module.exports = router;
