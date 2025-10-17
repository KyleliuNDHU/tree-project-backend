const db = require('../config/database');

// 生成永續報告
exports.generateSustainabilityReport = async (req, res) => {
    try {
        // 1. 基本統計數據
        const basicStats = await db.query(`
            SELECT 
                COUNT(*) as total_trees,
                COUNT(DISTINCT 樹種名稱) as species_count,
                AVG(樹高（公尺）) as avg_height,
                AVG(胸徑（公分）) as avg_dbh,
                SUM(碳儲存量) as total_carbon_storage,
                SUM(推估年碳吸存量) as total_annual_carbon_sequestration
            FROM tree_survey
        `);

        // 2. 物種多樣性分析
        const speciesDiversity = await db.query(`
            SELECT 
                樹種名稱,
                COUNT(*) as count,
                (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tree_survey)) as percentage
            FROM tree_survey
            GROUP BY 樹種名稱
            ORDER BY count DESC
        `);

        // 3. 健康狀況分析
        const healthStatus = await db.query(`
            SELECT 
                狀況,
                COUNT(*) as count,
                (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tree_survey)) as percentage
            FROM tree_survey
            GROUP BY 狀況
        `);

        // 4. 徑級分佈
        const dbhDistribution = await db.query(`
            SELECT 
                CASE 
                    WHEN 胸徑（公分） < 10 THEN '小於10公分'
                    WHEN 胸徑（公分） BETWEEN 10 AND 20 THEN '10-20公分'
                    WHEN 胸徑（公分） BETWEEN 20 AND 30 THEN '20-30公分'
                    WHEN 胸徑（公分） BETWEEN 30 AND 40 THEN '30-40公分'
                    ELSE '大於40公分'
                END as dbh_range,
                COUNT(*) as count,
                (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tree_survey)) as percentage
            FROM tree_survey
            GROUP BY dbh_range
            ORDER BY MIN(胸徑（公分）)
        `);

        // 5. 專案區位分析
        const projectAnalysis = await db.query(`
            SELECT 
                專案區位,
                COUNT(*) as tree_count,
                SUM(碳儲存量) as total_carbon,
                SUM(推估年碳吸存量) as annual_carbon
            FROM tree_survey
            GROUP BY 專案區位
        `);

        // 組合報告數據
        const report = {
            basicStats: basicStats[0],
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