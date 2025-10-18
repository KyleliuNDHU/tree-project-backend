const express = require('express');
const router = express.Router();
const knowledgeController = require('../controllers/knowledgeController');

// 樹木知識管理 API 路由
router.post('/', knowledgeController.addKnowledge);
router.get('/', knowledgeController.getKnowledge);
router.delete('/:id', knowledgeController.deleteKnowledge);
router.get('/search', knowledgeController.searchKnowledge);
router.post('/initialize', knowledgeController.initializeDefaultKnowledge);

module.exports = router;
