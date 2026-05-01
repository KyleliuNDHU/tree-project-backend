/**
 * fix_port_areas.js — 修復港口類專案區位的縣市標記與重複/孤立資料
 *
 * 修復目的：
 *   1. 強制港口類 area_name → 縣市對應（不依賴 center_lat/lng）
 *   2. 列出可能重複的 area_name（例如「布袋港」 vs「布袋港植栽第二區」）
 *   3. 列出每個 area_name 對應的 tree_survey 樹木數量，供人工核對
 *      （解決「點擊區位看不到樹」的問題：通常是 tree_survey.project_location
 *       與 project_areas.area_name 字串不一致）
 *
 * 用法:
 *   node scripts/fix_port_areas.js          # 預覽
 *   node scripts/fix_port_areas.js --apply  # 實際寫入縣市修正
 */

require('dotenv').config();
const db = require('../config/db');

const APPLY = process.argv.includes('--apply');

// 已知港口 → 縣市權威對應（即使 center 座標缺失也適用）
const KNOWN_PORT_CITY = {
    '基隆港': '基隆市',
    '臺北港': '新北市',
    '台北港': '新北市',
    '臺中港': '台中市',
    '台中港': '台中市',
    '安平港': '台南市',
    '布袋港': '嘉義縣',
    '高雄港': '高雄市',
    '蘇澳港': '宜蘭縣',
    '花蓮港': '花蓮縣',
    '澎湖港': '澎湖縣',
};

async function main() {
    console.log('=== 1) 修正港口 city ===\n');
    const { rows: areas } = await db.query(
        `SELECT id, area_name, area_code, city FROM project_areas ORDER BY id`
    );
    let fixCount = 0;
    for (const a of areas) {
        for (const [port, expected] of Object.entries(KNOWN_PORT_CITY)) {
            if (a.area_name && a.area_name.includes(port) && a.city !== expected) {
                console.log(`[FIX]  #${a.id} ${a.area_name}: '${a.city || '(空)'}' → '${expected}'`);
                fixCount++;
                if (APPLY) {
                    await db.query(
                        `UPDATE project_areas SET city = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                        [expected, a.id]
                    );
                }
                break;
            }
        }
    }
    console.log(`\n共需修正 ${fixCount} 筆 (${APPLY ? '已套用' : 'dry-run，使用 --apply 寫入'})`);

    console.log('\n=== 2) 列出含「布袋」「港」字樣的 project_areas ===\n');
    const { rows: portRows } = await db.query(
        `SELECT id, area_name, area_code, city, center_lat, center_lng
         FROM project_areas
         WHERE area_name LIKE '%布袋%' OR area_name LIKE '%港%'
         ORDER BY area_name`
    );
    for (const r of portRows) {
        console.log(
            `  #${r.id} ${r.area_name} [${r.area_code}] city=${r.city || '(空)'} center=(${r.center_lat},${r.center_lng})`
        );
    }

    console.log('\n=== 3) 各 project_area 對應的樹木數量 (tree_survey.project_location) ===\n');
    const { rows: treeCounts } = await db.query(
        `SELECT pa.id, pa.area_name, pa.city,
                COUNT(ts.id)::int AS tree_count
         FROM project_areas pa
         LEFT JOIN tree_survey ts ON ts.project_location = pa.area_name
         GROUP BY pa.id, pa.area_name, pa.city
         ORDER BY pa.area_name`
    );
    for (const r of treeCounts) {
        console.log(`  ${r.area_name.padEnd(20)} city=${(r.city || '').padEnd(6)} tree_count=${r.tree_count}`);
    }

    console.log('\n=== 4) 比對 tree_survey.project_location 中找不到對應 area 的字串 ===\n');
    const { rows: orphanLoc } = await db.query(
        `SELECT DISTINCT ts.project_location, COUNT(*)::int AS n
         FROM tree_survey ts
         WHERE ts.project_location IS NOT NULL
           AND ts.project_location <> ''
           AND ts.project_location NOT IN (SELECT area_name FROM project_areas)
         GROUP BY ts.project_location
         ORDER BY n DESC`
    );
    if (orphanLoc.length === 0) {
        console.log('  (無)');
    } else {
        for (const r of orphanLoc) {
            console.log(`  「${r.project_location}」 (${r.n} 筆樹木) — 無對應的 project_area`);
        }
    }

    console.log('\n完成。');
    process.exit(0);
}

main().catch((e) => {
    console.error('錯誤:', e);
    process.exit(1);
});
