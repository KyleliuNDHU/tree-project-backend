const db = require('../config/db');

const cleanupUnusedProjectAreas = async () => {
  try {
    const sql = `
      DELETE FROM project_areas 
      WHERE area_name NOT IN (
        SELECT DISTINCT "專案區位" FROM tree_survey WHERE "專案區位" IS NOT NULL AND "專案區位" != ''
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
        SELECT 1 FROM tree_survey tsv WHERE ts.id = tsv."樹種編號"
      )
      AND ts.id != '0000'`; // 保留"其他"這個特殊樹種
    const result = await db.query(sql);
    console.log(`[Cleanup] Cleaned up unused species. Rows affected: ${result.rowCount}`);
  } catch (err) {
    console.error('[Cleanup] Error cleaning up unused species:', err);
  }
};

module.exports = {
    cleanupUnusedProjectAreas,
    cleanupUnusedSpecies,
};
