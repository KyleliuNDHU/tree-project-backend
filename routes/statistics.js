const express = require('express');
const router = express.Router();
const db = require('../config/db');
const format = require('pg-format');

// 樹木資料統計分析
router.get('/', async (req, res) => {
    let whereClause = '';
    
    if (req.query.areas) {
        const areasList = req.query.areas.split(',').map(area => area.trim()).filter(area => area);
        if (areasList.length > 0) {
            whereClause = format('WHERE project_location IN (%L)', areasList);
        }
    }

    const client = await db.pool.connect();
    try {
        const speciesQuery = `
            SELECT species_name, COUNT(*) as count 
            FROM tree_survey 
            ${whereClause}
            GROUP BY species_name 
            ORDER BY count DESC
        `;

        const projectQuery = `
            SELECT project_name, COUNT(*) as count 
            FROM tree_survey 
            GROUP BY project_name 
            ORDER BY count DESC
        `;

        const areaQuery = `
            SELECT project_location, COUNT(*) as count 
            FROM tree_survey 
            GROUP BY project_location 
            ORDER BY count DESC
        `;

        const sizeQuery = `
            SELECT 
                AVG(tree_height_m) as avg_height,
                MAX(tree_height_m) as max_height,
                MIN(tree_height_m) as min_height,
                AVG(dbh_cm) as avg_dbh,
                MAX(dbh_cm) as max_dbh,
                MIN(dbh_cm) as min_dbh
            FROM tree_survey
            ${whereClause.replace('WHERE', 'WHERE tree_height_m > 0 AND dbh_cm > 0 AND ')}
        `;

        const carbonQuery = `
            SELECT 
                SUM(carbon_storage) as total_carbon,
                AVG(carbon_storage) as avg_carbon,
                SUM(carbon_sequestration_per_year) as total_annual_carbon,
                AVG(carbon_sequestration_per_year) as avg_annual_carbon
            FROM tree_survey
            ${whereClause}
        `;

        const [speciesRes, projectRes, areaRes, sizeRes, carbonRes] = await Promise.all([
            client.query(speciesQuery),
            client.query(projectQuery),
            client.query(areaQuery),
            client.query(sizeQuery.replace(/WHERE\s*AND/, 'WHERE')), // 清理可能的語法問題
            client.query(carbonQuery)
        ]);

        res.json({
            success: true,
            data: {
                species: speciesRes.rows.map(r => ({ "樹種名稱": r.species_name, count: r.count })),
                projects: projectRes.rows.map(r => ({ "專案名稱": r.project_name, count: r.count })),
                areas: areaRes.rows.map(r => ({ "專案區位": r.project_location, count: r.count })),
                sizes: sizeRes.rows[0],
                carbon: carbonRes.rows[0]
            }
        });

    } catch (err) {
        console.error('統計查詢錯誤:', err);
        res.status(500).json({ success: false, message: '取得統計資料時發生錯誤' });
    } finally {
        client.release();
    }
});

module.exports = router;
