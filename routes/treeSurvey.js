const express = require('express');
const router = express.Router();
const db = require('../config/db');
const format = require('pg-format');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { cleanupUnusedSpecies, cleanupUnusedProjectAreas } = require('../utils/cleanup');

// --- Multer 設定 (用於檔案上傳) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // __dirname 是目前檔案的路徑, 我們需要回到 backend/uploads
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
        'application/vnd.ms-excel', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.csv') || file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('只允許上傳Excel或CSV文件'));
    }
  }
});


// 取得所有樹木資料 (可選通過 project name 或 area name 過濾)
router.get('/', async (req, res) => {
    try {
        // 使用 AS 將欄位名稱轉換為前端期望的中文名稱
        const sql = `
            SELECT 
                id,
                project_location AS "專案區位",
                project_code AS "專案代碼",
                project_name AS "專案名稱",
                system_tree_id AS "系統樹木",
                project_tree_id AS "專案樹木",
                species_id AS "樹種編號",
                species_name AS "樹種名稱",
                x_coord AS "X坐標",
                y_coord AS "Y坐標",
                status AS "狀況",
                notes AS "註記",
                tree_notes AS "樹木備註",
                tree_height_m AS "樹高（公尺）",
                dbh_cm AS "胸徑（公分）",
                survey_notes AS "調查備註",
                survey_time AS "調查時間",
                carbon_storage AS "碳儲存量",
                carbon_sequestration_per_year AS "推估年碳吸存量"
            FROM tree_survey 
            ORDER BY id ASC
        `;
        const { rows } = await db.query(sql);
        // 將回應包裹在標準格式中
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('獲取所有樹木資料錯誤:', err);
        res.status(500).json({ success: false, message: '查詢資料庫時發生錯誤' });
    }
});

// 根據專案名稱獲取樹木
router.get('/by_project/:projectName', async (req, res) => {
    const { projectName } = req.params;
    try {
        const { rows } = await db.query('SELECT * FROM tree_survey WHERE project_name = $1 ORDER BY project_tree_id ASC', [projectName]);
        // 將回應包裹在標準格式中
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(`獲取專案 [${projectName}] 的樹木資料錯誤:`, err);
        res.status(500).json({ success: false, message: '查詢資料庫時發生錯誤' });
    }
});

// 根據區位名稱獲取樹木
router.get('/by_area/:areaName', async (req, res) => {
    const { areaName } = req.params;
    try {
        const { rows } = await db.query('SELECT * FROM tree_survey WHERE project_location = $1 ORDER BY system_tree_id ASC', [areaName]);
        // 將回應包裹在標準格式中
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(`獲取區位 [${areaName}] 的樹木資料錯誤:`, err);
        res.status(500).json({ success: false, message: '查詢資料庫時發生錯誤' });
    }
});

// 新增樹木資料
router.post('/', async (req, res) => {
    const {
        '專案區位': project_location, '專案代碼': project_code, '專案名稱': project_name, 
        '系統樹木': system_tree_id, '專案樹木': project_tree_id, '樹種編號': species_id, 
        '樹種名稱': species_name, 'X坐標': x_coord, 'Y坐標': y_coord, '狀況': status, 
        '註記': notes, '樹木備註': tree_notes, '樹高（公尺）': tree_height_m, 
        '胸徑（公分）': dbh_cm, '調查備註': survey_notes, '調查時間': survey_time, 
        '碳儲存量': carbon_storage, '推估年碳吸存量': carbon_sequestration_per_year
    } = req.body;

    const values = [
        project_location || '無',
        project_code || '無',
        project_name || '無',
        system_tree_id || '無',
        project_tree_id || '無',
        species_id || '無',
        species_name || '無',
        x_coord || 0,
        y_coord || 0,
        status || '無',
        notes || '無',
        tree_notes || '無',
        tree_height_m || 0,
        dbh_cm || 0,
        survey_notes || '無',
        survey_time || new Date().toISOString(),
        carbon_storage || 0,
        carbon_sequestration_per_year || 0
    ];

    const sql = `
        INSERT INTO tree_survey 
        (project_location, project_code, project_name, system_tree_id, project_tree_id, species_id, 
        species_name, x_coord, y_coord, status, notes, tree_notes, tree_height_m, 
        dbh_cm, survey_notes, survey_time, carbon_storage, carbon_sequestration_per_year) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id;
    `;
    
    try {
        const { rows } = await db.query(sql, values);
        res.status(201).json({ success: true, message: '資料插入成功', id: rows[0].id });
    } catch (err) {
        console.error('資料庫插入錯誤:', err);
        // [FIX] 將錯誤回應改為 JSON 格式以符合前端期望
        res.status(500).json({ success: false, message: '資料庫插入錯誤' });
    }
});

