/**
 * V3 專案邊界 API
 * 
 * 功能：
 * 1. 儲存使用者手動繪製的專案邊界多邊形
 * 2. 查詢專案邊界
 * 3. 判斷座標是否在特定專案邊界內
 * 4. 根據座標查詢對應的專案
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const turf = require('@turf/turf');

/**
 * 初始化資料表 (如果不存在)
 */
async function initializeTable() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS project_boundaries (
            id SERIAL PRIMARY KEY,
            project_name VARCHAR(255) NOT NULL UNIQUE,
            project_code VARCHAR(50),
            boundary_coordinates JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_project_boundaries_name ON project_boundaries(project_name);
        CREATE INDEX IF NOT EXISTS idx_project_boundaries_code ON project_boundaries(project_code);
    `;
    
    try {
        await db.query(createTableQuery);
        console.log('[project_boundaries] 資料表初始化完成');
    } catch (err) {
        console.error('[project_boundaries] 資料表初始化錯誤:', err);
    }
}

// 啟動時初始化資料表
initializeTable();

/**
 * 取得所有專案邊界
 * GET /api/project_boundaries
 */
router.get('/', async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT id, project_name, project_code, boundary_coordinates, created_at, updated_at
            FROM project_boundaries
            ORDER BY project_name ASC
        `);
        
        res.json({ 
            success: true, 
            data: rows.map(row => ({
                ...row,
                // 確保 coordinates 是正確的陣列格式
                boundary_coordinates: typeof row.boundary_coordinates === 'string' 
                    ? JSON.parse(row.boundary_coordinates) 
                    : row.boundary_coordinates
            }))
        });
    } catch (err) {
        console.error('[project_boundaries] 取得邊界列表錯誤:', err);
        res.status(500).json({ success: false, message: '取得專案邊界列表失敗' });
    }
});

/**
 * 取得特定專案的邊界
 * GET /api/project_boundaries/:projectName
 */
router.get('/:projectName', async (req, res) => {
    const { projectName } = req.params;
    
    try {
        const { rows } = await db.query(
            'SELECT * FROM project_boundaries WHERE project_name = $1',
            [projectName]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: '找不到該專案的邊界',
                hasBoundary: false
            });
        }
        
        const boundary = rows[0];
        res.json({ 
            success: true, 
            data: {
                ...boundary,
                boundary_coordinates: typeof boundary.boundary_coordinates === 'string'
                    ? JSON.parse(boundary.boundary_coordinates)
                    : boundary.boundary_coordinates
            },
            hasBoundary: true
        });
    } catch (err) {
        console.error('[project_boundaries] 取得專案邊界錯誤:', err);
        res.status(500).json({ success: false, message: '取得專案邊界失敗' });
    }
});

/**
 * 新增或更新專案邊界
 * POST /api/project_boundaries
 * 
 * Body:
 * {
 *   projectName: string,
 *   projectCode: string (optional),
 *   coordinates: [[lat, lng], [lat, lng], ...] // 多邊形頂點
 * }
 */
