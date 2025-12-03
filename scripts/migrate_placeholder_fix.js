/**
 * 資料庫遷移腳本：修復專案第一筆資料 ID 問題
 * 
 * 問題描述：
 * 原本創建新專案時會插入一個 project_tree_id='1' 的佔位記錄，
 * 導致用戶輸入的第一筆實際資料變成 PT-2 而非 PT-1。
 * 
 * 解決方案：
 * 1. 添加 is_placeholder 欄位標記佔位記錄
 * 2. 將現有佔位記錄的 project_tree_id 改為 'PT-0'
 * 3. 未來佔位記錄使用 PT-0 和 species_name='__PLACEHOLDER__'
 * 
 * 執行方式：
 * node scripts/migrate_placeholder_fix.js
 * 
 * 注意：此腳本會修改現有資料，請先備份資料庫！
 */

const db = require('../config/db');

async function migrate() {
    const client = await db.pool.connect();
    
    try {
        console.log('======================================');
        console.log('開始執行佔位記錄修復遷移...');
        console.log('======================================\n');
        
        await client.query('BEGIN');
        
        // Step 1: 檢查並添加 is_placeholder 欄位
        console.log('Step 1: 檢查 is_placeholder 欄位...');
        const checkColumn = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'tree_survey' AND column_name = 'is_placeholder'
        `);
        
        if (checkColumn.rows.length === 0) {
            console.log('  - 添加 is_placeholder 欄位...');
            await client.query(`
                ALTER TABLE tree_survey 
                ADD COLUMN is_placeholder BOOLEAN DEFAULT false
            `);
            console.log('  ✓ 欄位添加成功');
        } else {
            console.log('  ✓ 欄位已存在');
        }
        
        // Step 2: 識別現有的佔位記錄
        console.log('\nStep 2: 識別現有佔位記錄...');
        const placeholderRecords = await client.query(`
            SELECT id, project_code, project_name, species_name, project_tree_id, system_tree_id
            FROM tree_survey
            WHERE species_name = '預設樹種'
            OR species_name = '__PLACEHOLDER__'
            OR (project_tree_id = '1' AND dbh_cm IS NULL AND tree_height_m IS NULL)
        `);
        
        console.log(`  - 找到 ${placeholderRecords.rows.length} 筆可能的佔位記錄`);
        
        if (placeholderRecords.rows.length > 0) {
            console.log('\n  佔位記錄詳情:');
            for (const record of placeholderRecords.rows) {
                console.log(`    ID: ${record.id}, 專案: ${record.project_name} (${record.project_code}), ` +
                           `樹種: ${record.species_name}, PTI: ${record.project_tree_id}`);
            }
        }
        
        // Step 3: 更新佔位記錄
        console.log('\nStep 3: 更新佔位記錄...');
        
        // 3a: 標記所有佔位記錄
        const updatePlaceholderFlag = await client.query(`
            UPDATE tree_survey
            SET is_placeholder = true
            WHERE species_name = '預設樹種'
            OR species_name = '__PLACEHOLDER__'
        `);
        console.log(`  - 標記了 ${updatePlaceholderFlag.rowCount} 筆佔位記錄`);
        
        // 3b: 將佔位記錄的 project_tree_id 改為 PT-0
        const updatePTI = await client.query(`
            UPDATE tree_survey
            SET project_tree_id = 'PT-0',
                species_name = '__PLACEHOLDER__'
            WHERE is_placeholder = true
            AND project_tree_id != 'PT-0'
        `);
        console.log(`  - 更新了 ${updatePTI.rowCount} 筆記錄的 project_tree_id 為 PT-0`);
        
        // 3c: 將佔位記錄的 system_tree_id 改為 PLACEHOLDER 格式
        const updateSTI = await client.query(`
            UPDATE tree_survey
            SET system_tree_id = 'PLACEHOLDER-' || project_code
            WHERE is_placeholder = true
            AND system_tree_id LIKE 'ST-%'
        `);
        console.log(`  - 更新了 ${updateSTI.rowCount} 筆記錄的 system_tree_id 為 PLACEHOLDER 格式`);
        
        // Step 4: 驗證修復結果
        console.log('\nStep 4: 驗證修復結果...');
        
        // 檢查各專案的實際第一筆資料 ID
        const firstRecords = await client.query(`
            SELECT DISTINCT ON (project_code)
                project_code,
                project_name,
                project_tree_id,
                species_name,
                is_placeholder
            FROM tree_survey
            WHERE is_placeholder = false OR is_placeholder IS NULL
            ORDER BY project_code, 
                CAST(regexp_replace(project_tree_id, '[^0-9]', '', 'g') AS INTEGER) ASC
        `);
        
        console.log(`\n  各專案第一筆實際資料:`);
        let hasIssue = false;
        for (const record of firstRecords.rows) {
            const pti = record.project_tree_id;
            const num = parseInt(pti.replace(/[^0-9]/g, ''), 10);
            const status = num === 1 ? '✓' : (num === 2 ? '⚠ 仍為 2' : '?');
            if (num !== 1 && num !== 0) hasIssue = true;
            console.log(`    ${status} 專案 ${record.project_code}: ${record.project_name} - 第一筆 PTI: ${pti}`);
        }
        
        if (hasIssue) {
            console.log('\n  ⚠ 警告：部分專案的第一筆資料 ID 不是 1，這可能是歷史資料問題');
            console.log('    這些專案的 ID 序列無法自動修復，但新建立的專案將正常從 1 開始');
        }
        
        // 統計
        console.log('\n======================================');
        console.log('遷移統計:');
        console.log('======================================');
        
        const stats = await client.query(`
            SELECT 
                COUNT(*) FILTER (WHERE is_placeholder = true) as placeholder_count,
                COUNT(*) FILTER (WHERE is_placeholder = false OR is_placeholder IS NULL) as real_count,
                COUNT(DISTINCT project_code) as project_count
            FROM tree_survey
        `);
        
        console.log(`  佔位記錄數: ${stats.rows[0].placeholder_count}`);
        console.log(`  實際資料數: ${stats.rows[0].real_count}`);
        console.log(`  專案總數: ${stats.rows[0].project_count}`);
        
        await client.query('COMMIT');
        
        console.log('\n✓ 遷移完成！');
        console.log('\n新建立的專案將確保第一筆實際資料 ID 為 PT-1');
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n✗ 遷移失敗:', err);
        throw err;
    } finally {
        client.release();
    }
}

// 乾跑模式 (不實際修改資料)
async function dryRun() {
    const client = await db.pool.connect();
    
    try {
        console.log('======================================');
        console.log('乾跑模式：分析現有資料...');
        console.log('======================================\n');
        
        // 識別可能的佔位記錄
        const placeholderRecords = await client.query(`
            SELECT id, project_code, project_name, species_name, project_tree_id, system_tree_id
            FROM tree_survey
            WHERE species_name = '預設樹種'
            OR species_name = '__PLACEHOLDER__'
            OR (project_tree_id = '1' AND dbh_cm IS NULL AND tree_height_m IS NULL)
            ORDER BY project_code
        `);
        
        console.log(`找到 ${placeholderRecords.rows.length} 筆可能的佔位記錄:\n`);
        
        for (const record of placeholderRecords.rows) {
            console.log(`  ID: ${record.id}`);
            console.log(`    專案: ${record.project_name} (Code: ${record.project_code})`);
            console.log(`    樹種: ${record.species_name}`);
            console.log(`    Project Tree ID: ${record.project_tree_id}`);
            console.log(`    System Tree ID: ${record.system_tree_id}`);
            console.log('');
        }
        
        // 分析各專案的 ID 分佈
        console.log('各專案 project_tree_id 分佈:');
        const distribution = await client.query(`
            SELECT 
                project_code,
                project_name,
                MIN(CAST(regexp_replace(project_tree_id, '[^0-9]', '', 'g') AS INTEGER)) as min_pti,
                MAX(CAST(regexp_replace(project_tree_id, '[^0-9]', '', 'g') AS INTEGER)) as max_pti,
                COUNT(*) as count
            FROM tree_survey
            WHERE project_tree_id ~ '^(PT-)?[0-9]+$'
            GROUP BY project_code, project_name
            ORDER BY project_code
        `);
        
        for (const row of distribution.rows) {
            const status = row.min_pti === 1 ? '✓' : (row.min_pti === 2 ? '⚠' : '?');
            console.log(`  ${status} ${row.project_code}: ${row.project_name}`);
            console.log(`      PTI 範圍: ${row.min_pti} - ${row.max_pti}, 記錄數: ${row.count}`);
        }
        
        console.log('\n如確認要執行遷移，請運行: node scripts/migrate_placeholder_fix.js --execute');
        
    } finally {
        client.release();
    }
}

// 主程式
async function main() {
    const args = process.argv.slice(2);
    
    try {
        if (args.includes('--execute')) {
            await migrate();
        } else {
            await dryRun();
        }
    } catch (err) {
        console.error('執行錯誤:', err);
        process.exit(1);
    } finally {
        await db.pool.end();
    }
}

main();
