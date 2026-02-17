// ============================================================================
// ML 訓練數據收集 API 路由
// ============================================================================
// 用途：收集前端 APP 的使用者修正數據用於 ML 模型改善
// 數據類型：
// - AR 測量修正
// - 樹種辨識修正
// - 碳儲量修正
// - 座標修正
// ============================================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { requireRole } = require('../middleware/roleAuth');

// ============================================================================
// 創建 ML 數據表格 (如果不存在)
// ============================================================================

const initializeTable = async () => {
    const createTableSQL = `
        -- ML 訓練數據批次表
        CREATE TABLE IF NOT EXISTS ml_training_batches (
            id SERIAL PRIMARY KEY,
            batch_id UUID NOT NULL UNIQUE,
            device_id VARCHAR(255) NOT NULL,
            app_version VARCHAR(50) NOT NULL,
            record_count INTEGER DEFAULT 0,
            upload_status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at TIMESTAMP,
            CONSTRAINT chk_upload_status CHECK (upload_status IN ('pending', 'processed', 'failed'))
        );
        
        -- ML 訓練數據記錄表
        CREATE TABLE IF NOT EXISTS ml_training_records (
            id SERIAL PRIMARY KEY,
            batch_id UUID REFERENCES ml_training_batches(batch_id) ON DELETE CASCADE,
            record_type VARCHAR(50) NOT NULL,
            tree_id VARCHAR(255),
            auto_values JSONB,
            user_values JSONB,
            difference JSONB,
            context JSONB,
            image_paths JSONB,
            recorded_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT chk_record_type CHECK (record_type IN (
                'arMeasurement', 'speciesIdentification', 'carbonModification',
                'coordinateCorrection', 'heightEstimation', 'crownWidthEstimation'
            ))
        );
        
        -- 索引
        CREATE INDEX IF NOT EXISTS idx_ml_batches_device ON ml_training_batches(device_id);
        CREATE INDEX IF NOT EXISTS idx_ml_batches_status ON ml_training_batches(upload_status);
        CREATE INDEX IF NOT EXISTS idx_ml_records_batch ON ml_training_records(batch_id);
        CREATE INDEX IF NOT EXISTS idx_ml_records_type ON ml_training_records(record_type);
        CREATE INDEX IF NOT EXISTS idx_ml_records_tree ON ml_training_records(tree_id);
        
        -- ML 訓練圖片關聯表
        CREATE TABLE IF NOT EXISTS ml_training_images (
            id SERIAL PRIMARY KEY,
            record_id INTEGER REFERENCES ml_training_records(id) ON DELETE CASCADE,
            image_path VARCHAR(1000) NOT NULL,
            image_type VARCHAR(50),
            file_size_bytes INTEGER,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    
    try {
        await pool.query(createTableSQL);
        console.log('[ML Data] Tables initialized');
    } catch (error) {
        console.error('[ML Data] Table initialization error:', error);
    }
};

// 啟動時初始化表格
initializeTable();

// ============================================================================
// 上傳 ML 訓練數據批次
// ============================================================================

/**
 * POST /api/ml-training/batch
 * 上傳一批 ML 訓練數據
 * 
 * Request Body:
 * {
 *   batch_id: string (UUID),
 *   device_id: string,
 *   app_version: string,
 *   records: [
 *     {
 *       record_type: string,
 *       tree_id?: string,
 *       auto_values: object,
 *       user_values: object,
 *       difference?: object,
 *       context?: object,
 *       image_paths?: string[],
 *       timestamp: string (ISO)
 *     }
 *   ]
 * }
 */
router.post('/batch', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { batch_id, device_id, app_version, records } = req.body;
        
        // 驗證必要欄位
        if (!batch_id || !device_id || !app_version) {
            return res.status(400).json({
                success: false,
                error: '缺少必要欄位: batch_id, device_id, app_version'
            });
        }
        
        if (!records || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({
                success: false,
                error: '記錄不能為空'
            });
        }
        
        if (records.length > 1000) {
            return res.status(400).json({
                success: false,
                error: '批次記錄數超過限制 (最大 1000)'
            });
        }
        
        // 開始交易
        await client.query('BEGIN');
        
        // 插入批次
        const batchResult = await client.query(`
            INSERT INTO ml_training_batches (batch_id, device_id, app_version, record_count)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (batch_id) DO UPDATE SET
                record_count = EXCLUDED.record_count,
                upload_status = 'pending'
            RETURNING id
        `, [batch_id, device_id, app_version, records.length]);
        
        // 插入記錄
        let insertedCount = 0;
        const validRecordTypes = [
            'arMeasurement', 'speciesIdentification', 'carbonModification',
            'coordinateCorrection', 'heightEstimation', 'crownWidthEstimation'
        ];
        
        for (const record of records) {
            // 驗證記錄類型
            if (!validRecordTypes.includes(record.record_type)) {
                console.warn(`[ML Data] 無效記錄類型: ${record.record_type}`);
                continue;
            }
            
            await client.query(`
                INSERT INTO ml_training_records (
                    batch_id, record_type, tree_id, auto_values, user_values,
                    difference, context, image_paths, recorded_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                batch_id,
                record.record_type,
                record.tree_id || null,
                JSON.stringify(record.auto_values || {}),
                JSON.stringify(record.user_values || {}),
                JSON.stringify(record.difference || {}),
                JSON.stringify(record.context || {}),
                JSON.stringify(record.image_paths || []),
                record.timestamp ? new Date(record.timestamp) : new Date()
            ]);
            
            insertedCount++;
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            batch_id: batch_id,
            inserted_count: insertedCount,
            message: `成功上傳 ${insertedCount} 條記錄`
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[ML Data] Upload error:', error);
        res.status(500).json({
            success: false,
            error: '上傳失敗: ' + error.message
        });
    } finally {
        client.release();
    }
});