// 編輯樹木資料
router.put('/:id', async (req, res) => {
    // --- DEBUG START ---
    console.log(`[DEBUG] Received PUT request for ID: ${req.params.id}`);
    console.log('[DEBUG] Request Body for update:', JSON.stringify(req.body, null, 2));
    // --- DEBUG END ---

    const { id } = req.params;

    // 中文鍵名到資料庫欄位的映射
    const fieldMapping = {
        '專案區位': 'project_location',
        '專案代碼': 'project_code',
        '專案名稱': 'project_name',
        '系統樹木': 'system_tree_id',
        '專案樹木': 'project_tree_id',
        '樹種編號': 'species_id',
        '樹種名稱': 'species_name',
        'X坐標': 'x_coord',
        'Y坐標': 'y_coord',
        '狀況': 'status',
        '註記': 'notes',
        '樹木備註': 'tree_notes',
        '樹高（公尺）': 'tree_height_m',
        '胸徑（公分）': 'dbh_cm',
        '調查備註': 'survey_notes',
        '調查時間': 'survey_time',
        '碳儲存量': 'carbon_storage',
        '推估年碳吸存量': 'carbon_sequestration_per_year'
    };

    const updates = [];
    const values = [];
    let queryIndex = 1;

    for (const [key, value] of Object.entries(req.body)) {
        if (fieldMapping[key] && value !== undefined) {
            updates.push(`${fieldMapping[key]} = $${queryIndex++}`);
            values.push(value);
        }
    }

    if (updates.length === 0) {
        return res.status(400).json({ success: false, message: '沒有提供要更新的資料' });
    }

    values.push(id);
    const sql = `UPDATE tree_survey SET ${updates.join(', ')} WHERE id = $${queryIndex}`;

    try {
        const { rowCount } = await db.query(sql, values);
        if (rowCount > 0) {
            res.status(200).json({ success: true, message: '樹木資料更新成功' });
        } else {
            res.status(404).json({ success: false, message: '找不到要更新的樹木資料' });
        }
    } catch (err) {
        console.error('更新錯誤:', err);
        res.status(500).json({ success: false, message: '更新資料時發生錯誤' });
    }
});


// 刪除樹木資料
router.delete('/:id', async (req, res) => {
    // --- DEBUG START ---
    console.log(`[DEBUG] Received DELETE request for ID: ${req.params.id}`);
    // --- DEBUG END ---
    const { id } = req.params;
    try {
        const { rowCount } = await db.query('DELETE FROM tree_survey WHERE id = $1', [id]);
        if (rowCount > 0) {
            res.json({ success: true, message: '樹木資料刪除成功' });

            // 在回應發送後，異步執行清理任務
            // "Fire-and-forget"
            cleanupUnusedSpecies();
            cleanupUnusedProjectAreas();

        } else {
            res.status(404).json({ success: false, message: '找不到指定的樹木資料' });
        }
    } catch (err) {
        console.error('刪除樹木資料錯誤:', err);
        res.status(500).json({ success: false, message: '刪除樹木資料失敗' });
    }
});

// 獲取下一個系統樹木編號
router.get('/next_system_number', async (req, res) => {
    try {
        const query = `
            SELECT MAX(CAST(regexp_replace(system_tree_id, '[^0-9]', '', 'g') AS INTEGER)) as max_id 
            FROM tree_survey 
            WHERE system_tree_id ~ '^[A-Za-z]+-[0-9]+$' OR system_tree_id ~ '^[0-9]+$';
        `;
        const { rows } = await db.query(query);
        const maxId = rows[0].max_id || 0;
        res.json({ success: true, nextNumber: maxId + 1 });
    } catch (err) {
        console.error('獲取下一個系統樹木編號錯誤:', err);
        res.status(500).json({ success: false, message: '獲取編號時發生錯誤' });
    }
});

// 獲取下一個專案樹木編號（根據專案代碼）
router.get('/next_project_number/:projectCode', async (req, res) => {
    const { projectCode } = req.params;
    try {
        const query = `
            SELECT MAX(CAST(regexp_replace(project_tree_id, '[^0-9]', '', 'g') AS INTEGER)) as max_id 
            FROM tree_survey 
            WHERE project_code = $1 AND (project_tree_id ~ '^[A-Za-z]+-[0-9]+$' OR project_tree_id ~ '^[0-9]+$');
        `;
        const { rows } = await db.query(query, [projectCode]);
        const maxId = rows[0].max_id || 0;
        res.json({ success: true, nextNumber: maxId + 1 });
    } catch (err) {
        console.error(`獲取專案 ${projectCode} 的下一個樹木編號錯誤:`, err);
        res.status(500).json({ success: false, message: '獲取編號時發生錯誤' });
    }
});

