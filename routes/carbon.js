const express = require('express');
const router = express.Router();
const db = require('../config/db');
const openaiController = require('../controllers/openaiController');
const carbonSinkController = require('../controllers/carbonSinkController');
const { aiLimiter } = require('../middleware/rateLimiter'); // Added aiLimiter import

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
router.get('/trading/market_data', async (req, res) => {
    // 模擬數據
    const marketData = { current_price: 25.75, trend: 'up' };
    res.json({ success: true, data: marketData });
});

router.get('/trading/credit_calculator', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT SUM("碳儲存量") as total_carbon_storage, SUM("推估年碳吸存量") as annual_carbon_sequestration FROM tree_survey');
        const data = rows[0];
        const totalCredits = (data.total_carbon_storage || 0) / 1000;
        const annualCredits = (data.annual_carbon_sequestration || 0) / 1000;
        const estimatedValue = {
            current: totalCredits * 25.75,
            annual_potential: annualCredits * 25.75
        };
        res.json({ success: true, data: { total_credits: totalCredits, annual_credits: annualCredits, estimated_value: estimatedValue } });
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

// 新增：從 index_1.js 遷移過來的碳權估算 API
router.get('/credit_estimation', async (req, res) => {
    const CARBON_CREDIT_RATE = 0.05; // 假設每公斤碳吸存量可獲得0.05個碳權
    try {
        const query = `
            SELECT 
                species_name, 
                SUM(carbon_sequestration_per_year) as total_annual_carbon 
            FROM tree_survey 
            GROUP BY species_name
        `;
        const { rows } = await db.query(query);

        const estimation = rows.map(r => ({
            樹種: r.species_name,
            年碳吸存量: parseFloat(r.total_annual_carbon) || 0,
            預估碳權: ((parseFloat(r.total_annual_carbon) || 0) * CARBON_CREDIT_RATE).toFixed(2)
        }));

        res.json({
            success: true,
            data: {
                總預估碳權: estimation.reduce((sum, e) => sum + parseFloat(e.預估碳權), 0).toFixed(2),
                各樹種碳權估算: estimation
            }
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