// ============================================================================
// 獲取統計資訊
// ============================================================================

/**
 * GET /api/ml-training/statistics
 * 獲取 ML 訓練數據統計
 */
router.get('/statistics', requireRole('業務管理員'), async (req, res) => {
    try {
        // 總批次數和記錄數
        const overallStats = await pool.query(`
            SELECT 
                COUNT(DISTINCT b.batch_id) as total_batches,
                SUM(b.record_count) as total_records,
                COUNT(DISTINCT b.device_id) as unique_devices
            FROM ml_training_batches b
        `);
        
        // 按類型統計
        const typeStats = await pool.query(`
            SELECT 
                record_type,
                COUNT(*) as count
            FROM ml_training_records
            GROUP BY record_type
            ORDER BY count DESC
        `);
        
        // 最近 7 天趨勢
        const dailyStats = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count
            FROM ml_training_records
            WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(created_at)
            ORDER BY date
        `);
        
        res.json({
            success: true,
            overall: {
                total_batches: parseInt(overallStats.rows[0]?.total_batches || 0),
                total_records: parseInt(overallStats.rows[0]?.total_records || 0),
                unique_devices: parseInt(overallStats.rows[0]?.unique_devices || 0)
            },
            by_type: typeStats.rows.reduce((acc, row) => {
                acc[row.record_type] = parseInt(row.count);
                return acc;
            }, {}),
            daily_trend: dailyStats.rows.map(row => ({
                date: row.date,
                count: parseInt(row.count)
            }))
        });
        
    } catch (error) {
        console.error('[ML Data] Statistics error:', error);
        res.status(500).json({
            success: false,
            error: '獲取統計失敗: ' + error.message
        });
    }
});

// ============================================================================
// 導出訓練數據 (管理員用)
// ============================================================================

/**
 * GET /api/ml-training/export
 * 導出 ML 訓練數據用於模型訓練
 */
router.get('/export', requireRole('業務管理員'), async (req, res) => {
    try {
        const { record_type, limit = 10000, offset = 0 } = req.query;
        
        let whereClause = '';
        const params = [];
        
        if (record_type) {
            whereClause = 'WHERE record_type = $1';
            params.push(record_type);
        }
        
        const limitParam = params.length + 1;
        const offsetParam = params.length + 2;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(`
            SELECT 
                r.id,
                r.record_type,
                r.tree_id,
                r.auto_values,
                r.user_values,
                r.difference,
                r.context,
                r.recorded_at,
                b.device_id,
                b.app_version
            FROM ml_training_records r
            JOIN ml_training_batches b ON r.batch_id = b.batch_id
            ${whereClause}
            ORDER BY r.recorded_at DESC
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `, params);
        
        // 獲取總數
        const countResult = await pool.query(`
            SELECT COUNT(*) as total FROM ml_training_records ${whereClause}
        `, record_type ? [record_type] : []);
        
        res.json({
            success: true,
            total: parseInt(countResult.rows[0].total),
            offset: parseInt(offset),
            limit: parseInt(limit),
            records: result.rows
        });
        
    } catch (error) {
        console.error('[ML Data] Export error:', error);
        res.status(500).json({
            success: false,
            error: '導出失敗: ' + error.message
        });
    }
});

// ============================================================================
// 上傳關聯圖片
// ============================================================================

/**
 * POST /api/ml-training/image
 * 上傳與記錄關聯的圖片
 * 
 * 注意：這是一個簡化版本，實際應使用 multer 處理文件上傳
 */
router.post('/image', async (req, res) => {
    try {
        const { record_id, image_path, image_type, file_size_bytes } = req.body;
        
        if (!record_id || !image_path) {
            return res.status(400).json({
                success: false,
                error: '缺少必要欄位: record_id, image_path'
            });
        }
        
        // 驗證檔案大小
        if (file_size_bytes && file_size_bytes > 10 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                error: '圖片大小超過限制 (最大 10MB)'
            });
        }
        
        await pool.query(`
            INSERT INTO ml_training_images (record_id, image_path, image_type, file_size_bytes)
            VALUES ($1, $2, $3, $4)
        `, [record_id, image_path, image_type, file_size_bytes]);
        
        res.json({
            success: true,
            message: '圖片關聯成功'
        });
        
    } catch (error) {
        console.error('[ML Data] Image upload error:', error);
        res.status(500).json({
            success: false,
            error: '圖片上傳失敗: ' + error.message
        });
    }
});

// ============================================================================
// 分析報告 (用於 ML 改善決策)
// ============================================================================

/**
 * GET /api/ml-training/analysis
 * 獲取修正模式分析報告
 */
router.get('/analysis', requireRole('業務管理員'), async (req, res) => {
    try {
        // AR 測量誤差分析
        const arAnalysis = await pool.query(`
            SELECT 
                AVG(
                    ABS(
                        (auto_values->>'dbh_cm')::NUMERIC - 
                        (user_values->>'dbh_cm')::NUMERIC
                    )
                ) as avg_dbh_error,
                MAX(
                    ABS(
                        (auto_values->>'dbh_cm')::NUMERIC - 
                        (user_values->>'dbh_cm')::NUMERIC
                    )
                ) as max_dbh_error,
                COUNT(*) as sample_count
            FROM ml_training_records
            WHERE record_type = 'arMeasurement'
            AND auto_values->>'dbh_cm' IS NOT NULL
            AND user_values->>'dbh_cm' IS NOT NULL
        `);
        
        // 樹種辨識準確率
        const speciesAnalysis = await pool.query(`
            SELECT 
                COUNT(*) as total_corrections,
                COUNT(CASE WHEN auto_values->>'species_id' = user_values->>'species_id' THEN 1 END) as correct_count
            FROM ml_training_records
            WHERE record_type = 'speciesIdentification'
        `);
        
        const totalCorrections = parseInt(speciesAnalysis.rows[0]?.total_corrections || 0);
        const correctCount = parseInt(speciesAnalysis.rows[0]?.correct_count || 0);
        const accuracy = totalCorrections > 0 ? (correctCount / totalCorrections * 100).toFixed(1) : null;
        
        // 常見修正模式
        const commonPatterns = await pool.query(`
            SELECT 
                record_type,
                context->>'reference_object' as reference_object,
                COUNT(*) as count
            FROM ml_training_records
            WHERE context->>'reference_object' IS NOT NULL
            GROUP BY record_type, context->>'reference_object'
            ORDER BY count DESC
            LIMIT 10
        `);
        
        res.json({
            success: true,
            ar_measurement: {
                avg_dbh_error_cm: parseFloat(arAnalysis.rows[0]?.avg_dbh_error || 0).toFixed(2),
                max_dbh_error_cm: parseFloat(arAnalysis.rows[0]?.max_dbh_error || 0).toFixed(2),
                sample_count: parseInt(arAnalysis.rows[0]?.sample_count || 0)
            },
            species_identification: {
                total_corrections: totalCorrections,
                correct_predictions: correctCount,
                accuracy_percent: accuracy
            },
            common_patterns: commonPatterns.rows
        });
        
    } catch (error) {
        console.error('[ML Data] Analysis error:', error);
        res.status(500).json({
            success: false,
            error: '分析失敗: ' + error.message
        });
    }
});

module.exports = router;