// 獲取專案的常見樹種
router.get('/common_species/:projectCode', async (req, res) => {
    const { projectCode } = req.params;
    const query = `
      SELECT 
        species_id AS "樹種編號", 
        species_name AS "樹種名稱", 
        COUNT(*) as count
      FROM tree_survey
      WHERE project_code = $1
      GROUP BY species_id, species_name
      ORDER BY count DESC
      LIMIT 5;
    `;
    try {
        const { rows } = await db.query(query, [projectCode]);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('獲取常見樹種錯誤:', err);
        res.status(500).json({ success: false, message: '獲取常見樹種時發生錯誤' });
    }
});


// 批量匯入 (從 index_4.js 遷移並重構)
router.post('/import', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '請選擇要上傳的文件' });
    }

    const client = await db.pool.connect();
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
            return res.status(400).json({ success: false, message: '文件中沒有數據' });
        }

        await client.query('BEGIN');

        let successCount = 0;
        const errors = [];

        const sql = `
            INSERT INTO tree_survey 
            (project_location, project_code, project_name, system_tree_id, project_tree_id, species_id, 
            species_name, x_coord, y_coord, status, notes, tree_notes, tree_height_m, 
            dbh_cm, survey_notes, survey_time, carbon_storage, carbon_sequestration_per_year) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `;

        for (const row of data) {
            const values = [
                row['專案區位'] || '無',
                row['專案代碼'] || '無',
                row['專案名稱'] || '無',
                row['系統樹木']?.toString() || '0',
                row['專案樹木']?.toString() || '0',
                row['樹種編號'] || '無',
                row['樹種名稱'] || '無',
                parseFloat(row['X坐標']) || 0,
                parseFloat(row['Y坐標']) || 0,
                row['狀況'] || '無',
                row['註記'] || '無',
                row['樹木備註'] || '無',
                parseFloat(row['樹高（公尺）']) || 0,
                parseFloat(row['胸徑（公分）']) || 0,
                row['調查備註'] || '無',
                row['調查時間'] ? new Date(row['調查時間']) : new Date(),
                parseFloat(row['碳儲存量']) || 0,
                parseFloat(row['推估年碳吸存量']) || 0
            ];
            
            try {
                await client.query(sql, values);
                successCount++;
            } catch (err) {
                errors.push({ row: row, error: err.message });
            }
        }

        if (errors.length > 0) {
            await client.query('ROLLBACK');
            res.status(400).json({
                success: false,
                message: `導入失敗 ${errors.length} 條記錄，已全部復原。`,
                details: {
                    errorCount: errors.length,
                    errors: errors.slice(0, 10)
                }
            });
        } else {
            await client.query('COMMIT');
            res.json({
                success: true,
                message: `成功導入 ${successCount} 條記錄。`,
                details: {
                    successCount,
                    errorCount: 0
                }
            });
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('批量導入錯誤:', error);
        res.status(500).json({ success: false, message: '批量導入時發生錯誤', error: error.message });
    } finally {
        client.release();
        // 刪除臨時文件
        fs.unlink(req.file.path, (err) => {
            if (err) console.error("刪除上傳文件失敗:", err);
        });
    }
});


// 下載模板 (從 index_4.js 遷移)
router.get('/template', (req, res) => {
    const templatePath = path.join(__dirname, '..', 'data', 'tree_survey_template.xlsx');
  
    if (!fs.existsSync(templatePath)) {
        // 如果模板不存在，創建一個
        const workbook = xlsx.utils.book_new();
        const templateData = [{
            '專案區位': '範例區域', '專案代碼': 'P001', '專案名稱': '範例專案',
            '系統樹木': 'T001', '專案樹木': 'PT001', '樹種編號': 'S001',
            '樹種名稱': '臺灣欒樹', 'X坐標': 121.5, 'Y坐標': 25.0,
            '狀況': '健康', '註記': '', '樹木備註': '',
            '樹高（公尺）': 5.5, '胸徑（公分）': 20.0, '調查備註': '',
            '調查時間': new Date().toISOString(), '碳儲存量': 50.5, '推估年碳吸存量': 10.2
        }];
        const worksheet = xlsx.utils.json_to_sheet(templateData);
        xlsx.utils.book_append_sheet(workbook, worksheet, '樹木調查模板');
        
        try {
            xlsx.writeFile(workbook, templatePath);
        } catch (e) {
            console.error("創建模板文件失敗:", e);
            return res.status(500).send("無法創建模板文件");
        }
    }
  
    res.download(templatePath, '樹木調查模板.xlsx', (err) => {
        if (err) {
            console.error("下載模板失敗:", err);
            res.status(500).send("無法下載模板");
        }
    });
});


module.exports = router;
