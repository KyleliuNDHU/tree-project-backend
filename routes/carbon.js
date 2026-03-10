const express = require('express');
const router = express.Router();
const db = require('../config/db');
const openaiController = require('../controllers/openaiController');
const carbonSinkController = require('../controllers/carbonSinkController');
const { aiLimiter } = require('../middleware/rateLimiter');

// 从 index_3.js 迁移过来的碳足跡抵銷 API
router.post('/footprint/offset', aiLimiter, async (req, res) => {
    try {
        const { amount, unit } = req.body;
        if (!amount || !unit) {
            return res.status(400).json({ success: false, message: '請提供碳足跡數量和單位' });
        }
        // 注意：這個 controller 內部可能仍在使用 mysql 語法，後續需要重構
        const offsetResults = await openaiController.calculateCarbonOffsetTree({ amount, unit });
        res.json({ success: true, data: offsetResults });
    } catch (error) {
        console.error('計算碳足跡抵消錯誤:', error);
        res.status(500).json({ success: false, message: '計算碳足跡抵消時發生錯誤', error: error.message });
    }
});

// 碳足跡計算器 API (從 index_3.js 遷移並強化)
router.post('/footprint/calculator', async (req, res) => {
    const { activityType, amount, unit } = req.body;
    if (!activityType || !amount || !unit) {
        return res.status(400).json({ success: false, message: '請提供活動類型、數量和單位' });
    }

    const client = await db.pool.connect();
    try {
        // --- 直接排放 ---
        const { rows: factorRows } = await client.query('SELECT factor_value, source FROM emission_factors WHERE activity_type = $1 AND unit = $2 LIMIT 1', [activityType, unit]);
        
        if (factorRows.length === 0) {
            return res.status(400).json({ success: false, message: `資料庫無排放因子：${activityType} (${unit})` });
        }
        
        const emissionFactor = parseFloat(factorRows[0].factor_value);
        const carbonFootprintDirectKg = parseFloat(amount) * emissionFactor;

        // --- 間接排放 (僅電力) ---
        let indirectEmissionFactor = null;
        let carbonFootprintIndirectKg = 0;
        let indirectFactorSource = null;

        if (activityType === '電力') {
            const { rows: indirectRows } = await client.query('SELECT factor_value, source FROM emission_factors WHERE activity_type = $1 AND unit = $2 LIMIT 1', ['電力間接', unit]);
            if (indirectRows.length > 0) {
                indirectEmissionFactor = parseFloat(indirectRows[0].factor_value);
                indirectFactorSource = indirectRows[0].source || '資料庫 emission_factors';
                carbonFootprintIndirectKg = parseFloat(amount) * indirectEmissionFactor;
            }
        }
        
        const carbonFootprintTotalKg = carbonFootprintDirectKg + carbonFootprintIndirectKg;

        // --- 碳抵消建議 (動態從 tree_carbon_data) ---
        let offsetResults = {
            carbonFootprintKg: carbonFootprintTotalKg,
            note: "樹木抵消碳排放是長期過程..."
        };

        const avgAbsorptionSql = `
            SELECT AVG((carbon_absorption_min + carbon_absorption_max) / 2) as avg_annual_absorption_kg
            FROM tree_carbon_data
            WHERE carbon_absorption_min IS NOT NULL AND carbon_absorption_max IS NOT NULL;
        `;
        const { rows: avgResult } = await client.query(avgAbsorptionSql);
        
        let generalAvgAbsorption = 20; // Default
        if (avgResult.length > 0 && avgResult[0].avg_annual_absorption_kg) {
            generalAvgAbsorption = parseFloat(avgResult[0].avg_annual_absorption_kg);
        }

        if (generalAvgAbsorption > 0) {
            offsetResults.treesNeededForOneYear = Math.ceil(carbonFootprintTotalKg / generalAvgAbsorption);
            offsetResults.treesNeededFor10Years = Math.ceil(carbonFootprintTotalKg / (generalAvgAbsorption * 10));
            offsetResults.treesNeededFor20Years = Math.ceil(carbonFootprintTotalKg / (generalAvgAbsorption * 20));
        }

        const topSpeciesSql = `
            SELECT common_name_zh, (carbon_absorption_min + carbon_absorption_max) / 2 as avg_absorption
            FROM tree_carbon_data
            WHERE carbon_absorption_min IS NOT NULL AND carbon_absorption_max IS NOT NULL
            ORDER BY avg_absorption DESC
            LIMIT 4;
        `;
        const { rows: topSpeciesResult } = await client.query(topSpeciesSql);

        if (topSpeciesResult.length > 0) {
            offsetResults.speciesComparison = {};
            topSpeciesResult.forEach(species => {
                const avgAbsorption = parseFloat(species.avg_absorption);
                if (avgAbsorption > 0) {
                    offsetResults.speciesComparison[species.common_name_zh] = Math.ceil(carbonFootprintTotalKg / avgAbsorption);
                }
            });
        }

        // --- 組合回傳資料 ---
        const responseData = {
            activityType,
            amount,
            unit,
            emissionFactor,
            factorSource: factorRows[0].source,
            carbonFootprintDirect: parseFloat(carbonFootprintDirectKg.toFixed(2)),
            resultUnit: carbonFootprintTotalKg > 1000 ? 'ton CO₂-eq' : 'kg CO₂-eq',
            carbonFootprintTotal: parseFloat((carbonFootprintTotalKg > 1000 ? carbonFootprintTotalKg / 1000 : carbonFootprintTotalKg).toFixed(2)),
            offsetResults,
        };

        if (indirectEmissionFactor !== null) {
            responseData.indirectEmissionFactor = indirectEmissionFactor;
            responseData.indirectFactorSource = indirectFactorSource;
            responseData.carbonFootprintIndirect = parseFloat(carbonFootprintIndirectKg.toFixed(2));
        }

        res.json({ success: true, data: responseData });

    } catch (error) {
        console.error('計算碳足跡錯誤:', error);
        res.status(500).json({ success: false, message: '計算碳足跡時發生錯誤', error: error.message });
    } finally {
        client.release();
    }
});

