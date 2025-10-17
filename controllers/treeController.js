const db = require('../config/database');

// 獲取樹木統計數據
async function getTreeStatistics() {
    return new Promise((resolve, reject) => {
        // 查詢樹木總數
        db.query('SELECT COUNT(*) as total_trees FROM tree_survey', (err, totalTreesResult) => {
            if (err) {
                console.error('獲取樹木數量錯誤:', err);
                return resolve({
                    total_trees: 0,
                    total_carbon_storage: 0,
                    total_annual_carbon: 0,
                    avg_height: 0,
                    avg_dbh: 0
                });
            }
            
            // 查詢碳儲存量總和與平均
            db.query(`
                SELECT 
                    SUM(碳儲存量) as total_carbon_storage,
                    AVG(碳儲存量) as avg_carbon_storage,
                    SUM(推估年碳吸存量) as total_annual_carbon,
                    AVG(推估年碳吸存量) as avg_annual_carbon
                FROM tree_survey
            `, (err, carbonResult) => {
                if (err) {
                    console.error('獲取碳儲存量錯誤:', err);
                    return resolve({
                        total_trees: totalTreesResult[0].total_trees,
                        total_carbon_storage: 0,
                        total_annual_carbon: 0,
                        avg_height: 0,
                        avg_dbh: 0
                    });
                }
                
                // 查詢樹高和胸徑平均值
                db.query(`
                    SELECT 
                        AVG(樹高（公尺）) as avg_height,
                        AVG(胸徑（公分）) as avg_dbh
                    FROM tree_survey
                `, (err, sizeResult) => {
                    if (err) {
                        console.error('獲取樹木尺寸錯誤:', err);
                        return resolve({
                            total_trees: totalTreesResult[0].total_trees,
                            total_carbon_storage: carbonResult[0].total_carbon_storage,
                            total_annual_carbon: carbonResult[0].total_annual_carbon,
                            avg_height: 0,
                            avg_dbh: 0
                        });
                    }
                    
                    // 返回統計數據
                    resolve({
                        total_trees: totalTreesResult[0].total_trees,
                        total_carbon_storage: carbonResult[0].total_carbon_storage,
                        total_annual_carbon: carbonResult[0].total_annual_carbon,
                        avg_height: sizeResult[0].avg_height,
                        avg_dbh: sizeResult[0].avg_dbh
                    });
                });
            });
        });
    });
}

// 獲取特定區域的樹木統計數據
function getTreeStatisticsByArea(area) {
    return new Promise((resolve, reject) => {
        // 構建SQL查詢條件
        const whereClause = area ? 'WHERE 專案區位 = ?' : '';
        const params = area ? [area] : [];
        
        // 查詢樹木總數
        db.query(`
            SELECT COUNT(*) as total_trees 
            FROM tree_survey 
            ${whereClause}
        `, params, (err, totalTreesResult) => {
            if (err) {
                console.error('獲取區域樹木數量錯誤:', err);
                return resolve({
                    area: area || '全部區域',
                    total_trees: 0,
                    total_carbon_storage: 0,
                    total_annual_carbon: 0
                });
            }
            
            // 查詢碳儲存量總和與平均
            db.query(`
                SELECT 
                    SUM(碳儲存量) as total_carbon_storage,
                    AVG(碳儲存量) as avg_carbon_storage,
                    SUM(推估年碳吸存量) as total_annual_carbon,
                    AVG(推估年碳吸存量) as avg_annual_carbon
                FROM tree_survey
                ${whereClause}
            `, params, (err, carbonResult) => {
                if (err) {
                    console.error('獲取區域碳儲存量錯誤:', err);
                    return resolve({
                        area: area || '全部區域',
                        total_trees: totalTreesResult[0].total_trees,
                        total_carbon_storage: 0,
                        total_annual_carbon: 0
                    });
                }
                
                // 返回統計數據
                resolve({
                    area: area || '全部區域',
                    total_trees: totalTreesResult[0].total_trees,
                    total_carbon_storage: carbonResult[0].total_carbon_storage,
                    total_annual_carbon: carbonResult[0].total_annual_carbon
                });
            });
        });
    });
}

module.exports = {
    getTreeStatistics,
    getTreeStatisticsByArea
}; 