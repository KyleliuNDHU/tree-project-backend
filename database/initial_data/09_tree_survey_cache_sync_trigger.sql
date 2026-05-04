-- ============================================
-- Stage 2 / commit 8: 擴充 sync_tree_survey_project_id() 以同步 denormalized cache
--
-- 背景：
--   tree_survey 同時保有 project_code/project_name/project_location/species_name
--   這些欄位（denormalized cache），與 canonical tables 之間沒有任何 trigger
--   保持一致 → 任一端被改就會 drift（REFACTOR_ANALYSIS.md 已指出）。
--
-- 本檔做的事：
--   CREATE OR REPLACE 既有的 sync_tree_survey_project_id() (BEFORE INSERT/UPDATE)，
--   在原本「找出/補建 project_id」之後，再從 canonical tables 強制覆蓋 NEW 的
--   cache 欄位：
--     - NEW.project_code     <- projects.project_code
--     - NEW.project_name     <- projects.name
--     - NEW.project_location <- project_areas.area_name (透過 projects.area_id)
--     - NEW.species_name     <- tree_species.name (若 NEW.species_id 對得到)
--
-- 設計重點：
--   1. BEFORE trigger，不會觸發 cascade，純改 NEW 欄位後就 INSERT/UPDATE
--   2. 寫入路徑單一化：呼叫端傳什麼 cache 欄位都會被覆蓋為 canonical 值
--   3. project_code 找不到 projects → 與舊邏輯一致，自動建一筆 (Auto-Created Project)
--   4. species_id 找不到 tree_species → 不覆蓋 NEW.species_name (degraded mode，由
--      應用層補建 tree_species 後再回頭更新；trigger 不做 INSERT 避免 advisory lock 衝突)
--   5. NEW.project_code IS NULL → 完全不動 cache (legacy/placeholder 路徑)
-- ============================================

CREATE OR REPLACE FUNCTION sync_tree_survey_project_id()
RETURNS TRIGGER AS $$
DECLARE
    found_project_id   INTEGER;
    canonical_name     TEXT;
    canonical_code     TEXT;
    canonical_area     TEXT;
    canonical_species  TEXT;
    resolved_area_id   INTEGER;
BEGIN
    -- ── 1) 先處理 project_id 連結 ─────────────────────────────────────
    --    (與舊邏輯相同：project_code 有值且尚未 link 或 code 變動才動作)
    IF NEW.project_code IS NOT NULL
       AND (NEW.project_id IS NULL OR NEW.project_code IS DISTINCT FROM OLD.project_code)
    THEN
        SELECT id INTO found_project_id
        FROM projects
        WHERE project_code = NEW.project_code
        LIMIT 1;

        IF found_project_id IS NOT NULL THEN
            NEW.project_id := found_project_id;

            -- Heal: projects 既有但 area_id 仍 NULL 且 NEW 帶得到 area_name
            IF NEW.project_location IS NOT NULL AND NEW.project_location <> '' THEN
                UPDATE projects p
                SET area_id = pa.id
                FROM project_areas pa
                WHERE p.id = found_project_id
                  AND p.area_id IS NULL
                  AND pa.area_name = NEW.project_location;
            END IF;
        ELSE
            -- 自動建立 projects (相容舊資料 import 流程)
            resolved_area_id := NULL;
            IF NEW.project_location IS NOT NULL AND NEW.project_location <> '' THEN
                SELECT id INTO resolved_area_id
                FROM project_areas
                WHERE area_name = NEW.project_location
                LIMIT 1;
            END IF;

            INSERT INTO projects (project_code, name, area_id, created_at, updated_at)
            VALUES (NEW.project_code,
                    COALESCE(NEW.project_name, 'Auto-Created Project'),
                    resolved_area_id,
                    NOW(),
                    NOW())
            RETURNING id INTO found_project_id;

            NEW.project_id := found_project_id;
        END IF;
    END IF;

    -- ── 2) cache 欄位以 canonical tables 為準 ────────────────────────
    --    NEW.project_id 此時若有值，代表 canonical projects 一定存在；
    --    用同一筆 query 撈出 name/code/area_name 一次填好。
    IF NEW.project_id IS NOT NULL THEN
        SELECT p.name, p.project_code, pa.area_name
          INTO canonical_name, canonical_code, canonical_area
        FROM projects p
        LEFT JOIN project_areas pa ON pa.id = p.area_id
        WHERE p.id = NEW.project_id;

        IF canonical_name IS NOT NULL THEN
            NEW.project_name := canonical_name;
        END IF;
        IF canonical_code IS NOT NULL THEN
            NEW.project_code := canonical_code;
        END IF;
        -- area_name 可能為 NULL（projects.area_id 還沒設）→ 維持 caller 傳的值
        IF canonical_area IS NOT NULL THEN
            NEW.project_location := canonical_area;
        END IF;
    END IF;

    -- ── 3) species_name 以 tree_species 為準 ─────────────────────────
    --    species_id 對得到才覆蓋；對不到時保留 caller 傳的 species_name
    --    讓應用層處理「新樹種補建 + 之後回填 species_id」的流程。
    IF NEW.species_id IS NOT NULL AND NEW.species_id <> '' AND NEW.species_id <> '無' THEN
        SELECT name INTO canonical_species
        FROM tree_species
        WHERE id = NEW.species_id
        LIMIT 1;

        IF canonical_species IS NOT NULL THEN
            NEW.species_name := canonical_species;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 重綁 trigger 以確保 attach 到最新版 function（CREATE OR REPLACE 會保留 attach，
-- 但保險起見明確 drop+create）
DROP TRIGGER IF EXISTS trigger_sync_project_id ON tree_survey;
CREATE TRIGGER trigger_sync_project_id
BEFORE INSERT OR UPDATE ON tree_survey
FOR EACH ROW
EXECUTE FUNCTION sync_tree_survey_project_id();
