const db = require('../config/db');

// 生成永續報告
exports.generateSustainabilityReport = async (req, res) => {
    try {
        // 1. 基本統計數據
        const { rows: basicStatsRows } = await db.query(`
            SELECT 
                COUNT(*) as total_trees,
                COUNT(DISTINCT species_name) as species_count,
                AVG(tree_height_m) as avg_height,
                AVG(dbh_cm) as avg_dbh,
                SUM(carbon_storage) as total_carbon_storage,
                SUM(carbon_sequestration_per_year) as total_annual_carbon_sequestration
            FROM tree_survey
        `);
        const basicStats = basicStatsRows[0];

        // 2. 物種多樣性分析
        const { rows: speciesDiversity } = await db.query(`
            SELECT 
                species_name,
                COUNT(*) as count,
                (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tree_survey)) as percentage
            FROM tree_survey
            WHERE species_name IS NOT NULL AND species_name != ''
            GROUP BY species_name
            ORDER BY count DESC
        `);

        // 3. 健康狀況分析
        const { rows: healthStatus } = await db.query(`
            SELECT 
                status,
                COUNT(*) as count,
                (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tree_survey)) as percentage
            FROM tree_survey
            WHERE status IS NOT NULL AND status != ''
            GROUP BY status
        `);

        // 4. 徑級分佈
        const { rows: dbhDistribution } = await db.query(`
            SELECT 
                CASE 
                    WHEN dbh_cm < 10 THEN '小於10公分'
                    WHEN dbh_cm BETWEEN 10 AND 20 THEN '10-20公分'
                    WHEN dbh_cm BETWEEN 20 AND 30 THEN '20-30公分'
                    WHEN dbh_cm BETWEEN 30 AND 40 THEN '30-40公分'
                    ELSE '大於40公分'
                END as dbh_range,
                COUNT(*) as count,
                (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tree_survey)) as percentage
            FROM tree_survey
            GROUP BY dbh_range
            ORDER BY MIN(dbh_cm)
        `);

        // 5. 專案區位分析
        const { rows: projectAnalysis } = await db.query(`
            SELECT 
                project_location,
                COUNT(*) as tree_count,
                SUM(carbon_storage) as total_carbon,
                SUM(carbon_sequestration_per_year) as annual_carbon
            FROM tree_survey
            WHERE project_location IS NOT NULL AND project_location != ''
            GROUP BY project_location
        `);

        // 組合報告數據
        const report = {
            basicStats,
            speciesDiversity,
            healthStatus,
            dbhDistribution,
            projectAnalysis,
            generatedAt: new Date().toISOString()
        };

        res.json({
            success: true,
            data: report
        });

    } catch (error) {
        console.error('Error generating sustainability report:', error);
        res.status(500).json({
            success: false,
            error: '生成永續報告時發生錯誤'
        });
    }
}; 