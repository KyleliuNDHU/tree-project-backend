const express = require('express');
const router = express.Router();
const db = require('../config/db');
const treeManagementController = require('../controllers/treeManagementController');

// 樹木管理建議 API 路由
router.post('/actions/generate', treeManagementController.generateManagementActions);
router.get('/actions', treeManagementController.getManagementActions);
router.put('/actions/:action_id', treeManagementController.updateManagementAction);
router.delete('/actions/:action_id', treeManagementController.deleteManagementAction);

module.exports = router;
