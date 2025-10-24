const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 取得專案列表 (從 tree_survey 表格中提取)
router.get('/', async (req, res) => {
    try {
        // DISTINCT ON (project_code) 是 PostgreSQL 特有的語法，用來確保每個專案只返回一筆
        const query = `
            SELECT DISTINCT ON (project_code) 
                project_name as name, 
                project_code as code, 
                project_location as area 
            FROM tree_survey 
            WHERE project_name IS NOT NULL AND project_name != ''
            ORDER BY project_code, project_name;
        `;
        const { rows } = await db.query(query);
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
router.post('/add', async (req, res) => {
    const { name, area } = req.body;
    if (!name || !area) {
        return res.status(400).json({ success: false, message: '請提供專案名稱與區位' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 1. 產生新的專案代碼
        const { rows: maxCodeRows } = await client.query("SELECT MAX(CAST(project_code AS INTEGER)) as max_code FROM tree_survey WHERE project_code ~ '^[0-9]+$'");
        const nextCode = (maxCodeRows[0].max_code || 0) + 1;

        // [FIX] 2. 產生下一個系統樹木編號以滿足 NOT NULL 約束
        const { rows: maxSystemIdRows } = await client.query("SELECT MAX(CAST(regexp_replace(system_tree_id, '[^0-9]', '', 'g') AS INTEGER)) as max_id FROM tree_survey");
        const nextSystemId = (maxSystemIdRows[0].max_id || 0) + 1;
        const systemTreeId = `ST-${nextSystemId}`;


        // 3. 插入一筆預設的樹木記錄來代表這個新專案
        // 這是一個簡化作法，確保專案存在於 tree_survey 表中
        const insertQuery = `
            INSERT INTO tree_survey (project_name, project_code, project_location, species_name, system_tree_id) 
            VALUES ($1, $2, $3, '預設樹種', $4)
        `;
        await client.query(insertQuery, [name, nextCode.toString(), area, systemTreeId]);
        
        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: '專案新增成功',
            project: { name, code: nextCode.toString(), area }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('新增專案錯誤:', err);
        res.status(500).json({ success: false, message: '新增專案時發生錯誤' });
    } finally {
        client.release();
    }
});

module.exports = router;
