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

module.exports = {
    cleanupUnusedProjectAreas,
    cleanupUnusedSpecies,
};
