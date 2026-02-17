const jwt = require('jsonwebtoken');
const db = require('../config/db');

const LEGACY_LOG_INTERVAL_MS = 60 * 60 * 1000;

const legacyLogState = {
    total: 0,
    write: 0,
    byGroup: new Map(),
    lastLoggedAt: 0,
};

// Cache for legacy expiry to avoid hitting DB on every request
let cachedLegacyUntilMs = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

function getLegacyLogMode() {
    const mode = (process.env.AUTH_LEGACY_LOG_MODE || 'off').toLowerCase();
    return mode === 'summary' ? 'summary' : 'off';
}

async function getLegacyUntilMs() {
    const now = Date.now();
    // Use cache if valid
    if (cachedLegacyUntilMs !== null && (now - lastCacheUpdate < CACHE_TTL)) {
        return cachedLegacyUntilMs;
    }

    let ms = null;

    // 1. Try DB first
    try {
        // Only query if table likely exists (we can't easily check existence cheaply, so just try-catch)
        const { rows } = await db.query("SELECT value FROM system_settings WHERE key = 'auth_legacy_until'");
        if (rows.length > 0 && rows[0].value) {
            const dbMs = new Date(rows[0].value).getTime();
            if (Number.isFinite(dbMs)) {
                ms = dbMs;
            }
        }
    } catch (e) {
        // Table might not exist yet during migration or DB issue
        // console.warn('Legacy auth DB check skipped:', e.message); 
    }

    // 2. Fallback to Env if DB didn't return a value
    if (ms === null) {
        const raw = process.env.AUTH_LEGACY_UNTIL;
        if (raw) {
            const envMs = new Date(raw).getTime();
            if (Number.isFinite(envMs)) {
                ms = envMs;
            }
        }
    }

    // Update cache (even if null)
    cachedLegacyUntilMs = ms;
    lastCacheUpdate = now;

    return ms;
}

async function isLegacyAllowed() {
    const untilMs = await getLegacyUntilMs();
    if (!untilMs) return false; // If not set, DENY by default (secure default)

    return Date.now() < untilMs;
}

function recordLegacyRequest(req) {
    if (getLegacyLogMode() !== 'summary') return;

    legacyLogState.total += 1;

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        legacyLogState.write += 1;
    }

    const group = String(req.path || '')
        .split('/')
        .filter(Boolean)[0] || '(root)';

    legacyLogState.byGroup.set(group, (legacyLogState.byGroup.get(group) || 0) + 1);

    const nowMs = Date.now();
    if (legacyLogState.lastLoggedAt && nowMs - legacyLogState.lastLoggedAt < LEGACY_LOG_INTERVAL_MS) {
        return;
    }

    legacyLogState.lastLoggedAt = nowMs;

    const topGroups = Array.from(legacyLogState.byGroup.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    console.log('[AuthLegacy] summary', {
        total: legacyLogState.total,
        write: legacyLogState.write,
        topGroups,
    });

    legacyLogState.total = 0;
    legacyLogState.write = 0;
    legacyLogState.byGroup.clear();
}

function getBearerToken(req) {
    const header = req.headers.authorization;
    if (!header) return null;

    const prefix = 'Bearer ';
    if (!header.startsWith(prefix)) return null;

    const token = header.slice(prefix.length).trim();
    return token || null;
}

function shouldSkipAuth(req) {
    if (req.method === 'OPTIONS') return true;
    if (req.path === '/login') return true;
    if (req.path.startsWith('/download/')) return true;
    // Admin paths now go through JWT too — adminAuth handles the admin-specific check

    return false;
}

async function jwtAuth(req, res, next) {
    if (shouldSkipAuth(req)) return next();

    const secret = process.env.JWT_SECRET;
    const token = getBearerToken(req);

    if (token && secret) {
        try {
            const decoded = jwt.verify(token, secret);
            req.user = decoded;
            return next();
        } catch (err) {
            // ignore and fall back to legacy check
        }
    }

    if (await isLegacyAllowed()) {
        recordLegacyRequest(req);
        return next();
    }

    return res.status(401).json({
        success: false,
        message: 'Unauthorized: JWT token required'
    });
}

function signJwt(payload) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not configured');
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || '30d';
    return jwt.sign(payload, secret, { expiresIn });
}

module.exports = {
    jwtAuth,
    signJwt,
};
