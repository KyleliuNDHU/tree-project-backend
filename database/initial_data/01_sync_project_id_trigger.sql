-- Function to automatically sync project_id based on project_code
CREATE OR REPLACE FUNCTION sync_tree_survey_project_id()
RETURNS TRIGGER AS $$
DECLARE
    found_project_id INTEGER;
BEGIN
    -- Only proceed if project_code is present and project_id is null, or if project_code changed
    IF NEW.project_code IS NOT NULL AND (NEW.project_id IS NULL OR NEW.project_code IS DISTINCT FROM OLD.project_code) THEN
        
        -- 1. Try to find existing project by code
        SELECT id INTO found_project_id
        FROM projects
        WHERE project_code = NEW.project_code
        LIMIT 1;

        -- 2. If found, assign it
        IF found_project_id IS NOT NULL THEN
            NEW.project_id = found_project_id;
        
        -- 3. If not found, optionally create it (Auto-Discovery)
        -- Note: Depending on your policy, you might want to disable auto-creation to prevent garbage data.
        -- Here we assume we want to auto-link only if it exists, or create a basic entry if we want to enforce foreign keys.
        -- For now, let's auto-create to ensure consistency for legacy data migration.
        ELSE
            INSERT INTO projects (project_code, name, created_at, updated_at)
            VALUES (NEW.project_code, COALESCE(NEW.project_name, 'Auto-Created Project'), NOW(), NOW())
            RETURNING id INTO found_project_id;
            
            NEW.project_id = found_project_id;
        END IF;
        
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists to allow re-running
DROP TRIGGER IF EXISTS trigger_sync_project_id ON tree_survey;

-- Create Trigger
CREATE TRIGGER trigger_sync_project_id
BEFORE INSERT OR UPDATE ON tree_survey
FOR EACH ROW
EXECUTE FUNCTION sync_tree_survey_project_id();

-- Optional: One-time backfill for existing data (safe to run multiple times)
-- This updates rows where project_id is NULL but project_code exists
DO $$
BEGIN
    -- Update existing rows to trigger the logic (even a dummy update fires the trigger if we didn't check OLD/NEW distinct)
    -- But since our trigger is BEFORE INSERT/UPDATE, we need an explicit UPDATE statement to fix old data.
    -- This query explicitly links existing data.
    
    UPDATE tree_survey ts
    SET project_id = p.id
    FROM projects p
    WHERE ts.project_code = p.project_code
    AND ts.project_id IS NULL;
    
    -- Log message (visible in console if run manually)
    RAISE NOTICE 'Backfill complete for existing project_ids';
END $$;

