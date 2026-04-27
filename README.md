# tree-survey-backend

REST + WebSocket-style API for the tree survey / carbon-sink platform.
Backs the Flutter app (`tree-project-frontend`).

## Stack

- Node.js >= 18 (production runs on 20)
- Express 4
- PostgreSQL >= 14
- PM2 (cluster mode in production)
- JWT auth + rate limit + IP blacklist
- Cloudinary for image storage
- Optional ML inference proxied to a separate FastAPI service (`ml_service/`, Python)

## Quick start

```bash
# from project root
cd backend
cp tree-app-backend-prod.env .env   # then edit values
npm install
node scripts/migrate.js             # apply schema + seed data
npm run dev                         # nodemon on PORT (default 3000)
```

Health check: `GET /health` → `200 OK`.

## Configuration

All config comes from environment variables (loaded with `dotenv`). The keys
the code actually reads:

| Variable | Used by | Notes |
|----------|---------|-------|
| `NODE_ENV` | `app.js`, migrations, error handler | Migrations run on startup only when `production` |
| `PORT` | `app.js` | Default `3000` |
| `DATABASE_URL` | `config/db.js` | Required in production |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` | `config/db.js` | Used when `DATABASE_URL` is unset |
| `JWT_SECRET` | `middleware/jwtAuth.js` | Required in production |
| `CORS_ALLOWED_ORIGINS` / `CORS_ORIGIN` | `app.js` | Comma-separated list. In production, empty list = deny all cross-origin |
| `CLOUDINARY_URL` (or `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET`) | `config/cloudinary.js` | Image upload destination |
| `ML_SERVICE_URL`, `ML_API_KEY` | `routes/ml_service.js` | Reverse-proxy target for the Python ML service |
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | `services/geminiService.js`, `openaiService.js`, agent service | Multi-provider AI; first available wins |
| `SiliconFlow_API_KEY`, `Alt1_..._API_KEY`, `Alt2_..._API_KEY`, `Alt3_..._API_KEY` | `services/agentService.js` | Up to 4 keys rotated when quota exhausted |
| `WEBHOOK_SECRET` | `routes/webhook.js` | HMAC validation for the GitHub auto-deploy webhook |

## Scripts

Defined in `package.json`:

| Script | Command |
|--------|---------|
| `npm start` | `node app.js` |
| `npm run dev` | `nodemon app.js` |
| `npm test` | Intent classification + SQL validation tests |
| `npm run test:integration` | Chat integration tests |
| `npm run test:api` | API integration tests |
| `npm run test:regression` / `:local` / `:verbose` | Regression suite (against deployed or local server) |
| `npm run test:all` | Regression + API + security audit |

Useful one-off scripts in `scripts/`:

- `migrate.js` — runs every `.sql` / `.js` file under `database/` and `database/initial_data/` in lexicographic order. Idempotent — relies on each migration being safe to re-apply.
- `backup_db.sh` / `rollback.sh` — pg_dump and rollback helpers.
- `health_check.sh` — runs from cron / monitoring.
- `generateEmbeddings.js`, `populate_knowledge.js`, `populate_knowledge_from_survey.js` — seed and refresh the knowledge base used by the AI assistant.
- `enrich_species_synonyms.js`, `populateSpeciesRegionScore.js` — taxonomy / regional data refresh.
- `migrate_placeholder_fix.js` — historical one-off cleanup; safe to re-run.

## Project structure

```
backend/
├── app.js                  # Entry. Express setup, middleware chain, route mounting
├── config/                 # db, cloudinary, third-party API keys
├── controllers/            # Per-resource handlers (kept thin)
├── routes/                 # 24 route modules, all mounted under /api
├── services/               # Business logic (Agent, AI chat, Gemini, OpenAI, embeddings, audit log, IP blacklist, species identification/synonyms, SQL query)
├── middleware/             # jwtAuth, rateLimiter, ipBlacklistGuard, projectAuth, roleAuth, loginAttemptMonitor
├── utils/                  # cleanup, logging, helpers
├── database/
│   ├── *.sql               # Schema migrations
│   └── initial_data/       # Seed data + post-schema fix-ups
├── scripts/                # Operational scripts (migrate, deploy, backup, …)
├── ml_service/             # Standalone FastAPI service for DBH / depth / segmentation
├── tests/                  # Hand-rolled tests run by node directly
├── docs/                   # Internal design docs
└── ecosystem.config.js     # PM2 config
```

## Request pipeline

The middleware order in `app.js` is:

```
trust proxy
  ↓
CORS                     # whitelist from CORS_ALLOWED_ORIGINS
  ↓
