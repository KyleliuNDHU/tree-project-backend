#!/usr/bin/env node
/**
 * heal_tree_survey_drift.js — 修補 tree_survey cache 欄位漂移
 *
 * 背景：
 *   tree_survey 含 4 個 denormalized cache 欄位：
 *     - project_name        ← projects.name           (by project_id)
 *     - project_code        ← projects.project_code   (by project_id)
 *     - project_location    ← project_areas.area_name (by projects.area_id)
 *     - species_name        ← tree_species.name       (by species_id)
 *   Stage 2 commit 8-10 已加 trigger 同步「未來」寫入；本腳本一次性掃描
 *   舊資料把目前的飄移修正到位。
 *
 * 用法：
 *   node scripts/heal_tree_survey_drift.js              # dry-run，列出差異
 *   node scripts/heal_tree_survey_drift.js --apply      # 套用修正
 *
 * 安全性：
 *   - dry-run 預設；--apply 才會 UPDATE
 *   - 每筆 UPDATE 都用 id=$id；分批 by 漂移欄位，不一次寫四欄避免污染未漂移的欄
 *   - species_id 對不到 tree_species 的列不動 (degraded mode 由應用層補建)
 *   - project_id 為 NULL 的列不動 (孤兒列由 cleanup 處理，非本腳本責任)
 */

const db = require('../config/db');

const APPLY = process.argv.includes('--apply');

const FIELDS = [
    { col: 'project_name', label: 'project_name' },
    { col: 'project_code', label: 'project_code' },
    { col: 'project_location', label: 'project_location' },
    { col: 'species_name', label: 'species_name' },
];

async function main() {
    // 一次撈出所有有 project_id 的 tree_survey + LEFT JOIN canonical 來源
    // species 比對需與 09 trigger 邏輯一致：species_id IN ('', '無', NULL) 是 sentinel
    // (代表「未識別 / 不適用」，常見於枯立木)，不可用 tree_species 覆蓋。
    const { rows } = await db.query(`
        SELECT
            ts.id,
            ts.project_id,
            ts.species_id,
            ts.project_name      AS cur_project_name,
            ts.project_code      AS cur_project_code,
            ts.project_location  AS cur_project_location,
            ts.species_name      AS cur_species_name,
            p.name               AS canon_project_name,
            p.project_code       AS canon_project_code,
            pa.area_name         AS canon_project_location,
            CASE
                WHEN ts.species_id IS NULL OR ts.species_id = '' OR ts.species_id = '無'
                    THEN NULL
                ELSE s.name
            END                  AS canon_species_name
        FROM tree_survey ts
        LEFT JOIN projects p       ON p.id = ts.project_id
        LEFT JOIN project_areas pa ON pa.id = p.area_id
        LEFT JOIN tree_species s   ON s.id = ts.species_id
        WHERE ts.is_placeholder IS NOT TRUE
        ORDER BY ts.id
    `);

    const drifts = []; // { id, fields: [{col, from, to}] }
    for (const r of rows) {
        const fields = [];

        // project 三欄：必須 project_id 存在 (canon_project_name 不為 null 即代表 JOIN 成功)
        if (r.canon_project_name !== null) {
            if (r.cur_project_name !== r.canon_project_name) {
                fields.push({ col: 'project_name', from: r.cur_project_name, to: r.canon_project_name });
            }
            if (r.cur_project_code !== r.canon_project_code) {
                fields.push({ col: 'project_code', from: r.cur_project_code, to: r.canon_project_code });
            }
            // project_location 來自 project_areas.area_name；若 area_id 為 null → canon_project_location 為 null，跳過
            if (r.canon_project_location !== null && r.cur_project_location !== r.canon_project_location) {
                fields.push({ col: 'project_location', from: r.cur_project_location, to: r.canon_project_location });
            }
        }

        // species_name：必須 species_id 對到 tree_species
        if (r.canon_species_name !== null && r.cur_species_name !== r.canon_species_name) {
            fields.push({ col: 'species_name', from: r.cur_species_name, to: r.canon_species_name });
        }

        if (fields.length > 0) {
            drifts.push({ id: r.id, fields });
        }
    }

    // 統計每個欄位漂了幾筆
    const byField = new Map(FIELDS.map(f => [f.col, 0]));
    for (const d of drifts) {
        for (const f of d.fields) byField.set(f.col, byField.get(f.col) + 1);
    }

    console.log(`\n掃描完成：tree_survey 共 ${rows.length} 列 (排除 placeholder)`);
    console.log(`漂移列數：${drifts.length}`);
    for (const f of FIELDS) {
        console.log(`  ${f.label.padEnd(20)} ${byField.get(f.col)} 筆`);
    }

    if (drifts.length === 0) {
        console.log('\n✓ 所有 cache 欄位與權威來源一致，無需修補');
        process.exit(0);
    }

    // 前 50 筆細節 (避免輸出爆炸)
    const SAMPLE_LIMIT = 50;
    const sample = drifts.slice(0, SAMPLE_LIMIT);
    console.log(`\n前 ${sample.length} 筆漂移細節：\n`);
    console.log('id'.padEnd(8) + 'col'.padEnd(20) + 'from'.padEnd(30) + '→ to');
    console.log('─'.repeat(100));
    for (const d of sample) {
        for (const f of d.fields) {
            const from = (f.from === null || f.from === undefined) ? '(null)' : String(f.from);
            const to = (f.to === null || f.to === undefined) ? '(null)' : String(f.to);
            console.log(
                String(d.id).padEnd(8) +
                f.col.padEnd(20) +
                from.slice(0, 28).padEnd(30) +
                '→ ' + to.slice(0, 50)
            );
        }
    }
    if (drifts.length > SAMPLE_LIMIT) {
        console.log(`... (${drifts.length - SAMPLE_LIMIT} 筆已省略)`);
    }

    if (!APPLY) {
        console.log('\n[dry-run] 未套用變更。確認無誤後請執行：');
        console.log('  node scripts/heal_tree_survey_drift.js --apply');
        process.exit(0);
    }

    console.log('\n[apply] 開始套用變更...');
    const client = await db.pool.connect();
    let updatedRows = 0;
    let updatedFields = 0;
    try {
        await client.query('BEGIN');
        for (const d of drifts) {
            const setParts = [];
            const params = [];
            let i = 1;
            for (const f of d.fields) {
                setParts.push(`${f.col} = $${i++}`);
                params.push(f.to);
            }
            params.push(d.id);
            const sql = `UPDATE tree_survey SET ${setParts.join(', ')} WHERE id = $${i}`;
            const r = await client.query(sql, params);
            if (r.rowCount > 0) {
                updatedRows++;
                updatedFields += d.fields.length;
            }
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
    console.log(`✓ 完成：更新 ${updatedRows} 列 / ${updatedFields} 欄位`);
    process.exit(0);
}

main().catch(err => {
    console.error('[heal_tree_survey_drift] 失敗:', err);
    process.exit(1);
});
