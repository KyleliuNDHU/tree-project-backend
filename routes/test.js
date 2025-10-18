const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 從 index_4.js 遷移過來
router.post('/', (req, res) => {
    res.json({
        success: true,
        message: '測試請求成功',
        data: {
            requestTime: new Date().toISOString()
        }
    });
});

// 從 index_7.js 遷移過來
router.get('/openai', async (req, res) => {
    try {
        console.log('Testing OpenAI connection...');
        console.log('API Key status:', process.env.OPENAI_API_KEY ? 'Set' : 'Not Set');

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ "role": "user", "content": "Hello! This is a test message." }],
            max_tokens: 50
        });

        res.json({
            success: true,
            message: completion.choices[0].message.content
        });
    } catch (error) {
        console.error('OpenAI test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
