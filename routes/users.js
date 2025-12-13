const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { loginLimiter } = require('../middleware/rateLimiter');
const { signJwt } = require('../middleware/jwtAuth');
const AuditLogService = require('../services/auditLogService');

// 使用者管理相關 API
// 登入路由
router.post('/login', loginLimiter, async (req, res) => {
    const { account, password, loginType } = req.body;

    if (!account || !password) {
        return res.status(400).json({
            success: false,
            message: '請提供帳號和密碼'
        });
    }

    try {
        let roleCheck = '';
        let queryParams = [account];
        
        if (loginType === 'admin') {
            // 只允許特定角色登入管理後台
            // 注意：role 欄位是 user_role enum 類型，需要轉換為 text 進行比較
            const allowedAdminRoles = ['系統管理員', '業務管理員', '專案管理員', '調查管理員'];
            roleCheck = ` AND role::text = ANY($2::text[])`;
            queryParams.push(allowedAdminRoles);
        }

        const query = `SELECT user_id, username, password_hash, display_name, role, associated_projects, is_active FROM users WHERE username = $1 ${roleCheck}`;
        
        const { rows } = await db.query(query, queryParams);

        if (rows.length === 0) {
            await AuditLogService.log({
                action: 'LOGIN_FAILED',
                username: account,
                details: { reason: 'User not found or role mismatch', loginType },
                req
            });
            return res.status(404).json({
                success: false,
                message: loginType === 'admin' ? '無管理員權限或帳號不存在' : '帳號不存在'
            });
        }

        const user = rows[0];

        if (!user.is_active) {
            await AuditLogService.log({
                userId: user.user_id,
                username: user.username,
                action: 'LOGIN_FAILED',
                details: { reason: 'Account disabled', loginType },
                req
            });
            return res.status(403).json({
                success: false,
                message: '您的帳號已被禁用，請聯繫管理員'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            await AuditLogService.log({
                userId: user.user_id,
                username: user.username,
                action: 'LOGIN_FAILED',
                details: { reason: 'Invalid password', loginType },
                req
            });
            // 實際應用中可以加入登入失敗次數計數邏輯
            return res.status(401).json({
                success: false,
                message: '密碼錯誤'
            });
        }
        
        // 登入成功，重置登入失敗計數 (如果有的話)
        await AuditLogService.log({
            userId: user.user_id,
            username: user.username,
            action: 'LOGIN',
            details: { loginType },
            req
        });

        let accessibleProjects = [];
        if (user.role === '系統管理員') {
            const { rows: projectRows } = await db.query('SELECT DISTINCT project_code as code, project_name as name, project_location as area FROM tree_survey');
            accessibleProjects = projectRows;
        } else {
            const projectCodes = user.associated_projects ? user.associated_projects.split(',') : [];
            if (projectCodes.length > 0) {
                const projectQuery = 'SELECT DISTINCT project_code as code, project_name as name, project_location as area FROM tree_survey WHERE project_code = ANY($1::text[])';
                const { rows: projectRows } = await db.query(projectQuery, [projectCodes]);
                accessibleProjects = projectRows;
            }
        }

        let token;
        if (process.env.JWT_SECRET) {
            try {
                token = signJwt({
                    user_id: user.user_id,
                    username: user.username,
                    role: user.role,
                });
            } catch (e) {
                token = undefined;
            }
        }

        res.status(200).json({
            success: true,
            message: '登錄成功',
            token,
            user: {
                user_id: user.user_id,
                username: user.username,
                display_name: user.display_name,
                role: user.role,
                associated_projects: user.associated_projects,
                accessibleProjects: accessibleProjects // 新增此欄位
            }
        });

    } catch (error) {
        console.error('登入處理錯誤:', error);
        return res.status(500).json({
            success: false,
            message: '登入處理時發生錯誤'
        });
    }
});


// 取得使用者列表
router.get('/users', async (req, res) => {
    try {
        // [FIX] 明確轉換 is_active 為布林值 (true/false)，避免前端混淆
        const { rows } = await db.query('SELECT user_id, username, display_name, role, is_active FROM users ORDER BY user_id ASC');
        
        // 確保 is_active 輸出為 boolean
        const users = rows.map(user => ({
            ...user,
            is_active: !!user.is_active // 強制轉為 bool，PostgreSQL BOOLEAN 類型驅動可能已處理，但雙重保險
        }));

        res.json({
            success: true,
            users: users
        });
    } catch (err) {
        console.error('取得使用者列表錯誤:', err);
        return res.status(500).json({
            success: false,
            message: '取得使用者列表時發生錯誤'
        });
    }
});

// 新增使用者
router.post('/users', async (req, res) => {
    const { username, password, display_name, role } = req.body;
    const isActive = req.body.is_active === undefined ? true : (req.body.is_active ? true : false);

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: '請提供使用者名稱和密碼'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (username, password_hash, display_name, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING user_id';
        
        const { rows } = await db.query(sql, [username, hashedPassword, display_name || username, role || '一般使用者', isActive]);
        
        await AuditLogService.log({
            userId: req.user?.user_id, // Acting user
            username: req.user?.username,
            action: 'CREATE_USER',
            resourceType: 'users',
            resourceId: rows[0].user_id,
            details: { createdUsername: username, role },
            req
        });

        res.status(201).json({
            success: true,
            message: '使用者新增成功',
            userId: rows[0].user_id
        });
    } catch (error) {
        console.error('新增使用者錯誤:', error);
        if (error.code === '23505') { // PostgreSQL unique violation
            return res.status(409).json({ success: false, message: '使用者名稱已存在' });
        }
        res.status(500).json({
            success: false,
            message: '新增使用者時發生錯誤'
        });
    }
});

// 修改使用者
router.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { display_name, role, password, is_active } = req.body;

    try {
        const fieldsToUpdate = [];
        const values = [];
        let queryIndex = 1;

        if (display_name !== undefined) {
            fieldsToUpdate.push(`display_name = $${queryIndex++}`);
            values.push(display_name);
        }
        if (role !== undefined) {
            fieldsToUpdate.push(`role = $${queryIndex++}`);
            values.push(role);
        }
        if (is_active !== undefined) {
            fieldsToUpdate.push(`is_active = $${queryIndex++}`);
            values.push(is_active);
        }
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            fieldsToUpdate.push(`password_hash = $${queryIndex++}`);
            values.push(hashedPassword);
        }

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({
                success: false,
                message: '沒有提供任何要更新的欄位'
            });
        }

        const sql = `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE user_id = $${queryIndex}`;
        values.push(id);

        const { rowCount } = await db.query(sql, values);

        if (rowCount > 0) {
            await AuditLogService.log({
                userId: req.user?.user_id,
                username: req.user?.username,
                action: 'UPDATE_USER',
                resourceType: 'users',
                resourceId: id,
                details: { updatedFields: Object.keys(req.body).filter(k => k !== 'password') },
                req
            });

            res.json({
                success: true,
                message: '使用者修改成功'
            });
        } else {
            res.status(404).json({ success: false, message: '找不到指定的使用者' });
        }
    } catch (error) {
        console.error('修改使用者錯誤:', error);
        res.status(500).json({
            success: false,
            message: '修改使用者時發生錯誤'
        });
    }
});

