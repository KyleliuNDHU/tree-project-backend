const express = require('express');
const router = express.Router();
const knowledgeController = require('../controllers/knowledgeController');
const { requireRole } = require('../middleware/roleAuth');

// 樹木知識管理 API 路由
router.post('/', requireRole('系統管理員'), knowledgeController.addKnowledge);
router.get('/', knowledgeController.getKnowledge);
router.delete('/:id', requireRole('系統管理員'), knowledgeController.deleteKnowledge);
router.get('/search', knowledgeController.searchKnowledge);
router.post('/initialize', requireRole('系統管理員'), knowledgeController.initializeDefaultKnowledge);

module.exports = router;
