const openai = require('../services/openaiService');

// 智能諮詢功能
async function handleTreeQuery(query, dbData) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages: [
                {
                    role: "system",
                    content: "你是一個專業的樹木與永續發展顧問，擅長解答關於樹木生長、碳儲存、環境影響等問題。請基於提供的數據給出專業的回答。"
                },
                {
                    role: "user",
                    content: `基於以下數據回答問題：${JSON.stringify(dbData)}\n\n問題：${query}`
                }
            ],
            temperature: 0.7,
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI API 錯誤:', error);
        throw new Error('無法處理您的問題，請稍後再試');
    }
}

// 生成永續報告
async function generateSustainabilityReport(data) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages: [
                {
                    role: "system",
                    content: "你是一個永續發展報告專家，請基於提供的數據生成專業的永續發展報告。"
                },
                {
                    role: "user",
                    content: `請基於以下數據生成永續發展報告：
                    總樹數：${data.總樹數}
                    總碳儲存：${data.總碳儲存}
                    年碳吸收：${data.年碳吸收}
                    平均樹高：${data.平均樹高}`
                }
            ],
            temperature: 0.7,
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI API 錯誤:', error);
        throw new Error('無法生成報告，請稍後再試');
    }
}

// 預測分析功能
async function predictGrowthTrend(historicalData) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages: [
                {
                    role: "system",
                    content: "你是一個樹木生長預測專家，請基於歷史數據預測未來趨勢。"
                },
                {
                    role: "user",
                    content: `請基於以下歷史數據預測未來生長趨勢：${JSON.stringify(historicalData)}`
                }
            ],
            temperature: 0.7,
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI API 錯誤:', error);
        throw new Error('無法生成預測，請稍後再試');
    }
}

module.exports = {
    handleTreeQuery,
    generateSustainabilityReport,
    predictGrowthTrend
}; 