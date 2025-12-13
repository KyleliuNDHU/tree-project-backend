/**
 * 專案權限驗證中間件
 * 
 * 功能：
 * 1. 驗證使用者是否有權限存取/編輯特定專案的資料
 * 2. 系統管理員和業務管理員有全部專案的權限
 * 3. 其他角色只能存取 associated_projects 中的專案
 * 
 * 使用方式：
 *   router.put('/tree/:id', jwtAuth, projectAuth, updateTreeController);
 */

const pool = require('../config/database');

/**
 * 檢查使用者是否有專案權限
 * @param {string} userId - 使用者 ID
 * @param {string} projectCode - 專案代碼
 * @param {string} userRole - 使用者角色
 * @param {Array<string>} associatedProjects - 使用者關聯的專案列表
 * @returns {boolean} 是否有權限
 */
function hasProjectPermission(userId, projectCode, userRole, associatedProjects) {
    // 系統管理員和業務管理員有全部權限
    if (userRole === '系統管理員' || userRole === '業務管理員') {
        return true;
    }
    
    // 如果沒有專案代碼，允許（例如查詢全部資料）
    if (!projectCode) {
        return true;
    }
    
    // 檢查專案是否在使用者的關聯專案中
    if (associatedProjects && Array.isArray(associatedProjects)) {
        return associatedProjects.includes(projectCode);
    }
    
    // 如果 associated_projects 是字串（逗號分隔）
    if (typeof associatedProjects === 'string') {
        const projects = associatedProjects.split(',').map(p => p.trim());
        return projects.includes(projectCode);
    }
    
    return false;
}

/**
 * 從請求中提取專案代碼
 */
function extractProjectCode(req) {
    // 優先從 body 中取得
    if (req.body.project_code) {
        return req.body.project_code;
    }
    
    // 從 query 參數取得
    if (req.query.project_code) {
        return req.query.project_code;
    }
    
    // 從 params 取得
    if (req.params.project_code) {
        return req.params.project_code;
    }
    
    return null;
}

/**
 * 專案權限驗證中間件
 */
async function projectAuth(req, res, next) {
    try {
        // 如果沒有使用者資訊，拒絕存取
        if (!req.user || !req.user.user_id) {
            return res.status(401).json({
                success: false,
                message: '未授權：請先登入'
            });
        }
        
        const userId = req.user.user_id;
        const userRole = req.user.role;
        const associatedProjects = req.user.associated_projects;
        
        // 系統管理員和業務管理員直接放行
        if (userRole === '系統管理員' || userRole === '業務管理員') {
            return next();
        }
        
        // 提取專案代碼
        let projectCode = extractProjectCode(req);
        
        // 如果是編輯/刪除操作，需要從資料庫查詢該資料的專案代碼
        if (!projectCode && (req.method === 'PUT' || req.method === 'DELETE')) {
            const resourceId = req.params.id;
            
            if (resourceId) {
                try {
                    const result = await pool.query(
                        'SELECT project_code FROM tree_survey WHERE id = $1',
                        [resourceId]
                    );
                    
                    if (result.rows.length > 0) {
                        projectCode = result.rows[0].project_code;
                    }
                } catch (err) {
                    console.error('[ProjectAuth] Failed to query project_code:', err.message);
                }
            }
        }
        
        // 檢查權限
        if (projectCode && !hasProjectPermission(userId, projectCode, userRole, associatedProjects)) {
            return res.status(403).json({
                success: false,
                message: '權限不足：您沒有此專案的存取權限'
            });
        }
        
        // 將專案代碼附加到 req 供後續使用
        req.projectCode = projectCode;
        
        next();
    } catch (error) {
        console.error('[ProjectAuth] Error:', error);
        return res.status(500).json({
            success: false,
            message: '權限驗證失敗'
        });
    }
}

/**
 * 專案權限驗證中間件（僅用於查詢，不阻擋）
 * 會過濾結果，只返回使用者有權限的專案資料
 */
function projectAuthFilter(req, res, next) {
    if (!req.user || !req.user.user_id) {
        return next();
    }
    
    const userRole = req.user.role;
    const associatedProjects = req.user.associated_projects;
    
    // 系統管理員和業務管理員可以看全部
    if (userRole === '系統管理員' || userRole === '業務管理員') {
        req.projectFilter = null; // 不過濾
        return next();
    }
    
    // 其他角色只能看自己的專案
    if (associatedProjects) {
        if (typeof associatedProjects === 'string') {
            req.projectFilter = associatedProjects.split(',').map(p => p.trim());
        } else if (Array.isArray(associatedProjects)) {
            req.projectFilter = associatedProjects;
        }
    } else {
        req.projectFilter = []; // 沒有關聯專案，返回空
    }
    
    next();
}

module.exports = {
    projectAuth,
    projectAuthFilter,
    hasProjectPermission
};
