const db = require('../config/db');

/**
 * Audit Log Service
 * Handles recording security and operational events.
 */
class AuditLogService {
    /**
     * Log an action
     * @param {Object} params
     * @param {number|string} [params.userId] - User ID performing the action
     * @param {string} [params.username] - Username (snapshot)
     * @param {string} params.action - Action name (e.g., 'LOGIN', 'CREATE_TREE')
     * @param {string} [params.resourceType] - Type of resource affected
     * @param {string} [params.resourceId] - ID of resource affected
     * @param {Object|string} [params.details] - Additional details
     * @param {Object} [req] - Express request object (to extract IP/UserAgent)
     */
    static async log({ userId, username, action, resourceType, resourceId, details, req }) {
        try {
            let ipAddress = null;
            let userAgent = null;

            if (req) {
                // Handle proxy forwarded IPs if configured
                ipAddress = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
                // If x-forwarded-for contains multiple IPs, take the first one
                if (ipAddress && ipAddress.indexOf(',') > -1) {
                    ipAddress = ipAddress.split(',')[0].trim();
                }
                userAgent = req.get('User-Agent');
            }

            const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details;

            const query = `
                INSERT INTO audit_logs 
                (user_id, username, action, resource_type, resource_id, details, ip_address, user_agent)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;

            // Ensure userId is integer or null
            const validUserId = (userId && !isNaN(parseInt(userId))) ? parseInt(userId) : null;

            await db.query(query, [
                validUserId,
                username || null,
                action,
                resourceType || null,
                resourceId ? String(resourceId) : null,
                detailsStr || null,
                ipAddress || null,
                userAgent || null
            ]);
        } catch (error) {
            console.error('[AuditLog] Failed to record log:', error);
            // Don't throw, audit logging failure shouldn't break the main flow
        }
    }
}

module.exports = AuditLogService;
