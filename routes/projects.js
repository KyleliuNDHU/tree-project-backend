const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../middleware/roleAuth');
const { projectAuthFilter } = require('../middleware/projectAuth');

// 取得專案列表 (依使用者權限過濾)
router.get('/', projectAuthFilter, async (req, res) => {
    try {
        let query = `
            SELECT DISTINCT ON (project_code) 
                project_name as name, 
                project_code as code, 
                project_location as area 
            FROM tree_survey 
            WHERE project_name IS NOT NULL AND project_name != ''
        `;
        const params = [];
        let paramIdx = 1;

        // 依使用者權限過濾專案
        if (req.projectFilter) {
            if (req.projectFilter.length === 0) {
                return res.json({ success: true, data: [] });
            }
            query += ` AND project_code = ANY($${paramIdx}::text[])`;
            params.push(req.projectFilter);
            paramIdx++;
        }

        query += ` ORDER BY project_code, project_name`;
        const { rows } = await db.query(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('取得專案列表錯誤:', err);
        res.status(500).json({ success: false, message: '取得專案列表時發生錯誤' });
    }
});

// 根據專案區位獲取專案列表
router.get('/by_area/:area', async (req, res) => {
    const { area } = req.params;
    try {
        const query = `
            SELECT DISTINCT project_name as name, project_code as code, project_location as area 
            FROM tree_survey 
            WHERE project_location = $1 AND project_name IS NOT NULL AND project_name != '' 
            ORDER BY project_name;
        `;
        const { rows } = await db.query(query, [area]);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(`取得區位[${area}]的專案列表錯誤:`, err);
        res.status(500).json({ success: false, message: '取得專案列表時發生錯誤' });
    }
});

// 根據專案名稱獲取專案資訊 (主要用於檢查專案是否存在)
router.get('/by_name/:name', async (req, res) => {
    const { name } = req.params;
    try {
        const query = `
            SELECT DISTINCT ON (project_code) 
                project_name as name, 
                project_code as code, 
                project_location as area 
            FROM tree_survey 
            WHERE project_name = $1 
            LIMIT 1;
        `;
        const { rows } = await db.query(query, [name]);
        if (rows.length > 0) {
            res.json({ success: true, data: rows[0] });
        } else {
            res.status(404).json({ success: false, message: '找不到指定的專案' });
        }
    } catch (err) {
        console.error(`取得專案[${name}]資訊錯誤:`, err);
        res.status(500).json({ success: false, message: '查詢專案時發生錯誤' });
    }
});


// 根據專案代碼獲取專案資訊
router.get('/by_code/:code', async (req, res) => {
    const { code } = req.params;
    try {
        const query = `
            SELECT DISTINCT ON (project_code) 
                project_name as name, 
                project_code as code, 
                project_location as area 
            FROM tree_survey 
            WHERE project_code = $1 
            LIMIT 1;
        `;
        const { rows } = await db.query(query, [code]);
        if (rows.length > 0) {
            res.json({ success: true, data: rows[0] });
        } else {
            res.status(404).json({ success: false, message: '找不到指定的專案' });
        }
    } catch (err) {
        console.error(`取得專案代碼[${code}]資訊錯誤:`, err);
        res.status(500).json({ success: false, message: '查詢專案時發生錯誤' });
    }
});

// 新增專案 (這會創建一個新的專案代碼和一筆預設的樹木記錄來"佔位")
// 
// [FIX v17.1] 專案第一筆資料 ID 問題修復
// 問題：原本佔位記錄使用 project_tree_id='1'，導致實際第一筆資料變成 PT-2
// 解決方案：使用特殊標記 'PT-0' 或 'PLACEHOLDER' 作為佔位記錄的 project_tree_id
// 這樣 treeSurveyCreateController.js 查詢 MAX 時會正確返回 null 或 0，第一筆實際資料就是 PT-1
//
// 新增專案 (業務管理員以上)
router.post('/add', requireRole('業務管理員'), async (req, res) => {
    const { name, area } = req.body;
    if (!name || !area) {
        return res.status(400).json({ success: false, message: '請提供專案名稱與區位' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 使用 Advisory Lock (Key 2) 確保專案代碼生成的原子性
        // Key 1 用於樹木編號 (treeSurveyCreateController)
        // Key 2 用於專案代碼 (projects.js)
        await client.query('SELECT pg_advisory_xact_lock(2)');

        // 1. 產生新的專案代碼
        const { rows: maxCodeRows } = await client.query("SELECT MAX(CAST(project_code AS INTEGER)) as max_code FROM tree_survey WHERE project_code ~ '^[0-9]+$'");
        const nextCode = (maxCodeRows[0].max_code || 0) + 1;

        // [FIX] 2. 產生下一個系統樹木編號以滿足 NOT NULL 約束
        // 佔位記錄使用特殊 ID 格式，避免影響正常 ID 序列
        const { rows: maxSystemIdRows } = await client.query("SELECT MAX(CAST(regexp_replace(system_tree_id, '[^0-9]', '', 'g') AS INTEGER)) as max_id FROM tree_survey WHERE system_tree_id ~ '^ST-[0-9]+$'");
        const nextSystemId = (maxSystemIdRows[0].max_id || 0) + 1;
        // 佔位記錄使用 PLACEHOLDER 前綴，與正常 ST- 格式區分
        const placeholderSystemId = `PLACEHOLDER-${nextCode}`;


        // 3. 插入一筆預設的樹木記錄來代表這個新專案
        // [FIX v17.1] 使用 'PT-0' 作為佔位記錄的 project_tree_id
        // 這樣 treeSurveyCreateController.js 的正規表達式 '^[A-Za-z]+-[0-9]+$' 會匹配到 PT-0
        // 但 MAX 函數會把 0 視為最小值，使得實際第一筆資料成為 PT-1
        const insertQuery = `
            INSERT INTO tree_survey (project_name, project_code, project_location, species_name, system_tree_id, project_tree_id, is_placeholder) 
            VALUES ($1, $2, $3, '__PLACEHOLDER__', $4, 'PT-0', true)
            RETURNING *
        `;
        const insertParams = [name, nextCode.toString(), area, placeholderSystemId];
        
        const { rows: newTreeRows } = await client.query(insertQuery, insertParams);
        const placeholderTree = newTreeRows[0];
        
        await client.query('COMMIT');

        // 自動將創建者關聯到新專案
        if (req.user && req.user.user_id) {
            try {
                const { rows: userRows } = await db.query('SELECT associated_projects FROM users WHERE user_id = $1', [req.user.user_id]);
                if (userRows.length > 0) {
                    const existing = userRows[0].associated_projects || '';
                    const projectList = existing ? existing.split(',') : [];
                    if (!projectList.includes(nextCode.toString())) {
                        projectList.push(nextCode.toString());
                        await db.query('UPDATE users SET associated_projects = $1 WHERE user_id = $2', [projectList.join(','), req.user.user_id]);
                    }
                }
            } catch (autoAssignErr) {
                console.error('自動關聯專案失敗 (非致命):', autoAssignErr);
            }
        }

        res.status(201).json({
            success: true,
            message: '專案新增成功',
            project: { name, code: nextCode.toString(), area },
            placeholderTree: placeholderTree,
            note: '已使用新的佔位記錄機制 (PT-0)，確保第一筆實際資料為 PT-1'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('新增專案錯誤:', err);
        res.status(500).json({ success: false, message: '新增專案時發生錯誤' });
    } finally {
        client.release();
    }
});

// 刪除專案 (刪除該專案代碼下的所有樹木+邊界+區域資料) — 業務管理員以上
router.delete('/:code', requireRole('業務管理員'), async (req, res) => {
    const { code } = req.params;
    
    if (!code) {
        return res.status(400).json({ success: false, message: '請提供專案代碼' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 檢查專案是否存在
        const checkQuery = `SELECT COUNT(*) as count FROM tree_survey WHERE project_code = $1`;
        const { rows: checkRows } = await client.query(checkQuery, [code]);
        
        if (parseInt(checkRows[0].count) === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: '找不到指定專案或該專案已無資料' });
        }

        // 取得專案名稱（用於刪除邊界）
        const { rows: nameRows } = await client.query('SELECT DISTINCT project_name FROM tree_survey WHERE project_code = $1 LIMIT 1', [code]);
        const projectName = nameRows.length > 0 ? nameRows[0].project_name : null;

        // 1. 刪除專案邊界
        if (projectName) {
            await client.query('DELETE FROM project_boundaries WHERE project_name = $1 OR project_code = $2', [projectName, code]);
        }

        // 2. 刪除專案下所有樹木資料
        const deleteQuery = `DELETE FROM tree_survey WHERE project_code = $1`;
        await client.query(deleteQuery, [code]);

        // 3. 清理使用者的 associated_projects 中的此專案代碼
        const { rows: allUsers } = await client.query('SELECT user_id, associated_projects FROM users WHERE associated_projects IS NOT NULL');
        for (const user of allUsers) {
            const projects = user.associated_projects.split(',').filter(p => p.trim() !== code);
            await client.query('UPDATE users SET associated_projects = $1 WHERE user_id = $2', [projects.join(','), user.user_id]);
        }

        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: `專案 (代碼: ${code}) 及其所有樹木資料、邊界已刪除` 
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`刪除專案[${code}]錯誤:`, err);
        res.status(500).json({ success: false, message: '刪除專案時發生錯誤' });
    } finally {
        client.release();
    }
});

module.exports = router;
