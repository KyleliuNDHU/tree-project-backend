const db = require('../config/db');

/**
 * @description 生成樹木管理建議並存入資料庫
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.generateManagementActions = async (req, res) => {
    const { project_code, area_name, user_id } = req.body;

    try {
        // 1. 根據 project_code 或 area_name 查詢 tree_survey 中的樹木資料
        let query = 'SELECT id, "status", "species_name", "dbh_cm", "tree_height_m" FROM tree_survey';
        const queryParams = [];

        if (project_code) {
            query += ' WHERE "project_code" = $1';
            queryParams.push(project_code);
        } else if (area_name) {
            query += ' WHERE "project_location" = $1';
            queryParams.push(area_name);
        } else {
            return res.status(400).json({ success: false, message: '請提供 project_code 或 area_name' });
        }

        const { rows: trees } = await db.query(query, queryParams);

        if (trees.length === 0) {
            return res.status(404).json({ success: false, message: '找不到符合條件的樹木進行分析' });
        }

        const actionsToInsert = [];
        
        // 2. 根據樹木狀況生成建議
        for (const tree of trees) {
            if (tree.status && tree.status.includes('枯')) {
                actionsToInsert.push({
                    tree_id: tree.id,
                    category: '健康維護',
                    action_text: `樹木 (ID: ${tree.id}, ${tree.species_name}) 狀況包含「枯」，建議檢查並考慮移除或重點養護。`,
                    is_done: false,
                    created_by: user_id || null,
                });
            }
            if (tree.status && (tree.status.includes('病') || tree.status.includes('蟲'))) {
                actionsToInsert.push({
                    tree_id: tree.id,
                    category: '健康維護',
                    action_text: `樹木 (ID: ${tree.id}, ${tree.species_name}) 可能有病蟲害 (狀況: ${tree.status})，建議派員檢查並進行防治。`,
                    is_done: false,
                    created_by: user_id || null,
                });
            }
            if (tree.dbh_cm < 10 && tree.dbh_cm > 0) { // 假設胸徑小於10公分是幼樹
                 actionsToInsert.push({
                    tree_id: tree.id,
                    category: '健康維護',
                    action_text: `樹木 (ID: ${tree.id}, ${tree.species_name}) 為幼樹 (胸徑: ${tree.dbh_cm}公分)，建議加強撫育，如除草、鬆土。`,
                    is_done: false,
                    created_by: user_id || null,
                });
            }
            if (tree.tree_height_m > 15 ) { // 假設樹高大於15公尺的大樹
                actionsToInsert.push({
                    tree_id: tree.id,
                    category: '碳吸存優化',
                    action_text: `樹木 (ID: ${tree.id}, ${tree.species_name}) 為大樹 (樹高: ${tree.tree_height_m}公尺)，碳吸存潛力高，請確保其生長空間與健康。`,
                    is_done: false,
                    created_by: user_id || null,
                });
            }
        }

        if (actionsToInsert.length === 0) {
            return res.status(200).json({ success: true, message: '分析完成，目前無新的管理建議生成。' });
        }

        // 3. 批次插入到 tree_management_actions
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            const insertQuery = 'INSERT INTO tree_management_actions (tree_id, category, action_text, is_done, created_by) VALUES ($1, $2, $3, $4, $5)';
            for (const action of actionsToInsert) {
                await client.query(insertQuery, [action.tree_id, action.category, action.action_text, action.is_done, action.created_by]);
            }
            await client.query('COMMIT');
            res.status(201).json({ success: true, message: `成功生成並插入 ${actionsToInsert.length} 筆管理建議。`, data: actionsToInsert });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

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
            SELECT tma.*, ts.species_name, ts.project_code, ts.project_location 
            FROM tree_management_actions tma 
            JOIN tree_survey ts ON tma.tree_id = ts.id
            WHERE 1=1
        `;
        const queryParams = [];
        let paramIndex = 1;

        if (tree_id) {
            query += ` AND tma.tree_id = $${paramIndex++}`;
            queryParams.push(tree_id);
        }
        if (project_code) {
            query += ` AND ts.project_code = $${paramIndex++}`;
            queryParams.push(project_code);
        }
        if (area_name) {
            query += ` AND ts.project_location = $${paramIndex++}`;
            queryParams.push(area_name);
        }
        if (is_done !== undefined) {
            query += ` AND tma.is_done = $${paramIndex++}`;
            queryParams.push(is_done === 'true' || is_done === '1');
        }
        if (category) {
            query += ` AND tma.category = $${paramIndex++}`;
            queryParams.push(category);
        }

        const countQuery = query.replace(/SELECT tma.\*.*?FROM/s, 'SELECT COUNT(DISTINCT tma.action_id) as total FROM');
        const { rows: countRows } = await db.query(countQuery, queryParams);
        const total = countRows[0] ? parseInt(countRows[0].total, 10) : 0;

        query += ` ORDER BY tma.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        const { rows: actions } = await db.query(query, queryParams);

        res.json({ success: true, data: actions, total: total, limit: parseInt(limit), offset: parseInt(offset) });

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
    const { is_done, action_text, due_date } = req.body;

    if (is_done === undefined && action_text === undefined && due_date === undefined) {
        return res.status(400).json({ success: false, message: '請提供要更新的欄位 (is_done, action_text, due_date)' });
    }

    try {
        let updateFields = [];
        let queryParams = [];
        let paramIndex = 1;

        if (is_done !== undefined) {
            updateFields.push(`is_done = $${paramIndex++}`);
            queryParams.push(is_done === true || is_done === 1);
        }
        if (action_text !== undefined) {
            updateFields.push(`action_text = $${paramIndex++}`);
            queryParams.push(action_text);
        }
        if (due_date !== undefined) {
            updateFields.push(`due_date = $${paramIndex++}`);
            queryParams.push(due_date || null);
        }

        if (updateFields.length === 0) {
             return res.status(400).json({ success: false, message: '沒有提供有效的更新欄位' });
        }

        queryParams.push(action_id);
        const query = `UPDATE tree_management_actions SET ${updateFields.join(', ')} WHERE action_id = $${paramIndex}`;

        const { rowCount } = await db.query(query, queryParams);

        if (rowCount === 0) {
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
        const query = 'DELETE FROM tree_management_actions WHERE action_id = $1';
        const { rowCount } = await db.query(query, [action_id]);

        if (rowCount === 0) {
            return res.status(404).json({ success: false, message: '找不到要刪除的管理建議' });
        }

        res.json({ success: true, message: '管理建議刪除成功' });

    } catch (error) {
        console.error('刪除管理建議時發生錯誤:', error);
        res.status(500).json({ success: false, message: '刪除管理建議時發生內部錯誤' });
    }
}; 