-- ============================================
-- Migration: Backfill projects.area_id from tree_survey.project_location
-- Date: 2026-04
-- Reason: The auto-discovery trigger sync_tree_survey_project_id() only
--         creates a projects row (project_code, name) but does not set
--         area_id. As a result GET /projects/by_area/:area joins via
--         INNER JOIN project_areas and excludes those rows, so the UI
--         only displays projects that were created manually via the API.
--
--         This script:
--           1. Backfills projects.area_id by matching tree_survey
--              .project_location -> project_areas.area_name
--           2. Replaces the trigger function with a version that resolves
--              area_id at INSERT/UPDATE time
-- ============================================

-- 1. One-shot backfill (idempotent) -----------------------------------------
DO $$
DECLARE
    fixed INT;
BEGIN
    -- 1a. Backfill area_id from project_location -> project_areas.area_name
    UPDATE projects p
    SET area_id = pa.id
    FROM (
        SELECT DISTINCT ON (ts.project_code)
               ts.project_code,
               ts.project_location
        FROM tree_survey ts
        WHERE ts.project_code IS NOT NULL
          AND ts.project_location IS NOT NULL
          AND ts.project_location <> ''
        ORDER BY ts.project_code, ts.id
    ) ts
    JOIN project_areas pa ON pa.area_name = ts.project_location
    WHERE p.project_code = ts.project_code
      AND p.area_id IS DISTINCT FROM pa.id;

    GET DIAGNOSTICS fixed = ROW_COUNT;
    RAISE NOTICE '[backfill] projects.area_id rows updated: %', fixed;

    -- 1b. Heal projects.name to the dominant project_name in tree_survey for
    --     that project_code. Earlier API calls with bogus values like 'tt'
    --     overwrote the original name via ON CONFLICT DO UPDATE.
    --     Only heal when (a) projects.name looks like a placeholder/short
    --     test value (length < 4 OR == 'Auto-Created Project') AND
    --     (b) tree_survey holds a meaningful dominant name.
    WITH dominant AS (
        SELECT project_code,
               project_name,
               cnt,
               ROW_NUMBER() OVER (PARTITION BY project_code ORDER BY cnt DESC, project_name) AS rn
        FROM (
            SELECT project_code, project_name, count(*) AS cnt
            FROM tree_survey
            WHERE project_code IS NOT NULL
              AND project_name IS NOT NULL
              AND project_name <> ''
              AND project_name <> '__PLACEHOLDER__'
            GROUP BY project_code, project_name
        ) t
    )
    UPDATE projects p
    SET name = d.project_name
    FROM dominant d
    WHERE d.rn = 1
      AND p.project_code = d.project_code
      AND (
        char_length(p.name) < 4
        OR p.name = 'Auto-Created Project'
        OR p.name = '__PLACEHOLDER__'
      )
      AND d.project_name <> p.name;

    GET DIAGNOSTICS fixed = ROW_COUNT;
    RAISE NOTICE '[backfill] projects.name rows healed: %', fixed;
END $$;

-- 2. Replace trigger so future auto-created projects carry area_id ----------
CREATE OR REPLACE FUNCTION sync_tree_survey_project_id()
RETURNS TRIGGER AS $$
DECLARE
    found_project_id INTEGER;
    resolved_area_id INTEGER;
BEGIN
    IF NEW.project_code IS NOT NULL
       AND (NEW.project_id IS NULL OR NEW.project_code IS DISTINCT FROM OLD.project_code)
    THEN
        SELECT id INTO found_project_id
        FROM projects
        WHERE project_code = NEW.project_code
        LIMIT 1;

        IF found_project_id IS NOT NULL THEN
            NEW.project_id := found_project_id;

            -- Heal: if the existing projects row has no area_id but we now
            -- have a project_location, fill it in.
            IF NEW.project_location IS NOT NULL AND NEW.project_location <> '' THEN
                UPDATE projects p
                SET area_id = pa.id
                FROM project_areas pa
                WHERE p.id = found_project_id
                  AND p.area_id IS NULL
                  AND pa.area_name = NEW.project_location;
            END IF;
        ELSE
            -- Resolve area_id from project_location at insert time
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create trigger (function replacement preserves attachment, but be safe)
DROP TRIGGER IF EXISTS trigger_sync_project_id ON tree_survey;
CREATE TRIGGER trigger_sync_project_id
BEFORE INSERT OR UPDATE ON tree_survey
FOR EACH ROW
EXECUTE FUNCTION sync_tree_survey_project_id();
