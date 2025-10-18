const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 取得樹種列表 (從 tree_species 表或 tree_survey 表)
router.get('/', async (req, res) => {
    try {
        // 優先從獨立的 tree_species 表中獲取
        let { rows } = await db.query('SELECT id, name FROM tree_species ORDER BY name');

        if (rows.length === 0) {
            // 如果 tree_species 為空，則從 tree_survey 中提取
            console.log('tree_species is empty, falling back to tree_survey.');
            const fallbackQuery = `
                SELECT DISTINCT 樹種編號 as id, 樹種名稱 as name 
                FROM tree_survey 
                WHERE 樹種名稱 IS NOT NULL AND 樹種名稱 != '' AND 樹種編號 IS NOT NULL AND 樹種編號 != ''
                ORDER BY 樹種名稱
            `;
            const fallbackResult = await db.query(fallbackQuery);
            rows = fallbackResult.rows;
        }
        
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('取得樹種列表錯誤:', err);
        res.status(500).json({ success: false, message: '取得樹種列表時發生錯誤' });
    }
});


// 獲取下一個可用的樹種編號
router.get('/next_number', async (req, res) => {
    try {
        const query = `
            SELECT id FROM tree_species WHERE id ~ '^[0-9]+$'
            UNION
            SELECT "樹種編號" as id FROM tree_survey WHERE "樹種編號" ~ '^[0-9]+$'
        `;
        const { rows } = await db.query(query);

        const existingNumbers = new Set(rows.map(row => parseInt(row.id, 10)).filter(num => !isNaN(num)));
        
        let nextNumber = 1;
        while (existingNumbers.has(nextNumber)) {
            nextNumber++;
        }

        const formattedNumber = nextNumber.toString().padStart(4, '0');
        res.json({ success: true, nextNumber: formattedNumber });

    } catch (err) {
        console.error('獲取下一個樹種編號錯誤:', err);
        res.status(500).json({ success: false, message: '獲取編號時發生錯誤' });
    }
});


// 新增樹種
router.post('/', async (req, res) => {
    const { name, id } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, message: '請提供樹種名稱' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 檢查樹種是否已存在
        const { rows: existing } = await client.query('SELECT id FROM tree_species WHERE name = $1', [name]);
        if (existing.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: '此樹種已存在' });
        }

        let finalId = id;
        if (!finalId || finalId.trim() === '') {
            // 自動生成 ID
            const { rows: allIds } = await client.query("SELECT id FROM tree_species WHERE id ~ '^[0-9]+$'");
            const existingNumbers = new Set(allIds.map(row => parseInt(row.id, 10)).filter(num => !isNaN(num)));
            let nextNumber = 1;
            while (existingNumbers.has(nextNumber)) {
                nextNumber++;
            }
            finalId = nextNumber.toString().padStart(4, '0');
        }

        const { rows: insertResult } = await client.query('INSERT INTO tree_species (id, name) VALUES ($1, $2) RETURNING id', [finalId, name]);

        await client.query('COMMIT');
        res.status(201).json({ success: true, message: '樹種新增成功', id: insertResult[0].id, name: name });

    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ success: false, message: '樹種 ID 或名稱已存在' });
        }
        console.error('新增樹種錯誤:', err);
        res.status(500).json({ success: false, message: '新增樹種時發生錯誤' });
    } finally {
        client.release();
    }
});


module.exports = router;
