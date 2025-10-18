const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const format = require('pg-format');
const reportController = require('../controllers/reportController');

// 匯出 Excel
router.get('/export/excel', async (req, res) => {
    const { project_codes } = req.query;
    let sql = 'SELECT * FROM tree_survey';
    const params = [];

    if (project_codes) {
        const codesArray = project_codes.split(',').map(code => code.trim()).filter(code => code);
        if (codesArray.length > 0) {
            // 使用 pg-format 安全地處理 IN 子句
            sql += format(' WHERE project_code IN (%L)', codesArray);
        }
    }

    try {
        const { rows } = await db.query(sql, params);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('樹木調查資料');

        worksheet.columns = [
            { header: '專案區位', key: 'project_location' },
            { header: '專案代碼', key: 'project_code' },
            { header: '專案名稱', key: 'project_name' },
            { header: '系統樹木', key: 'system_tree_id' },
            { header: '專案樹木', key: 'project_tree_id' },
            { header: '樹種編號', key: 'species_id' },
            { header: '樹種名稱', key: 'species_name' },
            { header: 'X坐標', key: 'x_coord' },
            { header: 'Y坐標', key: 'y_coord' },
            { header: '狀況', key: 'status' },
            { header: '註記', key: 'notes' },
            { header: '樹木備註', key: 'tree_notes' },
            { header: '樹高（公尺）', key: 'tree_height_m' },
            { header: '胸徑（公分）', key: 'dbh_cm' },
            { header: '調查備註', key: 'survey_notes' },
            { header: '調查時間', key: 'survey_time' },
            { header: '碳儲存量', key: 'carbon_storage' },
            { header: '推估年碳吸存量', key: 'carbon_sequestration_per_year' }
        ];

        worksheet.addRows(rows);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `tree_survey_export_${timestamp}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('匯出 Excel 錯誤:', err);
        res.status(500).json({ success: false, message: '匯出 Excel 時發生錯誤' });
    }
});

// 匯出 PDF
router.get('/export/pdf', async (req, res) => {
    const { project_codes } = req.query;
    let sql = 'SELECT * FROM tree_survey';

    if (project_codes) {
        const codesArray = project_codes.split(',').map(code => code.trim()).filter(code => code);
        if (codesArray.length > 0) {
            sql += format(' WHERE project_code IN (%L)', codesArray);
        }
    }

    try {
        const { rows } = await db.query(sql);
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        const fontPath = path.join(__dirname, '../Noto_Sans_TC/NotoSansTC-Regular.otf');
        if (fs.existsSync(fontPath)) {
            doc.font(fontPath);
        } else {
            console.error('中文字型檔案未找到:', fontPath);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `tree_survey_export_${timestamp}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        doc.pipe(res);

        doc.fontSize(20).text('樹木調查資料', { align: 'center' });
        doc.moveDown();

        rows.forEach((tree, index) => {
            doc.fontSize(12).text(`資料 ${index + 1}:`, { underline: true });
            const treeDetails = [
                `專案區位: ${tree.project_location || 'N/A'}`,
                `專案代碼: ${tree.project_code || 'N/A'}`,
                `專案名稱: ${tree.project_name || 'N/A'}`,
                `樹種名稱: ${tree.species_name || 'N/A'}`,
                `樹高: ${tree.tree_height_m || 0} 公尺`,
                `胸徑: ${tree.dbh_cm || 0} 公分`,
                `狀況: ${tree.status || 'N/A'}`
            ];
            doc.fontSize(10).list(treeDetails, { bulletRadius: 2 });
            doc.moveDown();
        });

        doc.end();
    } catch (err) {
        console.error('匯出 PDF 錯誤:', err);
        res.status(500).json({ success: false, message: '匯出 PDF 時發生錯誤' });
    }
});

// 新增：遷移自 index_1.js 的簡易永續報告
// 注意：此為基礎報表，主要功能請參考 /api/reports/ai-sustainability 的 AI 永續報告
router.get('/sustainability_report', reportController.generateSustainabilityReport);


// ... (AI 報告路由將在 ai.js 中處理) ...


module.exports = router;
