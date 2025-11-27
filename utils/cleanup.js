const db = require('../config/db');

const cleanupUnusedProjectAreas = async () => {
  try {
    const sql = `
      DELETE FROM project_areas 
      WHERE area_name NOT IN (
        SELECT DISTINCT project_location FROM tree_survey WHERE project_location IS NOT NULL AND project_location != ''
      )`;
    const result = await db.query(sql);
    console.log(`[Cleanup] Cleaned up unused project areas. Rows affected: ${result.rowCount}`);
  } catch (err) {
    console.error('[Cleanup] Error cleaning up unused project areas:', err);
  }
};

const cleanupUnusedSpecies = async () => {
  try {
    const sql = `
      DELETE FROM tree_species ts
      WHERE NOT EXISTS (
        SELECT 1 FROM tree_survey tsv WHERE ts.id = tsv.species_id
      )
      AND ts.id != '0000'`; // 保留"其他"這個特殊樹種
    const result = await db.query(sql);
    console.log(`[Cleanup] Cleaned up unused species. Rows affected: ${result.rowCount}`);
  } catch (err) {
    console.error('[Cleanup] Error cleaning up unused species:', err);
  }
};

const cleanupOrphanedPlaceholders = async () => {
  try {
    // 刪除所有尚未被真實資料覆蓋的預設樹種紀錄
    // 這些是使用者建立了新專案但未完成第一筆樹木資料輸入而留下的
    const sql = `
      DELETE FROM tree_survey
      WHERE species_name = '預設樹種'
    `;
    const result = await db.query(sql);
    console.log(`[Cleanup] Cleaned up orphaned placeholder trees. Rows affected: ${result.rowCount}`);
  } catch (err) {
    console.error('[Cleanup] Error cleaning up orphaned placeholders:', err);
  }
};

const cleanupOldChatLogs = async () => {
  try {
    // 刪除超過 24 小時的聊天記錄，保持資料庫輕量化
    // 這確保了使用者的對話記錄不會無限期保存，僅保留當次會話的短期記憶
    const sql = `
      DELETE FROM chat_logs
      WHERE created_at < NOW() - INTERVAL '24 hours'
    `;
    const result = await db.query(sql);
    console.log(`[Cleanup] Cleaned up old chat logs. Rows affected: ${result.rowCount}`);
  } catch (err) {
    // 容錯處理：如果 chat_logs 表不存在（可能是尚未遷移的新環境），則忽略錯誤
    if (err.code === '42P01') { // undefined_table
      console.log('[Cleanup] chat_logs table does not exist yet, skipping cleanup.');
    } else {
      console.error('[Cleanup] Error cleaning up old chat logs:', err);
    }
  }
};

module.exports = {
    cleanupUnusedProjectAreas,
    cleanupUnusedSpecies,
    cleanupOrphanedPlaceholders,
    cleanupOldChatLogs,
};
