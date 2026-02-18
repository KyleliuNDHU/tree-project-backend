const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireRole } = require('../middleware/roleAuth');
const csvImportController = require('../controllers/csvImportController');

// Multer 設定：將檔案暫存在記憶體
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB 上限
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' ||
            file.originalname.endsWith('.csv') ||
            file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('只允許上傳 CSV 檔案'));
        }
    }
});

// Multer 錯誤處理包裝
function handleMulterUpload(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (err) {
            const message = err.code === 'LIMIT_FILE_SIZE'
                ? '檔案大小超過限制 (最大 50MB)'
                : err.message || '檔案上傳失敗';
            return res.status(400).json({ success: false, message });
        }
        next();
    });
}

// POST /api/admin/import-csv/preview — 上傳 CSV，回傳分析結果（不寫入）
// 限業務管理員以上
router.post('/preview', requireRole('業務管理員'), handleMulterUpload, csvImportController.preview);

// POST /api/admin/import-csv/execute — 確認後執行匯入
// 限業務管理員以上
router.post('/execute', requireRole('業務管理員'), csvImportController.execute);

module.exports = router;
