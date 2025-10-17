#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Install dependencies
npm install

# Run the database migration script
node scripts/migrate.js
