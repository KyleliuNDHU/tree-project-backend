-- ============================================
-- Stage 2 / commit 10: tree_species rename cascade
--
-- 同樣的 cache 同步策略：tree_species.name 改了 → tree_survey.species_name
-- 自動跟上。pending_tree_measurements 也有 species_name 欄位，一併處理。
--
-- 設計：
--   * AFTER UPDATE OF name ON tree_species
--   * 用 species_id (= tree_species.id) 對映 (tree_species.id 是 TEXT)
--   * IS DISTINCT FROM 防 no-op
--   * 不在這 trigger 動 species_id 變更 (那不是 rename，是 merge — 由
--     species_synonyms / species_merge_log 流程處理)
-- ============================================

CREATE OR REPLACE FUNCTION cascade_tree_species_rename()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.name IS DISTINCT FROM NEW.name THEN
        UPDATE tree_survey
        SET species_name = NEW.name
        WHERE species_id = NEW.id
          AND species_name IS DISTINCT FROM NEW.name;

        UPDATE pending_tree_measurements
        SET species_name = NEW.name
        WHERE species_name = OLD.name
          AND species_name IS DISTINCT FROM NEW.name;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cascade_tree_species_rename ON tree_species;
CREATE TRIGGER trigger_cascade_tree_species_rename
AFTER UPDATE OF name ON tree_species
FOR EACH ROW
EXECUTE FUNCTION cascade_tree_species_rename();

COMMENT ON FUNCTION cascade_tree_species_rename()
    IS 'Stage 2 commit 10: tree_species 改名時同步 tree_survey + pending_tree_measurements 的 species_name cache';
