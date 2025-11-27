
-- Projects Table (Normalization Step 1)
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    project_code VARCHAR(50) NOT NULL UNIQUE, -- e.g., "PRJ-2024A"
    name VARCHAR(255) NOT NULL,               -- e.g., "Da-An Forest Park Survey"
    area_id INTEGER REFERENCES project_areas(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(project_code);
CREATE INDEX IF NOT EXISTS idx_projects_area_id ON projects(area_id);

-- Raw Instrument Data Table (Normalization Step 2)
CREATE TABLE IF NOT EXISTS tree_measurement_raw (
    id BIGSERIAL PRIMARY KEY,
    tree_id BIGINT REFERENCES tree_survey(id) ON DELETE CASCADE, -- Link to main tree record
    
    -- Device Info
    instrument_type VARCHAR(20), -- "1P", "3P", "DME", etc. (TYPE)
    device_sn VARCHAR(50),       -- "SNR" or "PROD"
    
    -- Raw Measurements
    horizontal_dist FLOAT,       -- HD (m)
    slope_dist FLOAT,            -- SD (m)
    vertical_angle FLOAT,        -- PITCH (Deg)
    azimuth FLOAT,               -- AZ (Deg)
    ref_height FLOAT,            -- REFH (m)
    
    -- GPS & Location
    gps_hdop FLOAT,              -- HDOP
    raw_lat DOUBLE PRECISION,    -- LAT (Instrument's raw GPS)
    raw_lon DOUBLE PRECISION,    -- LON (Instrument's raw GPS)
    altitude FLOAT,              -- ALTITUDE
    utm_zone VARCHAR(10),        -- UTM ZONE
    
    -- Timing
    measured_at TIMESTAMP WITH TIME ZONE, -- DATE + UTC
    
    -- Meta
    raw_data_snapshot TEXT,      -- Full CSV line or JSON for backup
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for raw measurements
CREATE INDEX IF NOT EXISTS idx_raw_tree_id ON tree_measurement_raw(tree_id);
CREATE INDEX IF NOT EXISTS idx_raw_device_sn ON tree_measurement_raw(device_sn);
CREATE INDEX IF NOT EXISTS idx_raw_measured_at ON tree_measurement_raw(measured_at);

-- Add project_id to tree_survey (Migration Target)
-- We use DO block to safely add column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tree_survey' AND column_name = 'project_id') THEN
        ALTER TABLE tree_survey ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
        CREATE INDEX idx_tree_survey_project_id ON tree_survey(project_id);
    END IF;
END $$;

