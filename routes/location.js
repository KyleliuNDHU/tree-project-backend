const express = require('express');
const router = express.Router();
const db = require('../config/db');
const turf = require('@turf/turf');
const fs = require('fs');

// 載入台灣縣市 GeoJSON 資料
let countyPolygons = new Map();
try {
    const taiwanGeoJSON = JSON.parse(fs.readFileSync(require.resolve('../data/twCounty2010.fixed.geo.json')));
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

// 驗證位置是否在指定區位的合理範圍內
router.post('/validate', (req, res) => {
    const { area, latitude, longitude } = req.body;
    
    // 基本座標範圍驗證（台灣範圍）
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng) || lat < 21.5 || lat > 26.5 || lng < 119 || lng > 123) {
        return res.json({ success: true, isValid: false, message: '座標超出台灣範圍' });
    }
    
    // 使用 GeoJSON 判斷座標所在區位
    const suggestedArea = getCountyByCoordinates(lat, lng);
    if (area && suggestedArea && suggestedArea !== area) {
        return res.json({ 
            success: true, 
            isValid: false, 
            message: `座標位於「${suggestedArea}」，與指定區位「${area}」不符`,
            suggestedArea 
        });
    }
    
    res.json({ success: true, isValid: true, message: '位置驗證通過' });
});
  
// 建議合理的區位
router.post('/suggest_area', (req, res) => {
    const { latitude, longitude } = req.body;
    const suggestedArea = getCountyByCoordinates(latitude, longitude);
    if(suggestedArea) {
        res.json({ success: true, suggestedArea: suggestedArea });
    } else {
        res.json({ success: false, message: "無法判斷建議區位" });
    }
});

module.exports = router;
