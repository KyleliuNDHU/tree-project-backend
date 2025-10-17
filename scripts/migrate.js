const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const copyFrom = require('pg-copy-streams').from; // Import the helper correctly
const { Transform } = require('stream'); // Add Transform stream
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Define the correct order for table creation
const migrationFiles = [
  '00_init_functions.pg.sql', // Initialize shared functions first
  'users.pg.sql',
  'project_areas.pg.sql',
  'tree_species.pg.sql',
  'species_region_score.pg.sql',
  'tree_carbon_data.pg.sql',
  'tree_survey.pg.sql', // Structure only
  'tree_management_actions.pg.sql'
];

// Define the order for view creation
const viewFiles = [
    'tree_survey_with_areas.pg.sql'
];

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Starting database migration...');

    // Execute migration files for table creation and data insertion
    for (const file of migrationFiles) {
      console.log(`Executing ${file}...`);
      const filePath = path.join(__dirname, '../database/initial_data', file);
      const script = fs.readFileSync(filePath, 'utf8');
      await client.query(script);
      console.log(`${file} executed successfully.`);
    }

    // Import data from CSV into tree_survey table
    console.log('Importing data from tree_survey_data.csv...');
    const csvPath = path.join(__dirname, '../database/initial_data', 'tree_survey_data.csv');
    if (fs.existsSync(csvPath)) {
        // Use COPY for high performance, requires absolute path on server
        // We need to resolve the full path for the COPY command
        const absolutePath = path.resolve(csvPath);
        
        // Note: COPY requires superuser privileges in PostgreSQL. 
        // Render's managed PostgreSQL might not grant this.
        // A more compatible way might be to parse CSV and build INSERT statements,
        // but it's much slower. We'll try with COPY first.
        
        // We read the header to map columns correctly
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const records = parse(csvData, { columns: true, skip_empty_lines: true });
        const header = Object.keys(records[0]).map(h => `"${h}"`).join(', ');

        const copyCommand = `COPY tree_survey(${header}) FROM STDIN WITH (FORMAT CSV, HEADER, FORCE_NULL(survey_time))`;
        
        // Use the copyFrom helper to create a writable stream
        const stream = client.query(copyFrom(copyCommand));
        const fileStream = fs.createReadStream(absolutePath);

        // Create a transform stream to replace invalid dates on the fly
        const transformStream = new Transform({
          transform(chunk, encoding, callback) {
            // Convert chunk to string, replace the invalid date, and push it back
            const transformedChunk = chunk.toString().replace(/0000-00-00 00:00:00/g, '');
            this.push(transformedChunk);
            callback();
          }
        });

        await new Promise((resolve, reject) => {
            fileStream.on('error', reject);
            transformStream.on('error', reject); // Handle errors on the new stream
            stream.on('error', reject);
            stream.on('finish', resolve);
            fileStream.pipe(transformStream).pipe(stream);
        });

        console.log('tree_survey_data.csv imported successfully.');
    } else {
      console.log('tree_survey_data.csv not found, skipping import.');
    }
    
    // After all tables are created and data is imported, create the views
    for (const file of viewFiles) {
        console.log(`Executing view creation script ${file}...`);
        const filePath = path.join(__dirname, '../database/initial_data', file);
        const script = fs.readFileSync(filePath, 'utf8');
        await client.query(script);
        console.log(`${file} executed successfully.`);
    }


    console.log('Database migration completed successfully!');
  } catch (error) {
    console.error('Error during database migration:', error);
    process.exit(1); // Exit with an error code
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
