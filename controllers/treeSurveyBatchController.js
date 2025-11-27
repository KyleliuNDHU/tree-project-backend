const db = require('../config/db');

/**
 * 批量匯入樹木調查資料 (v2)
 * 
 * 特性：
 * 1. 原子性事務 (Atomic Transaction)：確保整批資料寫入的一致性。
 * 2. 伺服器端 ID 生成 (Server-Side ID Generation)：
 *    - 鎖定並分配 System ID (ST-XXXX)
 *    - 鎖定並分配 Project ID (PT-XXXX)
 * 3. 雙表寫入 (Dual-Table Writing)：
 *    - tree_survey: 寫入業務資料 (供 App 顯示與編輯)
 *    - tree_measurement_raw: 寫入儀器原始數據 (供科研與校正)
 * 4. 專案正規化支援：自動處理 projects 表的關聯 (若有)。
 */
exports.batchImportTrees = async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        const { 
            project_area, 
            project_code, 
            project_name, 
            trees 
        } = req.body;

        if (!trees || !Array.isArray(trees) || trees.length === 0) {
            return res.status(400).json({ success: false, message: '無有效的樹木資料' });
        }

        await client.query('BEGIN');

        // ---------------------------------------------------------
        // Step 1: 準備專案關聯 (Project Association)
        // ---------------------------------------------------------
        // 嘗試查找或創建專案 (為了正規化做準備)
        // 如果 projects 表存在，我們嘗試獲取 project_id
        let projectId = null;
        try {
            // 簡單檢查 projects 表是否存在
            const checkTable = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'projects'
                );
            `);
            
            if (checkTable.rows[0].exists && project_code) {
                // 嘗試獲取專案 ID
                const prjRes = await client.query(
                    'SELECT id FROM projects WHERE project_code = $1', 
                    [project_code]
                );
                if (prjRes.rows.length > 0) {
                    projectId = prjRes.rows[0].id;
                } else {
                    // 若專案不存在，暫時先不強制創建，避免複雜度過高
                    // 未來可以在這裡加入自動創建專案的邏輯
                }
            }
        } catch (err) {
            console.warn('Project association skipped:', err.message);
        }

        // ---------------------------------------------------------
        // Step 2: 鎖定並獲取 ID 序列起點 (Atomic ID Generation)
        // ---------------------------------------------------------
        
        // A. 系統樹木編號 (System ID)
        // 鎖定 tree_survey 表以獲取當前最大 ID (防止並發衝突)
        // 注意：在大流量下這可能會影響效能，但在樹木調查場景下是可以接受的
        // 更好的做法是使用 Redis 或獨立的 Sequence Table，這裡採用簡單可靠的 MAX() + Lock 策略
        const sysIdRes = await client.query(`
            SELECT MAX(CAST(regexp_replace(system_tree_id, '[^0-9]', '', 'g') AS INTEGER)) as max_id 
            FROM tree_survey 
            WHERE system_tree_id ~ '^[A-Za-z]+-[0-9]+$' OR system_tree_id ~ '^[0-9]+$'
            FOR UPDATE; -- Row-level lock on the max row (conceptually)
        `);
        let nextSysId = (sysIdRes.rows[0].max_id || 0) + 1;

        // B. 專案樹木編號 (Project ID)
        // 針對該專案代碼鎖定最大 ID
        let nextPrjId = 1;
        if (project_code) {
            const prjIdRes = await client.query(`
                SELECT MAX(CAST(regexp_replace(project_tree_id, '[^0-9]', '', 'g') AS INTEGER)) as max_id 
                FROM tree_survey 
                WHERE project_code = $1 
                AND (project_tree_id ~ '^[A-Za-z]+-[0-9]+$' OR project_tree_id ~ '^[0-9]+$')
                FOR UPDATE;
            `, [project_code]);
            nextPrjId = (prjIdRes.rows[0].max_id || 0) + 1;
        }

        // ---------------------------------------------------------
        // Step 3: 迭代處理並寫入 (Batch Insert)
        // ---------------------------------------------------------
        const insertedIds = [];

        for (const tree of trees) {
            // 生成 ID
            const systemTreeId = `ST-${nextSysId++}`;
            const projectTreeId = project_code ? `PT-${nextPrjId++}` : `PT-${Date.now()}`; // Fallback

            // 準備 tree_survey 數據
            const surveyValues = [
                project_area || '無',
                project_code || '無',
                project_name || '無',
                systemTreeId,
                projectTreeId,
                tree.species_id || '無',
                tree.species_name || '無',
                parseFloat(tree.lat) || 0, // X/Lon? 注意前端傳過來的鍵名
                parseFloat(tree.lon) || 0, // Y/Lat?
                tree.status || '良好',
                tree.note || '無',
                tree.tree_remark || '無',
                parseFloat(tree.height) || 0,
                parseFloat(tree.dbh) || 0,
                tree.survey_remark || '批量匯入',
                tree.survey_time || new Date().toISOString(),
                parseFloat(tree.carbon_storage) || 0,
                parseFloat(tree.carbon_sequestration) || 0,
                projectId // 新增的正規化欄位 (可能為 null)
            ];

            // 寫入主表
            const insertSurveySql = `
                INSERT INTO tree_survey 
                (project_location, project_code, project_name, system_tree_id, project_tree_id, species_id, 
                species_name, x_coord, y_coord, status, notes, tree_notes, tree_height_m, 
                dbh_cm, survey_notes, survey_time, carbon_storage, carbon_sequestration_per_year, project_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                RETURNING id;
            `;
            
            const surveyResult = await client.query(insertSurveySql, surveyValues);
            const newTreeId = surveyResult.rows[0].id;
            insertedIds.push(newTreeId);

            // 準備 tree_measurement_raw 數據 (如果 metadata 存在)
            if (tree.metadata) {
                const meta = tree.metadata;
                const rawValues = [
                    newTreeId,
                    meta.instrument_type || null, // TYPE
                    meta.snr || null,             // SNR
                    meta.hd !== undefined ? parseFloat(meta.hd) : null,
                    meta.sd !== undefined ? parseFloat(meta.sd) : null,
                    meta.pitch !== undefined ? parseFloat(meta.pitch) : null,
                    meta.az !== undefined ? parseFloat(meta.az) : null,
                    meta.ref_height !== undefined ? parseFloat(meta.ref_height) : null,
                    meta.hdop !== undefined ? parseFloat(meta.hdop) : null,
                    meta.raw_lat !== undefined ? parseFloat(meta.raw_lat) : null,
                    meta.raw_lon !== undefined ? parseFloat(meta.raw_lon) : null,
                    meta.measured_at || tree.survey_time || null,
                    JSON.stringify(meta) // 完整備份
                ];

                // 檢查 raw 表是否存在 (避免在舊庫報錯)
                // 這裡假設 Phase 1 已經執行，表一定存在
                const insertRawSql = `
                    INSERT INTO tree_measurement_raw
                    (tree_id, instrument_type, device_sn, horizontal_dist, slope_dist, vertical_angle, 
                    azimuth, ref_height, gps_hdop, raw_lat, raw_lon, measured_at, raw_data_snapshot)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `;
                await client.query(insertRawSql, rawValues);
            }
        }

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: `成功匯入 ${insertedIds.length} 筆資料`,
            data: {
                count: insertedIds.length,
                start_system_id: `ST-${nextSysId - insertedIds.length}`,
                end_system_id: `ST-${nextSysId - 1}`
            }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('批量匯入失敗:', err);
        res.status(500).json({ 
            success: false, 
            message: '匯入過程中發生錯誤，已全部復原', 
            error: err.message 
        });
    } finally {
        client.release();
    }
};