// 切換使用者啟用狀態
router.put('/users/:id/status', async (req, res) => {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
        return res.status(400).json({
            success: false,
            message: '請求參數 isActive 必須是布林值'
        });
    }

    try {
        const { rowCount } = await db.query('UPDATE users SET is_active = $1 WHERE user_id = $2', [isActive, id]);
        
        if (rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: '找不到指定的使用者'
            });
        }

        await AuditLogService.log({
            userId: req.user?.user_id,
            username: req.user?.username,
            action: 'UPDATE_USER_STATUS',
            resourceType: 'users',
            resourceId: id,
            details: { isActive },
            req
        });

        res.json({
            success: true,
            message: `使用者狀態已更新`
        });
    } catch (err) {
        console.error(`切換使用者 ${id} 狀態錯誤:`, err);
        return res.status(500).json({
            success: false,
            message: '更新使用者狀態時發生資料庫錯誤'
        });
    }
});

// 刪除使用者
router.delete('/users/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { rowCount } = await db.query('DELETE FROM users WHERE user_id = $1', [id]);
        if (rowCount > 0) {
            await AuditLogService.log({
                userId: req.user?.user_id,
                username: req.user?.username,
                action: 'DELETE_USER',
                resourceType: 'users',
                resourceId: id,
                req
            });

            res.json({
                success: true,
                message: '使用者刪除成功'
            });
        } else {
            res.status(404).json({ success: false, message: '找不到指定的使用者' });
        }
    } catch (err) {
        console.error('刪除使用者錯誤:', err);
        return res.status(500).json({
            success: false,
            message: '刪除使用者時發生錯誤'
        });
    }
});

// 獲取使用者關聯專案
router.get('/users/:userId/projects', async (req, res) => {
    const { userId } = req.params;

    try {
        const { rows } = await db.query('SELECT associated_projects FROM users WHERE user_id = $1', [userId]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '找不到指定的使用者'
            });
        }

        const associatedProjects = rows[0].associated_projects;
        const projectList = associatedProjects ? associatedProjects.split(',') : [];

        if (projectList.length > 0) {
            const projectQuery = 'SELECT DISTINCT project_code, project_name, project_location FROM tree_survey WHERE project_code = ANY($1::text[])';
            const { rows: projectRows } = await db.query(projectQuery, [projectList]);
            res.json({
                success: true,
                projects: projectRows.map(p => ({
                    "專案代碼": p.project_code,
                    "專案名稱": p.project_name,
                    "專案區位": p.project_location
                }))
            });
        } else {
            res.json({
                success: true,
                projects: []
            });
        }
    } catch (err) {
        console.error('獲取關聯專案錯誤:', err);
        return res.status(500).json({
            success: false,
            message: '獲取關聯專案時發生錯誤'
        });
    }
});

// 更新使用者關聯專案
router.put('/users/:userId/projects', async (req, res) => {
    const { userId } = req.params;
    const { projects } = req.body; // 專案代碼陣列

    if (!Array.isArray(projects)) {
        return res.status(400).json({
            success: false,
            message: '專案清單格式錯誤'
        });
    }

    try {
        const projectsString = projects.join(',');
        const { rowCount } = await db.query('UPDATE users SET associated_projects = $1 WHERE user_id = $2', [projectsString, userId]);

        if (rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: '找不到指定的使用者'
            });
        }

        await AuditLogService.log({
            userId: req.user?.user_id,
            username: req.user?.username,
            action: 'UPDATE_USER_PROJECTS',
            resourceType: 'users',
            resourceId: userId,
            details: { projects },
            req
        });

        res.json({
            success: true,
            message: '關聯專案更新成功'
        });
    } catch (err) {
        console.error('更新關聯專案錯誤:', err);
        return res.status(500).json({
            success: false,
            message: '更新關聯專案時發生錯誤'
        });
    }
});


module.exports = router;
