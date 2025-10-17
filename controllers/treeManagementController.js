const mysql = require('mysql');
const db = require('../config/db'); // 假設你的資料庫連接設定在 config/db.js

/**
 * @description 生成樹木管理建議並存入資料庫
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.generateManagementActions = async (req, res) => {
    const { project_code, area_name, user_id } = req.body;

    try {
        // 1. 根據 project_code 或 area_name 查詢 tree_survey 中的樹木資料
        let trees = [];
        let query = 'SELECT id, `狀況`, `樹種名稱`, `胸徑（公分）`, `樹高（公尺）` FROM tree_survey';
        const queryParams = [];

        if (project_code) {
            query += ' WHERE `專案代碼` = ?';
            queryParams.push(project_code);
        } else if (area_name) {
            query += ' WHERE `專案區位` = ?';
            queryParams.push(area_name);
        } else {
            return res.status(400).json({ success: false, message: '請提供 project_code 或 area_name' });
        }

        trees = await new Promise((resolve, reject) => {
            db.query(query, queryParams, (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        });

        if (trees.length === 0) {
            return res.status(404).json({ success: false, message: '找不到符合條件的樹木進行分析' });
        }

        const actionsToInsert = [];
        const now = new Date();

        // 2. 根據樹木狀況生成建議 (簡易範例邏輯)
        for (const tree of trees) {
            // 健康維護類建議
            if (tree['狀況'] && tree['狀況'].includes('枯')) {
                actionsToInsert.push({
                    tree_id: tree.id,
                    category: '健康維護',
                    action_text: `樹木 (ID: ${tree.id}, ${tree['樹種名稱']}) 狀況包含「枯」，建議檢查並考慮移除或重點養護。`,
                    is_done: 0,
                    created_by: user_id || null,
                    // due_date: new Date(now.setDate(now.getDate() + 7)) // 預計一週內完成
                });
            }
            if (tree['狀況'] && (tree['狀況'].includes('病') || tree['狀況'].includes('蟲'))) {
                actionsToInsert.push({
                    tree_id: tree.id,
                    category: '健康維護',
                    action_text: `樹木 (ID: ${tree.id}, ${tree['樹種名稱']}) 可能有病蟲害 (狀況: ${tree['狀況']})，建議派員檢查並進行防治。`,
                    is_done: 0,
                    created_by: user_id || null,
                });
            }
            if (tree['胸徑（公分）'] < 10 && tree['胸徑（公分）'] > 0) { // 假設胸徑小於10公分是幼樹
                 actionsToInsert.push({
                    tree_id: tree.id,
                    category: '健康維護',
                    action_text: `樹木 (ID: ${tree.id}, ${tree['樹種名稱']}) 為幼樹 (胸徑: ${tree['胸徑（公分）']}公分)，建議加強撫育，如除草、鬆土。`,
                    is_done: 0,
                    created_by: user_id || null,
                });
            }

            // 碳吸存優化類建議 (範例)
            if (tree['樹高（公尺）'] > 15 ) { // 假設樹高大於15公尺的大樹
                actionsToInsert.push({
                    tree_id: tree.id,
                    category: '碳吸存優化',
                    action_text: `樹木 (ID: ${tree.id}, ${tree['樹種名稱']}) 為大樹 (樹高: ${tree['樹高（公尺）']}公尺)，碳吸存潛力高，請確保其生長空間與健康。`,
                    is_done: 0,
                    created_by: user_id || null,
                });
            }
        }

        if (actionsToInsert.length === 0) {
            return res.status(200).json({ success: true, message: '分析完成，目前無新的管理建議生成。' });
        }

        // 3. 批次插入到 tree_management_actions
        // 注意：mysql Node.js driver 不直接支援多列 VALUES, VALUES, ... 的語法
        // 需要轉換成 [ [val1, val2], [val1, val2] ] 的格式
        const insertQuery = 'INSERT INTO tree_management_actions (tree_id, category, action_text, is_done, created_by) VALUES ?';
        const valuesToInsert = actionsToInsert.map(action => [
            action.tree_id,
            action.category,
            action.action_text,
            action.is_done,
            action.created_by
        ]);

        await new Promise((resolve, reject) => {
            db.query(insertQuery, [valuesToInsert], (err, result) => {
                if (err) return reject(err);
                resolve(result);
            });
        });

        res.status(201).json({ success: true, message: `成功生成並插入 ${actionsToInsert.length} 筆管理建議。`, data: actionsToInsert });

    } catch (error) {
        console.error('生成樹木管理建議時發生錯誤:', error);
        res.status(500).json({ success: false, message: '生成樹木管理建議時發生內部錯誤' });
    }
};

/**
 * @description 獲取樹木管理建議列表
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.getManagementActions = async (req, res) => {
    try {
        const { tree_id, project_code, area_name, is_done, category, limit = 20, offset = 0 } = req.query;
        let query = `
            SELECT tma.*, ts.樹種名稱, ts.專案代碼, ts.專案區位 
            FROM tree_management_actions tma 
            JOIN tree_survey ts ON tma.tree_id = ts.id
            WHERE 1=1
        `;
        const queryParams = [];

        if (tree_id) {
            query += ' AND tma.tree_id = ?';
            queryParams.push(tree_id);
        }
        if (project_code) {
            query += ' AND ts.專案代碼 = ?';
            queryParams.push(project_code);
        }
        if (area_name) {
            query += ' AND ts.專案區位 = ?';
            queryParams.push(area_name);
        }
        if (is_done !== undefined) {
            query += ' AND tma.is_done = ?';
            queryParams.push(is_done === 'true' || is_done === '1' ? 1 : 0);
        }
        if (category) {
            query += ' AND tma.category = ?';
            queryParams.push(category);
        }

        query += ' ORDER BY tma.created_at DESC LIMIT ? OFFSET ?';
        queryParams.push(parseInt(limit), parseInt(offset));

        const actions = await new Promise((resolve, reject) => {
            db.query(query, queryParams, (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        });

        // 獲取總數用於分頁
        let countQuery = query.replace(/SELECT tma.\*.*?FROM/s, 'SELECT COUNT(DISTINCT tma.action_id) as total FROM').replace(/ORDER BY.*?LIMIT.*?OFFSET \?/s, '');
        const countParams = queryParams.slice(0, -2); // 移除 limit 和 offset 的參數
        
        const totalResult = await new Promise((resolve, reject) => {
            db.query(countQuery, countParams, (err, results) => {
                if (err) return reject(err);
                resolve(results[0] ? results[0].total : 0);
            });
        });

        res.json({ success: true, data: actions, total: totalResult, limit: parseInt(limit), offset: parseInt(offset) });

    } catch (error) {
        console.error('獲取樹木管理建議時發生錯誤:', error);
        res.status(500).json({ success: false, message: '獲取樹木管理建議時發生內部錯誤' });
    }
};

/**
 * @description 更新特定樹木管理建議的狀態
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.updateManagementAction = async (req, res) => {
    const { action_id } = req.params;
    const { is_done, action_text, due_date } = req.body; // 可以擴展更新其他欄位

    if (is_done === undefined && action_text === undefined && due_date === undefined) {
        return res.status(400).json({ success: false, message: '請提供要更新的欄位 (is_done, action_text, due_date)' });
    }

    try {
        let updateFields = [];
        let queryParams = [];

        if (is_done !== undefined) {
            updateFields.push('is_done = ?');
            queryParams.push(is_done === true || is_done === 1 ? 1 : 0);
        }
        if (action_text !== undefined) {
            updateFields.push('action_text = ?');
            queryParams.push(action_text);
        }
        if (due_date !== undefined) {
            updateFields.push('due_date = ?');
            queryParams.push(due_date || null);
        }

        if (updateFields.length === 0) {
             return res.status(400).json({ success: false, message: '沒有提供有效的更新欄位' });
        }

        queryParams.push(action_id);
        const query = `UPDATE tree_management_actions SET ${updateFields.join(', ')} WHERE action_id = ?`;

        const result = await new Promise((resolve, reject) => {
            db.query(query, queryParams, (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        });

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '找不到要更新的管理建議' });
        }

        res.json({ success: true, message: '管理建議更新成功' });

    } catch (error) {
        console.error('更新管理建議時發生錯誤:', error);
        res.status(500).json({ success: false, message: '更新管理建議時發生內部錯誤' });
    }
};

/**
 * @description 刪除特定樹木管理建議
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.deleteManagementAction = async (req, res) => {
    const { action_id } = req.params;

    try {
        const query = 'DELETE FROM tree_management_actions WHERE action_id = ?';
        const result = await new Promise((resolve, reject) => {
            db.query(query, [action_id], (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        });

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '找不到要刪除的管理建議' });
        }

        res.json({ success: true, message: '管理建議刪除成功' });

    } catch (error) {
        console.error('刪除管理建議時發生錯誤:', error);
        res.status(500).json({ success: false, message: '刪除管理建議時發生內部錯誤' });
    }
}; 