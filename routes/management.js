const express = require('express');
const router = express.Router();
const db = require('../config/db');
const treeManagementController = require('../controllers/treeManagementController');
const { requireRole } = require('../middleware/roleAuth');

// 樹木管理建議 API 路由
// POST generate 和 GET actions 需要專案管理員以上
router.post('/actions/generate', requireRole('專案管理員'), treeManagementController.generateManagementActions);
router.get('/actions', requireRole('調查管理員'), treeManagementController.getManagementActions);
router.put('/actions/:action_id', requireRole('專案管理員'), treeManagementController.updateManagementAction);
router.delete('/actions/:action_id', requireRole('專案管理員'), treeManagementController.deleteManagementAction);

module.exports = router;