helmet                   # standard security headers
  ↓
express.json (10mb)      # raw body kept for /webhook signature check
  ↓
/health                  # short-circuits before /api
  ↓
/webhook/...             # GitHub auto-deploy, no JWT
  ↓
/api/*  →  ipBlacklistGuard → burstLimiter (10s) → apiLimiter → jwtAuth → router
  ↓
global error handler     # logs full stack, returns generic 500 in production
```

Routes are split into 24 modules and namespaced under `/api/...` — see
`app.js` for the mount list.

## AI features

Two cooperating subsystems share `chat_logs`:

- **AI assistant** (`/api/chat`, `routes/ai.js` + `services/sqlQueryService.js`)
  - Text-to-SQL over a hard-coded table whitelist.
  - Per-user, per-session history window: last 30 turns within 30 minutes.
  - Provider order: Gemini → OpenAI → Anthropic → SiliconFlow, falling through on quota errors.

- **Agent** (`/api/agent`, `routes/agent.js` + `services/agentService.js`)
  - ReAct-style tool calling against SiliconFlow function-calling models (Qwen/DeepSeek family).
  - Tools: `query_tree_data`, `calculate_carbon`, `species_carbon_info`, `project_summary`, `carbon_report`.
  - Per-user budget: 50k tokens/hour (persisted in `agent_token_usage`); max 8 tool steps per turn.
  - Memory: last 5 turns of the same `(user_id, session_id)` with `chat_mode='agent'`.

Old chat logs are deleted hourly by `cleanupOldChatLogs` (see “Background jobs”).

## Background jobs

Started by `app.listen` in `app.js`. Once at startup (5 s delayed):

- `cleanupOldChatLogs` — drop `chat_logs` older than 24 h.

Then once an hour:

- `cleanupOrphanedPlaceholders` — drop placeholder rows that were never filled in.
- `cleanupUnusedSpecies` — remove species rows no longer referenced from `tree_survey`.
- `cleanupUnusedProjectAreas` — remove `project_areas` rows with no surveys, no projects, and no boundaries; also heals dangling `projects.area_id`.
- `cleanupOldChatLogs` — same as startup.
- `cleanupOldLoginAttempts` — drop entries older than the configured window.
- `scheduledSynonymMaintenance` — refresh the species synonym cache.

## Database

PostgreSQL. Schema is defined entirely in `database/*.sql`. Highlights:

- `users`, `tree_survey`, `tree_species`, `species_synonyms`, `species_region_score`
- `projects`, `project_areas`, `project_boundaries`
- `chat_logs`, `agent_token_usage`, `audit_logs`
- `login_attempts`, `ip_blacklist`
- `knowledge_chunks` (with vector embedding column for retrieval)

Seed and fix-up SQL lives under `database/initial_data/`. Add new ones with a
sortable numeric prefix; e.g. `05_backfill_projects_area_id.pg.sql`.
`scripts/migrate.js` will pick them up automatically on the next deploy.

## Deployment

The production server is an Ubuntu host fronted by Tailscale + Nginx. Process
supervised by PM2 in cluster mode (`ecosystem.config.js`).

Auto-deploy flow:

1. Push to `main` on the GitHub repo.
2. GitHub webhook → `POST /webhook/github` → HMAC verified.
3. `scripts/deploy.sh` runs: `git pull`, `npm ci --omit=dev`, `pm2 reload`.
4. On startup, `app.js` runs `scripts/migrate.js` when `NODE_ENV=production`.

Manual reload: `pm2 reload ecosystem.config.js`.
Logs: `pm2 logs` (or `~/.pm2/logs/`).
DB backup: `scripts/backup_db.sh` (nightly cron).

## Testing

Tests do not use a framework — they are plain Node scripts under `tests/`.
The regression suite hits the deployed server by default; pass `--local` to
target `http://localhost:3000`.

```bash
npm test                    # intent + sql unit checks
npm run test:regression     # full regression against prod
npm run test:all            # regression + api + security audit
```

## ML service

`ml_service/` is a separate FastAPI app (Python). It exposes `/api/v1/measure-dbh`,
`/api/v1/estimate-depth`, `/api/v1/auto-measure-dbh`, `/api/v1/auto-measure-dbh-multi`,
`/api/v1/config`, `/health`, plus `/ws/scan` for live-scan frames.
The Node backend reverse-proxies to it via `routes/ml_service.js`, so the
Flutter app never talks to the ML service directly. See `ml_service/README` /
`requirements.txt` for setup.

## License

MIT — see `LICENSE`.