router.post('/', async (req, res) => {
    const { projectName, projectCode, coordinates } = req.body;
    
    // 驗證輸入
    if (!projectName) {
        return res.status(400).json({ success: false, message: '專案名稱不能為空' });
    }
    
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
        return res.status(400).json({ 
            success: false, 
            message: '邊界座標必須至少包含 3 個頂點' 
        });
    }
    
    // 驗證座標格式
    for (const coord of coordinates) {
        if (!Array.isArray(coord) || coord.length !== 2 ||
            typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
            return res.status(400).json({ 
                success: false, 
                message: '座標格式不正確，應為 [[lat, lng], ...]' 
            });
        }
    }
    
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        
        // 檢查該專案是否已有現有樹木資料
        const { rows: existingTrees } = await client.query(
            'SELECT x_coord, y_coord FROM tree_survey WHERE project_name = $1 AND x_coord IS NOT NULL AND y_coord IS NOT NULL',
            [projectName]
        );
        
        // 如果有現有樹木，驗證新邊界是否涵蓋所有樹木
        if (existingTrees.length > 0) {
            // 建立多邊形 (turf 需要 [lng, lat] 格式，且首尾相連)
            const polygonCoords = coordinates.map(c => [c[1], c[0]]); // 轉換為 [lng, lat]
            polygonCoords.push(polygonCoords[0]); // 閉合多邊形
            
            let polygon;
            try {
                polygon = turf.polygon([polygonCoords]);
            } catch (e) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    success: false, 
                    message: '無法建立有效的多邊形，請檢查座標是否正確' 
                });
            }
            
            // 檢查每棵現有樹木是否都在新邊界內
            const treesOutside = [];
            for (const tree of existingTrees) {
                const point = turf.point([tree.x_coord, tree.y_coord]); // [lng, lat]
                if (!turf.booleanPointInPolygon(point, polygon)) {
                    treesOutside.push({
                        lat: tree.y_coord,
                        lng: tree.x_coord
                    });
                }
            }
            
            if (treesOutside.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    success: false, 
                    message: `邊界無法涵蓋所有現有樹木，有 ${treesOutside.length} 棵樹在邊界外`,
                    treesOutside: treesOutside.slice(0, 10) // 最多返回 10 棵
                });
            }
        }
        
        // 使用 UPSERT 語法
        const { rows } = await client.query(`
            INSERT INTO project_boundaries (project_name, project_code, boundary_coordinates, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (project_name) 
            DO UPDATE SET 
                project_code = EXCLUDED.project_code,
                boundary_coordinates = EXCLUDED.boundary_coordinates,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [projectName, projectCode, JSON.stringify(coordinates)]);
        
        await client.query('COMMIT');
        
        res.status(201).json({ 
            success: true, 
            message: '專案邊界已儲存',
            data: rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[project_boundaries] 儲存專案邊界錯誤:', err);
        res.status(500).json({ success: false, message: '儲存專案邊界失敗' });
    } finally {
        client.release();
    }
});

/**
 * 刪除專案邊界
 * DELETE /api/project_boundaries/:projectName
 */
router.delete('/:projectName', async (req, res) => {
    const { projectName } = req.params;
    
    try {
        const { rowCount } = await db.query(
            'DELETE FROM project_boundaries WHERE project_name = $1',
            [projectName]
        );
        
        if (rowCount > 0) {
            res.json({ success: true, message: '專案邊界已刪除' });
        } else {
            res.status(404).json({ success: false, message: '找不到要刪除的專案邊界' });
        }
    } catch (err) {
        console.error('[project_boundaries] 刪除專案邊界錯誤:', err);
        res.status(500).json({ success: false, message: '刪除專案邊界失敗' });
    }
});

/**
 * 檢查座標是否在特定專案邊界內
 * POST /api/project_boundaries/check
 * 
 * Body:
 * {
 *   projectName: string,
 *   lat: number,
 *   lng: number
 * }
 */
router.post('/check', async (req, res) => {
    const { projectName, lat, lng } = req.body;
    
    if (!projectName || lat === undefined || lng === undefined) {
        return res.status(400).json({ 
            success: false, 
            message: '請提供專案名稱和座標 (lat, lng)' 
        });
    }
    
    try {
        const { rows } = await db.query(
            'SELECT boundary_coordinates FROM project_boundaries WHERE project_name = $1',
            [projectName]
        );
        
        if (rows.length === 0) {
            // 專案沒有邊界，不受座標限制
            return res.json({ 
                success: true, 
                isInside: true,
                hasBoundary: false,
                message: '該專案尚未設定邊界，不受座標限制'
            });
        }
        
        const coordinates = typeof rows[0].boundary_coordinates === 'string'
            ? JSON.parse(rows[0].boundary_coordinates)
            : rows[0].boundary_coordinates;
        
        // 建立多邊形
        const polygonCoords = coordinates.map(c => [c[1], c[0]]); // 轉換為 [lng, lat]
        polygonCoords.push(polygonCoords[0]); // 閉合多邊形
        
        const polygon = turf.polygon([polygonCoords]);
        const point = turf.point([lng, lat]);
        const isInside = turf.booleanPointInPolygon(point, polygon);
        
        res.json({ 
            success: true, 
            isInside,
            hasBoundary: true,
            message: isInside ? '座標在專案邊界內' : '座標不在專案邊界內'
        });
    } catch (err) {
        console.error('[project_boundaries] 檢查座標錯誤:', err);
        res.status(500).json({ success: false, message: '檢查座標失敗' });
    }
});

/**
 * 根據座標查找對應的專案
 * POST /api/project_boundaries/find_project
 * 
 * Body:
 * {
 *   lat: number,
 *   lng: number
 * }
 * 
 * 返回座標所在的所有專案（可能多個專案邊界重疊）
 */
router.post('/find_project', async (req, res) => {
    const { lat, lng } = req.body;
    
    if (lat === undefined || lng === undefined) {
        return res.status(400).json({ 
            success: false, 
            message: '請提供座標 (lat, lng)' 
        });
    }
    
    try {
        const { rows: allBoundaries } = await db.query(
            'SELECT project_name, project_code, boundary_coordinates FROM project_boundaries'
        );
        
        const matchingProjects = [];
        const point = turf.point([lng, lat]);
        
        for (const boundary of allBoundaries) {
            const coordinates = typeof boundary.boundary_coordinates === 'string'
                ? JSON.parse(boundary.boundary_coordinates)
                : boundary.boundary_coordinates;
            
            try {
                const polygonCoords = coordinates.map(c => [c[1], c[0]]);
                polygonCoords.push(polygonCoords[0]);
                
                const polygon = turf.polygon([polygonCoords]);
                
                if (turf.booleanPointInPolygon(point, polygon)) {
                    matchingProjects.push({
                        projectName: boundary.project_name,
                        projectCode: boundary.project_code
                    });
                }
            } catch (e) {
                // 忽略無效的多邊形
                console.warn(`[project_boundaries] 無效的多邊形: ${boundary.project_name}`);
            }
        }
        
        res.json({ 
            success: true, 
            projects: matchingProjects,
            count: matchingProjects.length
        });
    } catch (err) {
        console.error('[project_boundaries] 查找專案錯誤:', err);
        res.status(500).json({ success: false, message: '查找專案失敗' });
    }
});

/**
 * 批次檢查座標並自動匹配專案
 * POST /api/project_boundaries/batch_match
 * 
 * Body:
 * {
 *   trees: [{ lat: number, lng: number, index?: number }, ...]
 * }
 * 
 * 用於 BLE 批次匯入時自動填入專案名稱
 */
router.post('/batch_match', async (req, res) => {
    const { trees } = req.body;
    
    if (!trees || !Array.isArray(trees)) {
        return res.status(400).json({ 
            success: false, 
            message: '請提供樹木座標陣列' 
        });
    }
    
    try {
        const { rows: allBoundaries } = await db.query(
            'SELECT project_name, project_code, boundary_coordinates FROM project_boundaries'
        );
        
        // 預處理所有多邊形
        const polygons = [];
        for (const boundary of allBoundaries) {
            const coordinates = typeof boundary.boundary_coordinates === 'string'
                ? JSON.parse(boundary.boundary_coordinates)
                : boundary.boundary_coordinates;
            
            try {
                const polygonCoords = coordinates.map(c => [c[1], c[0]]);
                polygonCoords.push(polygonCoords[0]);
                
                polygons.push({
                    projectName: boundary.project_name,
                    projectCode: boundary.project_code,
                    polygon: turf.polygon([polygonCoords])
                });
            } catch (e) {
                // 忽略無效的多邊形
            }
        }
        
        // 匹配每棵樹
        const results = trees.map((tree, idx) => {
            const { lat, lng, index } = tree;
            const treeIndex = index !== undefined ? index : idx;
            
            if (lat === undefined || lng === undefined) {
                return {
                    index: treeIndex,
                    matched: false,
                    reason: '座標缺失'
                };
            }
            
            const point = turf.point([lng, lat]);
            const matchedProjects = [];
            
            for (const { projectName, projectCode, polygon } of polygons) {
                if (turf.booleanPointInPolygon(point, polygon)) {
                    matchedProjects.push({ projectName, projectCode });
                }
            }
            
            if (matchedProjects.length === 0) {
                return {
                    index: treeIndex,
                    lat,
                    lng,
                    matched: false,
                    reason: '座標不在任何專案邊界內'
                };
            } else if (matchedProjects.length === 1) {
                return {
                    index: treeIndex,
                    lat,
                    lng,
                    matched: true,
                    projectName: matchedProjects[0].projectName,
                    projectCode: matchedProjects[0].projectCode
                };
            } else {
                // 多個匹配，返回第一個並標記有多個匹配
                return {
                    index: treeIndex,
                    lat,
                    lng,
                    matched: true,
                    projectName: matchedProjects[0].projectName,
                    projectCode: matchedProjects[0].projectCode,
                    multipleMatches: matchedProjects.length,
                    allMatches: matchedProjects
                };
            }
        });
        
        const matchedCount = results.filter(r => r.matched).length;
        
        res.json({ 
            success: true, 
            results,
            summary: {
                total: trees.length,
                matched: matchedCount,
                unmatched: trees.length - matchedCount
            }
        });
    } catch (err) {
        console.error('[project_boundaries] 批次匹配錯誤:', err);
        res.status(500).json({ success: false, message: '批次匹配失敗' });
    }
});

module.exports = router;
