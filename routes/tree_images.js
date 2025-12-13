const express = require('express');
const router = express.Router();
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 確保圖片儲存目錄存在
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'tree_images');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * 上傳樹木影像 (Base64 格式)
 * POST /api/tree-images/upload
 */
router.post('/upload', async (req, res) => {
    const { tree_id, image_id, type, captured_at, metadata, image_data } = req.body;

    if (!tree_id || !image_data || !type) {
        return res.status(400).json({ success: false, message: '缺少必要參數 (tree_id, image_data, type)' });
    }

    const client = await db.pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. 處理檔案儲存
        // 解析 Base64
        const matches = image_data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer;
        let ext = '.jpg'; // 預設副檔名

        if (matches && matches.length === 3) {
            // 有 Data URI scheme
            // const mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            // 純 Base64 字串
            buffer = Buffer.from(image_data, 'base64');
        }

        // 建立專屬目錄 (依 tree_id 分類)
        const treeDir = path.join(UPLOAD_DIR, tree_id.toString());
        if (!fs.existsSync(treeDir)) {
            fs.mkdirSync(treeDir, { recursive: true });
        }

        // 檔名: image_id 或 uuid
        const finalImageId = image_id || uuidv4();
        const fileName = `${finalImageId}${ext}`;
        const filePath = path.join(treeDir, fileName);
        
        // 寫入檔案
        fs.writeFileSync(filePath, buffer);

        // 相對路徑 (用於存儲於 DB)
        const relativePath = path.join('uploads', 'tree_images', tree_id.toString(), fileName);
        // URL 路徑 (用於回傳給前端) - 假設我們有一個 file 路由或者直接 stream
        // 這裡我們暫時回傳一個 API URL 用於獲取圖片
        const remoteUrl = `/api/tree-images/${finalImageId}`;

        // 2. 存入資料庫
        // 檢查是否是待測量樹木 (pending) 還是正式樹木 (survey)
        // 這裡做個簡單判斷：如果 tree_id 是數字，可能是正式 ID；如果是 UUID 或特殊格式，需檢查
        // V3 前端傳來的 tree_id 可能是 pending ID 或 original record ID
        
        let treeSurveyId = null;
        let pendingId = null;

        // 嘗試解析 tree_id
        // 假設前端傳來的是 tree_survey 的 ID (integer)
        if (!isNaN(parseInt(tree_id))) {
            // 檢查是否在 tree_survey
            const surveyCheck = await client.query('SELECT id FROM tree_survey WHERE id = $1', [tree_id]);
            if (surveyCheck.rows.length > 0) {
                treeSurveyId = parseInt(tree_id);
            } else {
                // 檢查是否在 pending_tree_measurements
                const pendingCheck = await client.query('SELECT id FROM pending_tree_measurements WHERE id = $1', [tree_id]);
                if (pendingCheck.rows.length > 0) {
                    pendingId = parseInt(tree_id);
                }
            }
        }

        // 如果都不是，可能需要根據 metadata 中的 task_id 判斷
        if (!treeSurveyId && !pendingId && metadata && metadata.task_id) {
             const pendingCheck = await client.query('SELECT id FROM pending_tree_measurements WHERE id = $1', [metadata.task_id]);
             if (pendingCheck.rows.length > 0) {
                 pendingId = metadata.task_id;
             }
        }

        // 插入資料
        const insertQuery = `
            INSERT INTO tree_images 
            (tree_survey_id, pending_measurement_id, image_type, image_path, storage_type, captured_at, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, image_path
        `;
        
        const insertValues = [
            treeSurveyId, 
            pendingId, 
            type, 
            relativePath, 
            'local', 
            captured_at || new Date(), 
            metadata || {}
        ];

        const { rows } = await client.query(insertQuery, insertValues);
        const dbId = rows[0].id;

        await client.query('COMMIT');

        res.json({
            success: true,
            message: '影像上傳成功',
            id: dbId,
            remote_path: remoteUrl, // 前端更新用
            local_path: relativePath
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[tree_images] 上傳失敗:', err);
        res.status(500).json({ success: false, message: '影像上傳失敗: ' + err.message });
    } finally {
        client.release();
    }
});

/**
 * 取得影像
 * GET /api/tree-images/:id
 * :id 可以是 tree_images 表的 PK (integer) 或是 image_id (如果前端用 UUID)
 * 這裡簡單實作：假設 :id 是 tree_images.id (PK)
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // 查詢檔案路徑
        const query = 'SELECT image_path, image_type FROM tree_images WHERE id = $1';
        const { rows } = await db.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '找不到影像' });
        }

        const imageRecord = rows[0];
        // 組合絕對路徑
        // imageRecord.image_path 是 'uploads/tree_images/...'
        const absolutePath = path.join(__dirname, '..', imageRecord.image_path);

        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ success: false, message: '影像檔案遺失' });
        }

        // 回傳檔案
        res.sendFile(absolutePath);

    } catch (err) {
        console.error('[tree_images] 讀取失敗:', err);
        res.status(500).json({ success: false, message: '讀取影像失敗' });
    }
});

/**
 * 取得特定樹木的所有影像列表
 * GET /api/tree-images/tree/:treeId
 */
router.get('/tree/:treeId', async (req, res) => {
    const { treeId } = req.params;

    try {
        const query = `
            SELECT id, image_type, captured_at, metadata, created_at 
            FROM tree_images 
            WHERE tree_survey_id = $1 OR pending_measurement_id = $1
            ORDER BY captured_at DESC
        `;
        const { rows } = await db.query(query, [treeId]);

        const images = rows.map(row => ({
            ...row,
            url: `/api/tree-images/${row.id}`
        }));

        res.json({ success: true, data: images });

    } catch (err) {
        console.error('[tree_images] 列表讀取失敗:', err);
        res.status(500).json({ success: false, message: '讀取列表失敗' });
    }
});

/**
 * 刪除影像
 * DELETE /api/tree-images/:id
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. 查詢路徑
        const query = 'SELECT image_path FROM tree_images WHERE id = $1';
        const { rows } = await client.query(query, [id]);

        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: '找不到影像' });
        }

        const imagePath = rows[0].image_path;
        const absolutePath = path.join(__dirname, '..', imagePath);

        // 2. 刪除 DB 記錄
        await client.query('DELETE FROM tree_images WHERE id = $1', [id]);

        // 3. 刪除實體檔案 (如果存在)
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
        }

        await client.query('COMMIT');
        res.json({ success: true, message: '影像已刪除' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[tree_images] 刪除失敗:', err);
        res.status(500).json({ success: false, message: '刪除失敗' });
    } finally {
        client.release();
    }
});

module.exports = router;