// --- 碳匯助手 (Carbon Sink) ---
router.get('/sink/tree-species', carbonSinkController.getTreeSpecies);
router.get('/sink/species', carbonSinkController.calculateSpeciesCarbon);
router.post('/sink/calculate', carbonSinkController.calculateTotalCarbon);
router.get('/sink/recommend-by-region', carbonSinkController.recommendByRegion);
router.get('/sink/filter-by-efficiency', carbonSinkController.filterByEfficiency);
router.get('/sink/filter-by-environment', carbonSinkController.filterByEnvironment);
router.post('/sink/mixed-forest', carbonSinkController.generateMixedForest);

// --- 碳交易與優化 ---
// 注意：碳交易市場價格需來自公開 API 或第三方數據源，
//       目前尚未串接即時數據，因此這些端點回傳本系統的碳儲存統計，
//       不提供市場價格。

router.get('/trading/credit_calculator', async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT COALESCE(SUM(carbon_storage), 0) as total_carbon_storage,
                    COALESCE(SUM(carbon_sequestration_per_year), 0) as annual_carbon_sequestration
             FROM tree_survey`
        );
        const data = rows[0];
        const totalCarbonKg = parseFloat(data.total_carbon_storage) || 0;
        const annualSeqKg = parseFloat(data.annual_carbon_sequestration) || 0;
        // 轉為 CO₂ 當量噸
        const totalCO2Ton = (totalCarbonKg * 3.67) / 1000;
        const annualCO2Ton = (annualSeqKg * 3.67) / 1000;
        res.json({
            success: true,
            data: {
                total_carbon_kg: Math.round(totalCarbonKg * 100) / 100,
                annual_sequestration_kg: Math.round(annualSeqKg * 100) / 100,
                total_co2_equivalent_ton: Math.round(totalCO2Ton * 100) / 100,
                annual_co2_equivalent_ton: Math.round(annualCO2Ton * 100) / 100,
            },
            note: '碳權價值需參考即時市場行情，本系統目前僅提供碳儲存統計。',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: '計算碳信用額度失敗' });
    }
});

router.get('/optimization/species_recommendation', async (req, res) => {
    const { region_code = 'N', limit = 5, min_score = 3 } = req.query;
    try {
        const query = `
            SELECT tcd.common_name_zh, (tcd.carbon_absorption_min + tcd.carbon_absorption_max) / 2 AS avg_carbon_absorption, srs.score AS region_score
            FROM tree_carbon_data tcd
            JOIN species_region_score srs ON tcd.id = srs.species_id
            WHERE srs.region_code = $1 AND srs.score >= $2
            ORDER BY srs.score DESC, avg_carbon_absorption DESC
            LIMIT $3;
        `;
        const { rows } = await db.query(query, [region_code, min_score, limit]);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: '獲取樹種推薦時發生內部錯誤' });
    }
});

// 碳權估算 — 僅提供碳吸存量統計，不使用未經驗證的碳權換算率
router.get('/credit_estimation', async (req, res) => {
    try {
        const query = `
            SELECT 
                species_name, 
                COUNT(*) as tree_count,
                ROUND(SUM(carbon_sequestration_per_year)::numeric, 2) as total_annual_carbon_kg,
                ROUND(SUM(carbon_sequestration_per_year * 3.67 / 1000)::numeric, 4) as total_annual_co2_ton
            FROM tree_survey 
            GROUP BY species_name
            ORDER BY total_annual_carbon_kg DESC
        `;
        const { rows } = await db.query(query);

        res.json({
            success: true,
            data: {
                各樹種碳吸存統計: rows,
            },
            note: '碳權額度需經授權驗證機構 (VVB) 依特定方法學核證後方可取得，此處僅列出年碳吸存量統計。',
        });

    } catch (err) {
        console.error('計算碳權估算時發生錯誤:', err);
        res.status(500).json({ success: false, message: '無法計算碳權估算' });
    }
});

// 新增：從 index_3.js 遷移過來的碳匯相關 API
router.get('/education/:topic', aiLimiter, async (req, res) => {
    try {
        const { topic } = req.params;
        const content = await openaiController.generateCarbonEducationContent(topic);
        res.json({ success: true, content });
    } catch (error) {
        console.error('生成碳匯教育內容錯誤:', error);
        res.status(500).json({ success: false, message: '生成碳匯教育內容時發生錯誤', error: error.message });
    }
});

router.post('/footprint/advice', aiLimiter, async (req, res) => {
    try {
        const { activityType, amount, unit } = req.body;
        if (!activityType || !amount || !unit) {
            return res.status(400).json({ success: false, message: '請提供活動類型、數量和單位' });
        }
        const advice = await openaiController.generateCarbonFootprintAdvice(req.body);
        res.json({ success: true, advice });
    } catch (error) {
        console.error('生成碳足跡建議錯誤:', error);
        res.status(500).json({ success: false, message: '生成碳足跡建議時發生錯誤', error: error.message });
    }
});


module.exports = router;
