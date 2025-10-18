const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
    console.warn('警告：未在 .env 檔案中設定 OPENAI_API_KEY。依賴 OpenAI 的功能將無法運作。');
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

module.exports = openai;
