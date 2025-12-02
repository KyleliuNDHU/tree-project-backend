/**
 * 樹種辨識 API 路由
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    identifySpecies,
    getSpeciesFromGBIF,
    searchSpeciesFromINaturalist,
    getSpeciesDetailFromINaturalist
} = require('../services/speciesIdentificationService');

// 設定 multer 用於處理圖片上傳
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 最大 10MB
        files: 5 // 最多 5 張圖片
    },
    fileFilter: (req, file, cb) => {
        // 只接受圖片
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只接受圖片檔案'));
        }
    }
});

/**
 * POST /api/species/identify
 * 上傳圖片進行樹種辨識
 * 
 * Body (multipart/form-data):
 * - image: 圖片檔案 (必填)
 * - organ: 器官類型 (選填) - leaf, flower, fruit, bark, auto
 * - lang: 語言 (選填) - zh, en
 */
router.post('/identify', (req, res, next) => {
    // Wrap multer with custom error handling
    upload.single('image')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // Multer 特定錯誤 (例如檔案過大)
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    error: '圖片大小超過限制（最大 10MB）'
                });
            }
            return res.status(400).json({
                success: false,
                error: `上傳錯誤: ${err.message}`
            });
        } else if (err) {
            // fileFilter 拋出的錯誤
            return res.status(400).json({
                success: false,
                error: err.message || '只接受圖片檔案'
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: '請上傳圖片'
            });
        }

        const organ = req.body.organ || 'auto';
        const lang = req.body.lang || 'zh';

        console.log(`[Species Identify] 開始辨識，器官類型: ${organ}, 語言: ${lang}`);

        const result = await identifySpecies(req.file.buffer, {
            organ,
            lang,
            enrichWithGBIF: true
        });

        if (result.success) {
            console.log(`[Species Identify] 辨識成功: ${result.primaryResult?.scientificName}`);
        } else {
            console.log(`[Species Identify] 辨識失敗: ${result.error}`);
        }

        res.json(result);
    } catch (error) {
        console.error('[Species Identify] 錯誤:', error);
        res.status(500).json({
            success: false,
            error: error.message || '辨識服務發生錯誤'
        });
    }
});

/**
 * GET /api/species/search
 * 搜尋物種 (使用 iNaturalist)
 * 
 * Query:
 * - q: 搜尋關鍵字 (必填)
 */
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q) {
            return res.status(400).json({
                success: false,
                error: '請提供搜尋關鍵字'
            });
        }

        console.log(`[Species Search] 搜尋: ${q}`);

        const result = await searchSpeciesFromINaturalist(q);
        res.json(result);
    } catch (error) {
        console.error('[Species Search] 錯誤:', error);
        res.status(500).json({
            success: false,
            error: error.message || '搜尋服務發生錯誤'
        });
    }
});

/**
 * GET /api/species/gbif/:name
 * 從 GBIF 取得物種詳細資訊
 * 
 * Params:
 * - name: 學名
 */
router.get('/gbif/:name', async (req, res) => {
    try {
        const { name } = req.params;
        
        console.log(`[GBIF] 查詢: ${name}`);

        const result = await getSpeciesFromGBIF(decodeURIComponent(name));
        res.json(result);
    } catch (error) {
        console.error('[GBIF] 錯誤:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'GBIF 查詢發生錯誤'
        });
    }
});

/**
 * GET /api/species/inaturalist/:id
 * 從 iNaturalist 取得物種詳細資訊
 * 
 * Params:
 * - id: iNaturalist 物種 ID
 */
router.get('/inaturalist/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`[iNaturalist] 查詢 ID: ${id}`);

        const result = await getSpeciesDetailFromINaturalist(parseInt(id));
        res.json(result);
    } catch (error) {
        console.error('[iNaturalist] 錯誤:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'iNaturalist 查詢發生錯誤'
        });
    }
});

/**
 * GET /api/species/status
 * 檢查辨識服務狀態
 */
router.get('/status', (req, res) => {
    const hasPlantNetKey = !!process.env.PLANTNET_API_KEY;
    
    res.json({
        success: true,
        services: {
            plantnet: {
                available: hasPlantNetKey,
                message: hasPlantNetKey ? '已設定 API Key' : '未設定 PLANTNET_API_KEY 環境變數'
            },
            gbif: {
                available: true,
                message: '免費公開 API，無需認證'
            },
            inaturalist: {
                available: true,
                message: '免費公開 API，無需認證'
            }
        }
    });
});

module.exports = router;
