const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 取得樹種列表 (從 tree_species 表或 tree_survey 表)
router.get('/', async (req, res) => {
    try {
        // 優先從獨立的 tree_species 表中獲取
        let { rows } = await db.query('SELECT id, name, scientific_name FROM tree_species ORDER BY name');

        if (rows.length === 0) {
            // 如果 tree_species 為空，則從 tree_survey 中提取
            console.log('tree_species is empty, falling back to tree_survey.');
            const fallbackQuery = `
                SELECT DISTINCT species_id as id, species_name as name, NULL as scientific_name
                FROM tree_survey 
                WHERE species_name IS NOT NULL AND species_name != '' AND species_id IS NOT NULL AND species_id != ''
                ORDER BY species_name
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
            SELECT species_id as id FROM tree_survey WHERE species_id ~ '^[0-9]+$'
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


// 新增樹種 (整合版：支援 name, id, scientific_name)
router.post('/', async (req, res) => {
    const { name, id, scientific_name } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, message: '請提供樹種名稱' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 檢查樹種是否已存在（按名稱或學名）
        const checkQuery = scientific_name 
            ? 'SELECT id, name, scientific_name FROM tree_species WHERE name = $1 OR scientific_name = $2'
            : 'SELECT id, name, scientific_name FROM tree_species WHERE name = $1';
        const checkParams = scientific_name ? [name, scientific_name] : [name];
        const { rows: existing } = await client.query(checkQuery, checkParams);
        
        if (existing.length > 0) {
            await client.query('ROLLBACK');
            return res.json({ 
                success: true, 
                message: '樹種已存在', 
                id: existing[0].id, 
                name: existing[0].name,
                scientific_name: existing[0].scientific_name,
                exists: true 
            });
        }

        let finalId = id;
        if (!finalId || finalId.trim() === '') {
            // 自動生成 ID
            const { rows: allIds } = await client.query(`
                SELECT id FROM tree_species WHERE id ~ '^[0-9]+$'
                UNION
                SELECT species_id as id FROM tree_survey WHERE species_id ~ '^[0-9]+$'
            `);
            const existingNumbers = new Set(allIds.map(row => parseInt(row.id, 10)).filter(num => !isNaN(num)));
            let nextNumber = 1;
            while (existingNumbers.has(nextNumber)) {
                nextNumber++;
            }
            finalId = nextNumber.toString().padStart(4, '0');
        }

        const { rows: insertResult } = await client.query(
            'INSERT INTO tree_species (id, name, scientific_name) VALUES ($1, $2, $3) RETURNING id, name, scientific_name',
            [finalId, name, scientific_name || null]
        );

        await client.query('COMMIT');
        res.status(201).json({ 
            success: true, 
            message: '樹種新增成功', 
            id: insertResult[0].id, 
            name: insertResult[0].name,
            scientific_name: insertResult[0].scientific_name
        });

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


// ========== 樹種同義詞/合併 API ==========

// 搜尋樹種（含同義詞匹配）
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length === 0) {
            return res.json({ success: true, data: [] });
        }
        const speciesSynonymService = require('../services/speciesSynonymService');
        const results = await speciesSynonymService.searchSpeciesWithSynonyms(q);
        res.json({ success: true, data: results });
    } catch (err) {
        console.error('搜尋樹種錯誤:', err);
        res.status(500).json({ success: false, message: '搜尋時發生錯誤' });
    }
});

// 取得增強版樹種列表（含同義詞資訊）
router.get('/enhanced', async (req, res) => {
    try {
        // 取得所有樹種
        const { rows: species } = await db.query(
            'SELECT id, name, scientific_name FROM tree_species ORDER BY name'
        );

        // 嘗試取得同義詞（表可能不存在）
        let synonyms = [];
        try {
            const synResult = await db.query(
                'SELECT canonical_species_id, variant_name, scientific_name, source FROM species_synonyms ORDER BY canonical_species_id'
            );
            synonyms = synResult.rows;
        } catch (e) {
            if (e.code !== '42P01') console.error('取得同義詞錯誤:', e.message);
        }

        // 組合：每個樹種帶上它的同義詞列表
        const enriched = species.map(sp => ({
            ...sp,
            synonyms: synonyms
                .filter(syn => syn.canonical_species_id === sp.id)
                .map(syn => syn.variant_name)
        }));

        res.json({ success: true, data: enriched });
    } catch (err) {
        console.error('取得增強樹種列表錯誤:', err);
        res.status(500).json({ success: false, message: '取得樹種列表時發生錯誤' });
    }
});

// 取得同義詞分析報告
router.get('/synonyms/report', async (req, res) => {
    try {
        const speciesSynonymService = require('../services/speciesSynonymService');
        const report = await speciesSynonymService.analyzeSpeciesVariants();
        res.json({ success: true, data: report });
    } catch (err) {
        console.error('同義詞分析錯誤:', err);
        res.status(500).json({ success: false, message: '同義詞分析時發生錯誤' });
    }
});

// 手動觸發同義詞合併
router.post('/synonyms/merge', async (req, res) => {
    try {
        const speciesSynonymService = require('../services/speciesSynonymService');
        const result = await speciesSynonymService.runSynonymMerge();
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('同義詞合併錯誤:', err);
        res.status(500).json({ success: false, message: '同義詞合併時發生錯誤' });
    }
});


module.exports = router;
