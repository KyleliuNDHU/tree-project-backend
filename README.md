# TreeAI Backend

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Sustainable TreeAI** — An AI-driven urban tree inventory and carbon sequestration analysis platform.
> 智慧樹木管理系統後端：AI 驅動的都市樹木調查與碳匯分析平台。

Developed for Taiwan International Ports Corporation (TIPC) to digitize tree surveys, automate DBH (Diameter at Breast Height) measurement via computer vision, and calculate carbon storage using peer-reviewed allometric equations.

---

## Table of Contents

- [Motivation](#motivation)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [ML Service](#ml-service)
- [Deployment](#deployment)
- [Testing](#testing)
- [Security](#security)
- [Research Background](#research-background)
- [License](#license)

---

## Motivation

Traditional urban tree surveys require manual field measurements (tape + clinometer), which are labor-intensive and error-prone. This system replaces manual workflows with:

1. **Smartphone-based DBH measurement** — Using monocular depth estimation (Depth Pro) + instance segmentation (SAM 2.1) to measure tree trunk diameter from a single photo.
2. **AI-powered data queries** — Natural language to SQL translation so non-technical researchers can query the database without writing code.
3. **Carbon sequestration analysis** — Automated calculation using the Chave et al. (2014) pantropical allometric model, enabling carbon credit estimation for ESG reporting.

---

## Features

### Core Functionality

| Feature | Description |
|---------|-------------|
| **Tree Survey CRUD** | Full tree data lifecycle management with Excel/CSV batch import |
| **Text-to-SQL AI Chat** | Natural language queries translated to safe, validated SQL (multi-LLM support) |
| **AI Agent** | ReAct-style autonomous agent with 5 tools for carbon analysis and data queries |
| **Species Identification** | Pl@ntNet + GBIF + iNaturalist triple-API plant recognition |
| **Carbon Calculation** | Allometric biomass estimation (Chave et al., 2014) with CO2 equivalence |
| **Report Export** | Excel and PDF report generation with sustainability metrics |
| **ML Measurement Proxy** | Proxies depth estimation + segmentation requests to the ML service |
| **Geospatial** | Project boundary management with point-in-polygon validation |

### AI & Machine Learning

| Component | Model / Method |
|-----------|---------------|
| **Text-to-SQL** | DeepSeek-V3, GPT-4.1, Gemini 2.5 (via intent classification + SQL validation) |
| **AI Agent** | ReAct loop with SiliconFlow API — tools: `query_tree_data`, `calculate_carbon`, `species_carbon_info`, `project_summary`, `carbon_credit_estimate` |
| **Species Recognition** | Pl@ntNet CNN ensemble + GBIF taxonomy + iNaturalist cross-reference |
| **Knowledge Retrieval** | RAG with OpenAI embeddings + cosine similarity for context-aware responses |

### Security

| Layer | Implementation |
|-------|---------------|
| **Authentication** | JWT (HS256) with 24-hour expiration |
| **Authorization** | 5-tier RBAC (System Admin, Port Admin, Project Manager, Surveyor, General User) |
| **Rate Limiting** | Dual-layer Express + Nginx limiting (API: 500/15min, AI: 30/hr, Login: 10/hr) |
| **SQL Safety** | Whitelist-only tables, parameterized queries, keyword blacklist (no DROP/DELETE/ALTER) |
| **Account Protection** | 5-attempt lockout (30-min cooldown), audit logging, login attempt tracking |
| **Network** | UFW firewall (Tailscale subnet only), Nginx reverse proxy with TLS |

---

## System Architecture

```
+-------------------------------------------------------------------+
|                        Mobile App (Flutter)                        |
|   Tree Survey / AI Chat / Species ID / Image Scanner / BLE Import    |
+-------------------------------+-----------------------------------+
                                | HTTPS (JWT)
                                v
+-------------------------------------------------------------------+
|  Ubuntu Server (i3-8130U, 11GB RAM)                               |
|  +--------+  +------------------------------+  +--------------+  |
|  | Nginx  |->| Node.js Backend (Express)    |->| PostgreSQL   |  |
|  | TLS    |  | - REST API (23 route modules)|  | (12+ tables) |  |
|  | Proxy  |  | - AI Chat (Text-to-SQL)      |  +--------------+  |
|  +--------+  | - Agent (ReAct + 5 tools)    |                     |
|              | - PM2 Cluster (2 instances)   |                     |
|              +--------------+----------------+                     |
|                             | Tailscale VPN                       |
+-----------------------------+-------------------------------------+
                              v
+-------------------------------------------------------------------+
|  Windows ML Server (Core Ultra 5 125H, 16GB RAM)                  |
|  +---------------------------------------------------------------+|
|  | FastAPI ML Service                                            ||
|  | - Depth Pro (Apple, 350M params) + OpenVINO on Intel Arc GPU  ||
|  | - SAM 2.1 Small (Meta, 46M params)                           ||
|  | - Real-time WebSocket scanning                                ||
|  +---------------------------------------------------------------+|
+-------------------------------------------------------------------+
```

### Project Structure

```
backend/
├── app.js                     # Express application entry point
├── ecosystem.config.js        # PM2 cluster configuration
├── config/
│   ├── db.js                  # PostgreSQL connection pool
│   └── database.js            # Database configuration
├── routes/                    # 23 API route modules
│   ├── ai.js                  # AI chat (Text-to-SQL)
│   ├── agent.js               # AI Agent (ReAct tool calling)
│   ├── treeSurvey.js          # Tree survey CRUD
│   ├── users.js               # Authentication & user management
│   ├── carbon.js              # Carbon calculation & credit estimation
│   ├── speciesIdentification.js # Plant species recognition
│   ├── reports.js             # Excel/PDF export
│   ├── mlService.js           # ML service proxy
│   ├── webhook.js             # GitHub auto-deploy
│   └── ...                    # 14 more route modules
├── services/                  # Business logic
│   ├── agentService.js        # ReAct agent with SiliconFlow API
│   ├── sqlQueryService.js     # Text-to-SQL with injection prevention
│   ├── speciesIdentificationService.js
│   ├── knowledgeEmbeddingService.js  # RAG retrieval
│   ├── auditLogService.js     # Security audit logging
│   └── ...
├── middleware/                 # Security & access control
│   ├── jwtAuth.js             # JWT token verification
│   ├── roleAuth.js            # 5-tier RBAC
│   ├── projectAuth.js         # Project-level permissions
│   ├── rateLimiter.js         # Request throttling
│   └── loginAttemptMonitor.js # Account lockout
├── scripts/                   # DevOps automation
│   ├── deploy.sh              # Auto-deploy with rollback
│   ├── rollback.sh            # Manual rollback
│   ├── backup_db.sh           # PostgreSQL backup (cron daily)
│   ├── health_check.sh        # Health monitoring (cron 5min)
│   └── migrate.js             # Database schema migration
├── database/initial_data/     # SQL migration files
├── tests/                     # Test suites
└── ml_service/                # FastAPI ML inference (Python)
```

---

## Getting Started

### Prerequisites

- **Node.js** 20+
- **PostgreSQL** 16+
- **npm** (comes with Node.js)

### Installation

```bash
git clone https://github.com/KyleliuNDHU/tree-project-backend.git
cd tree-project-backend
npm install
cp .env.example .env   # Edit .env with your configuration
npm run dev            # Development mode -> http://localhost:3000
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Development mode with hot reload (nodemon) |
| `npm start` | Production mode |
| `npm test` | Run intent classification + SQL validation tests |
| `npm run test:all` | Run all test suites including security audits |
| `npm run test:regression` | Full feature regression test |

---

## Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
# Database
DATABASE_URL=postgresql://tree_app:<password>@127.0.0.1:5432/tree_survey

# AI APIs (at least one required for chat features)
OPENAI_API_KEY=              # Text-to-SQL generation
GEMINI_API_KEY=              # Chat responses
SiliconFlow_API_KEY=         # DeepSeek/Qwen models (Agent)
Claude_API_KEY=              # Claude models

# Authentication
JWT_SECRET=<64-char random hex string>

# ML Service (optional — for DBH measurement)
ML_SERVICE_URL=http://<ml_server_ip>:8100
ML_API_KEY=

# Cloud Storage (optional — for tree images)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Species Identification (optional)
PLANTNET_API_KEY=

# Auto-Deploy (optional — for GitHub webhook)
DEPLOY_WEBHOOK_SECRET=

# Server
PORT=3000
NODE_ENV=production
```

---

## API Reference

All endpoints require JWT authentication unless noted. Base URL: `/api`

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` | Authenticate and receive JWT token |
| GET | `/users` | List all users (admin) |
| POST | `/users` | Create user account |
| PUT | `/users/:id` | Update user profile |

### Tree Survey

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tree_survey` | List all trees (paginated) |
| GET | `/tree_survey/map` | Lightweight map view (70% less data) |
| GET | `/tree_survey/by_id/:id` | Get single tree |
| GET | `/tree_survey/by_project/:name` | Filter by project |
| POST | `/tree_survey` | Create tree record |
| POST | `/tree_survey/v2` | Create with auto-numbering |
| PUT | `/tree_survey/:id` | Update tree |
| DELETE | `/tree_survey/:id` | Delete tree |
| POST | `/tree_survey/batch` | Batch import |

### AI Chat & Agent

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat` | Text-to-SQL AI query |
| POST | `/agent/chat` | AI Agent with tool calling (ReAct) |
| GET | `/agent/status` | Agent service health |
| GET | `/agent/models` | Available LLM models |
| GET | `/download/:filename` | Download query result as Excel |

**Example — AI Chat:**
```json
{
  "message": "List all trees with DBH > 50 cm in Kaohsiung Port",
  "userId": "user123",
  "projectAreas": ["Kaohsiung Port"],
  "model_preference": "deepseek-ai/DeepSeek-V3"
}
```

**Example — Agent:**
```json
{
  "message": "Calculate total carbon storage for all trees in Kaohsiung Port",
  "sessionId": "agent_session_001"
}
```

### Species Identification

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/species/identify` | Identify plant from photo |
| GET | `/species/search` | Search by scientific name |
| GET | `/species/:id/info` | Species detail (GBIF + iNaturalist) |

### Carbon Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/carbon/sink/calculate` | Calculate carbon storage for given DBH |
| GET | `/carbon/trading/credit_calculator` | CO2 equivalent statistics |
| GET | `/carbon/credit_estimation` | Per-species annual carbon sequestration |
| GET | `/carbon/sink/species` | Species-specific carbon data |
| GET | `/carbon/optimization/species_recommendation` | Species recommendation by carbon efficiency |

### Reports & Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/export/excel?project_codes=xxx` | Excel report |
| GET | `/export/pdf?project_codes=xxx` | PDF report |
| GET | `/sustainability_report` | Sustainability report |

### Additional Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tree_statistics` | Aggregated statistics |
| GET | `/tree_species` | Species reference list |
| POST | `/tree-images/upload` | Upload tree photo (Cloudinary) |
| GET | `/project_areas` | Project areas |
| GET | `/project-boundaries` | Project boundaries (GeoJSON) |
| POST | `/ml-training/batch` | Upload ML training data |
| GET | `/ml-service/status` | ML service health & config |
| GET | `/health` | Backend health check (no auth) |

---

## ML Service

The ML service is a FastAPI application that provides computer vision capabilities:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/measure-dbh` | Full DBH measurement pipeline (depth + segmentation + calculation) |
| `POST /api/v1/estimate-depth` | Monocular depth estimation |
| `WS /ws/scan` | Real-time WebSocket scanning |
| `GET /api/v1/health` | Service health check |

**Supported Models:**

| Model | Task | Parameters |
|-------|------|------------|
| Depth Pro (Apple) | Monocular depth estimation | 350M |
| Depth Anything V2 | Monocular depth estimation (lightweight) | 97M |
| SAM 2.1 Small (Meta) | Instance segmentation | 46M |
| EfficientViT-SAM | Lightweight segmentation | 25M |

**Hardware Acceleration:**
- Intel Arc GPU via OpenVINO (XMX acceleration)
- ONNX Runtime for CPU optimization

See `ml_service/` directory for full documentation.

---

## Deployment

### Self-Hosted (Current Production)

The system runs on a dual-machine architecture connected via Tailscale VPN:

| Component | Server | Specs |
|-----------|--------|-------|
| Node.js Backend + PostgreSQL | Ubuntu 24.04 LTS | i3-8130U, 11GB RAM |
| ML Service (Depth Pro + SAM) | Windows 11 | Core Ultra 5 125H, 16GB RAM |

**Auto-deploy:** `git push origin main` triggers GitHub Webhook, which runs `deploy.sh` (git pull, npm install, migrate, pm2 reload, health check, auto-rollback on failure).

### Operations

```bash
# Deploy
scripts/deploy.sh                    # Full deploy with migration
scripts/deploy.sh --skip-migrate     # Skip DB migration
scripts/deploy.sh --dry-run          # Pull only, no restart

# Rollback
scripts/rollback.sh                  # Rollback to last successful commit
scripts/rollback.sh <commit-hash>    # Rollback to specific commit
scripts/rollback.sh --list           # List recent commits

# Database
scripts/backup_db.sh                 # Manual backup (auto: daily 03:00)
node scripts/migrate.js              # Run schema migrations

# PM2
pm2 status                           # Service status
pm2 logs tree-backend                # View logs
pm2 reload tree-backend              # Zero-downtime reload
```

---

## Testing

```bash
npm test                    # Intent classification + SQL validation
npm run test:intent         # Natural language intent classification
npm run test:sql            # SQL injection prevention validation
npm run test:integration    # Chat API end-to-end
npm run test:api            # API contract tests
npm run test:all            # All suites including security audits
npm run test:regression     # Full feature regression
```

**Test Coverage:**

| Suite | Focus |
|-------|-------|
| Intent Classification | NLP intent detection for query vs. small-talk |
| SQL Validation | Injection prevention, table whitelist enforcement |
| Chat Integration | End-to-end: message to intent to SQL to response |
| Security Audit | XSS, injection, auth bypass, rate limit evasion |
| Advanced Security | JWT tampering, timing attacks, replay attacks |
| Extreme Security | Distributed attacks, CORS bypass, dependency vulnerabilities |

---

## Security

| Category | Measures |
|----------|----------|
| **Network** | UFW firewall (Tailscale-only ingress), Nginx reverse proxy, self-signed TLS |
| **Authentication** | JWT with HS256, bcrypt password hashing, account lockout after 5 failures |
| **Authorization** | 5-tier RBAC, project-level permissions, per-endpoint role requirements |
| **Data Protection** | Parameterized SQL queries, table whitelist, keyword blacklist |
| **Rate Limiting** | Dual Express + Nginx limiting, separate limits for AI/login endpoints |
| **Monitoring** | Audit log (all data mutations), health check (5-min cron), PM2 log rotation |
| **Secrets** | `.env` files (chmod 600), excluded from Git, API keys server-side only |

---

## Research Background

### Carbon Sequestration Model

The carbon calculation follows peer-reviewed pantropical allometric equations:

```
AGB = exp(-2.48 + 2.4835 * ln(DBH))     # Chave et al. (2014)
Total Biomass = 1.24 * AGB               # Root-to-shoot ratio
Carbon = 0.50 * Total Biomass            # IPCC carbon fraction
CO2 Equivalent = Carbon * 3.67           # Molecular weight ratio
Annual Sequestration = CO2 * 0.03        # Growth rate factor
```

**Key References:**
- Chave, J. et al. (2014). Improved allometric models to estimate the aboveground biomass of tropical trees. *Global Change Biology*, 20(10), 3177-3190.
- IPCC (2006). Guidelines for National Greenhouse Gas Inventories. Vol. 4: Agriculture, Forestry and Other Land Use.

### DBH Measurement Method

Monocular depth estimation + instance segmentation pipeline:
1. User captures tree photo with smartphone
2. **Depth Pro** estimates per-pixel metric depth from a single image
3. **SAM 2.1** segments the tree trunk region
4. Trunk width in pixels multiplied by depth gives real-world DBH (cm)
5. EXIF focal length used for camera intrinsics when available

---

## Database

### Schema (12+ tables)

```
tree_survey                  # Main tree inventory table
tree_species                 # Species reference data
tree_carbon_data             # Carbon coefficients by species
project_areas                # Survey project areas
project_boundaries           # GeoJSON polygon boundaries
project_members              # User-project assignments
pending_tree_measurements    # Queued measurement tasks
tree_images                  # Photo records (Cloudinary URLs)
ml_training_batches          # ML training data batches
ml_training_records          # Individual training samples
chat_logs                    # AI chat & agent conversation logs
audit_logs                   # Security audit trail
login_attempts               # Authentication attempt records
```

Migrations run automatically on startup via `scripts/migrate.js`.

---

## License

[MIT License](LICENSE)

## Related

- **Frontend:** [tree-project-frontend](https://github.com/KyleliuNDHU/tree-project-frontend) — Flutter mobile application
- **Author:** [@KyleliuNDHU](https://github.com/KyleliuNDHU) — National Dong Hwa University
