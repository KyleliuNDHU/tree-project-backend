const express = require('express');
const router = express.Router();
const db = require('../config/db');
const turf = require('@turf/turf');
const fs = require('fs');
const { 
    cleanupUnusedProjectAreas, 
    cleanupUnusedSpecies, 
    cleanupOrphanedPlaceholders 
} = require('../utils/cleanup');

// 載入台灣縣市 GeoJSON 資料
let countyPolygons = new Map();
try {
    const taiwanGeoJSON = JSON.parse(fs.readFileSync('./data/twCounty2010.fixed.geo.json', 'utf8'));
    taiwanGeoJSON.features.forEach((feature) => {
        const name = feature.properties.COUNTYNAME.replace('臺', '台').replace('市', '').replace('縣', '');
        countyPolygons.set(name, feature.geometry);
    });
} catch (e) {
    console.error("無法載入或解析 GeoJSON 檔案:", e);
}


function getCountyByCoordinates(lat, lng) {
    const point = turf.point([lng, lat]);
    for (const [county, geometry] of countyPolygons) {
        try {
            if (geometry.type === 'Polygon') {
                const poly = turf.polygon(geometry.coordinates);
                if (turf.booleanPointInPolygon(point, poly)) {
                    return county;
                }
            } else if (geometry.type === 'MultiPolygon') {
                for (const polyCoords of geometry.coordinates) {
                    const poly = turf.polygon(polyCoords);
                    if (turf.booleanPointInPolygon(point, poly)) {
                        return county;
                    }
                }
            }
        } catch(e) {
            console.error(`處理 ${county} 的 GeoJSON 時出錯: `, e);
        }
    }
    return null;
}


// 取得專案區位列表
router.get('/', async (req, res) => {
    const { city } = req.query;
    let query = 'SELECT * FROM project_areas';
    const params = [];

    if (city) {
        if (city.endsWith('市') || city.endsWith('縣')) {
            query += ' WHERE city = $1';
            params.push(city);
        } else {
            query += ' WHERE city = $1 OR city = $2';
            params.push(city + '市', city + '縣');
        }
    }
    query += ' ORDER BY area_code ASC';

    try {
        const { rows } = await db.query(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('查詢區位時發生錯誤:', err);
        res.status(500).json({ success: false, message: '查詢區位時發生錯誤' });
    }
});

// 新增專案區位
router.post('/', async (req, res) => {
    const { area_name, description, city, xCoord, yCoord, isSubmit } = req.body;
    if (!area_name) {
        return res.status(400).json({ success: false, message: '區位名稱不能為空' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: existingAreas } = await client.query('SELECT area_code, city FROM project_areas WHERE area_name = $1', [area_name]);
        if (existingAreas.length > 0) {
            // 區位已存在，直接返回資訊
            await client.query('ROLLBACK');
            return res.status(200).json({ 
                success: true, 
                message: "區位已存在",
                data: { area_name, area_code: existingAreas[0].area_code, description, city: existingAreas[0].city }
            });
        }

        const { rows: allAreas } = await client.query('SELECT area_code FROM project_areas');
        const usedNumbers = new Set(allAreas.map(row => {
            const match = row.area_code && row.area_code.match(/^AREA-(\d{3})$/);
            return match ? parseInt(match[1], 10) : null;
        }).filter(n => n !== null));
        
        let nextNum = 1;
        while (usedNumbers.has(nextNum)) {
            nextNum++;
        }
        const nextCode = `AREA-${String(nextNum).padStart(3, '0')}`;

        let finalCity = city;
        if (isSubmit && yCoord && xCoord) {
            const detectedCity = getCountyByCoordinates(yCoord, xCoord);
            if (detectedCity) {
                finalCity = detectedCity.match(/(台北|新北|桃園|台中|台南|高雄|基隆|新竹市|嘉義市)/) ? detectedCity + '市' : detectedCity + '縣';
            }
        }

        const { rows: insertResult } = await client.query(
            'INSERT INTO project_areas (area_name, area_code, description, city) VALUES ($1, $2, $3, $4) RETURNING id',
            [area_name, nextCode, description, finalCity]
        );

        await client.query('COMMIT');
        res.status(201).json({ success: true, data: { id: insertResult[0].id, area_name, area_code: nextCode, description, city: finalCity } });

    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ success: false, message: '區位名稱或代碼已存在' });
        }
        console.error('新增區位時發生錯誤:', err);
        res.status(500).json({ success: false, message: '新增區位時發生錯誤' });
    } finally {
        client.release();
    }
});

// 修改專案區位
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { area_name, area_code, description } = req.body;
    if (!area_name || !area_code) {
        return res.status(400).json({ success: false, message: '請提供區位名稱與代碼' });
    }
    try {
        const { rowCount } = await db.query('UPDATE project_areas SET area_name = $1, area_code = $2, description = $3 WHERE id = $4', [area_name, area_code, description || null, id]);
        if (rowCount > 0) {
            res.status(200).json({ success: true, message: '區位更新成功' });
        } else {
            res.status(404).json({ success: false, message: '找不到要更新的區位' });
        }
    } catch (err) {
        console.error('更新區位錯誤:', err);
        res.status(500).json({ success: false, message: '更新區位失敗' });
    }
});

// 刪除專案區位
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await db.query('DELETE FROM project_areas WHERE id = $1', [id]);
        if (rowCount > 0) {
            res.status(200).json({ success: true, message: '區位刪除成功' });
        } else {
            res.status(404).json({ success: false, message: '找不到要刪除的區位' });
        }
    } catch (err) {
        console.error('刪除區位錯誤:', err);
        res.status(500).json({ success: false, message: '刪除區位失敗' });
    }
});


// 手動觸發清理
router.post('/cleanup', async (req, res) => {
    try {
        console.log('[API] Manual cleanup process triggered.');
        // 呼叫所有清理函式
        await cleanupOrphanedPlaceholders();
        await cleanupUnusedSpecies();
        await cleanupUnusedProjectAreas();
        
        console.log('[API] Manual cleanup process finished successfully.');
        res.json({
            success: true,
            message: '手動清理完成',
        });
    } catch (err) {
        console.error('手動觸發清理失敗:', err);
        res.status(500).json({ success: false, message: '清理失敗' });
    }
});


module.exports = router;
