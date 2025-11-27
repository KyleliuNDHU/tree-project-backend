const db = require('../config/db');

/**
 * 更新單筆樹木調查資料 (v2)
 *
 * 特性：
 * 1. 兼容 V2 命名慣例 (snake_case)。
 * 2. 動態生成 UPDATE 語句，只更新提供的欄位。
 * 3. 包含基本的錯誤處理和存在性檢查。
 */
exports.updateTreeV2 = async (req, res) => {
    const { id } = req.params;
    const client = await db.pool.connect();

    try {
        const {
            project_area,
            project_code,
            project_name,
            species_id,
            species_name,
            x_coord,
            y_coord,
            status,
            note,
            tree_remark,
            tree_height_m,
            dbh_cm,
            survey_notes,
            survey_time,
            carbon_storage,
            carbon_sequestration_per_year,
        } = req.body;

        // 檢查至少有一項可更新的數據
        const bodyKeys = Object.keys(req.body);
        if (bodyKeys.length === 0) {
            return res.status(400).json({ success: false, message: '沒有提供要更新的資料' });
        }

        await client.query('BEGIN');

        // 首先，檢查該樹木記錄是否存在
        const checkExist = await client.query('SELECT id FROM tree_survey WHERE id = $1', [id]);
        if (checkExist.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: '找不到指定的樹木資料' });
        }

        // 準備專案關聯 (如果提供了 project_code)
        let projectId = null;
        if (project_code) {
             const prjRes = await client.query(
                'SELECT id FROM projects WHERE project_code = $1',
                [project_code]
            );
            if (prjRes.rows.length > 0) {
                projectId = prjRes.rows[0].id;
            }
        }


        // 動態構建 SET 子句
        const updates = [];
        const values = [];
        let queryIndex = 1;

        const fieldMapping = {
            project_location: project_area,
            project_code: project_code,
            project_name: project_name,
            species_id: species_id,
            species_name: species_name,
            x_coord: x_coord,
            y_coord: y_coord,
            status: status,
            notes: note, // v1 'note' -> v2 'notes'
            tree_notes: tree_remark, // v1 'tree_remark' -> v2 'tree_notes'
            tree_height_m: tree_height_m,
            dbh_cm: dbh_cm,
            survey_notes: survey_notes,
            survey_time: survey_time,
            carbon_storage: carbon_storage,
            carbon_sequestration_per_year: carbon_sequestration_per_year,
            project_id: projectId, // 新增 project_id 的更新
            project_tree_id: req.body.project_tree_id // [FIX] 允許更新專案樹木編號
        };
        
        for (const [dbField, value] of Object.entries(fieldMapping)) {
            if (value !== undefined) {
                updates.push(`${dbField} = $${queryIndex++}`);
                values.push(value);
            }
        }

        if (updates.length === 0) {
            // 雖然 body 有 key，但都不是我們要更新的欄位
            return res.status(400).json({ success: false, message: '沒有有效的更新欄位' });
        }
        
        values.push(id); // 最後一個參數是 WHERE 條件的 id

        const sql = `UPDATE tree_survey SET ${updates.join(', ')} WHERE id = $${queryIndex}`;

        await client.query(sql, values);
        await client.query('COMMIT');

        res.status(200).json({
            success: true,
            message: '樹木資料更新成功 (V2)',
            data: { id: id, ...req.body }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('更新樹木資料失敗 (V2):', err);
        res.status(500).json({
            success: false,
            message: '更新資料時發生錯誤',
            error: err.message
        });
    } finally {
        client.release();
    }
};
