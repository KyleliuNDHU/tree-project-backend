const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// 確保環境變量被載入
dotenv.config();

// 檢查 API 金鑰最後更新時間
const API_KEY_ROTATION_DAYS = 30; // 建議每30天輪換一次金鑰
const apiKeyLastUpdated = process.env.API_KEY_LAST_UPDATED ? new Date(process.env.API_KEY_LAST_UPDATED) : new Date();
const daysSinceLastUpdate = Math.floor((new Date() - apiKeyLastUpdated) / (1000 * 60 * 60 * 24));

if (daysSinceLastUpdate >= API_KEY_ROTATION_DAYS) {
    console.warn(`警告: API 金鑰已經 ${daysSinceLastUpdate} 天未更新，建議進行輪換`);
}

// 初始化 OpenAI API
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 全局存儲用戶對話歷史
const conversationHistory = {};

// 生成永續報告
async function generateSustainabilityReport(dbData) {
    try {
        // 添加請求計數和錯誤處理
        const requestCount = process.env.API_REQUEST_COUNT ? parseInt(process.env.API_REQUEST_COUNT) + 1 : 1;
        process.env.API_REQUEST_COUNT = requestCount.toString();

        if (requestCount % 1000 === 0) {
            console.log(`提示: 已累計發送 ${requestCount} 次 API 請求`);
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages: [
                {
                    role: "system",
                    content: "你是一個專業的環境分析師，專門分析樹木數據並提供環境效益評估。請使用繁體中文回答。"
                },
                {
                    role: "user",
                    content: `根據以下數據進行分析：\n${Object.entries(dbData).map(([k, v]) => k + ': ' + v).join('\n')}\n\n請提供：\n1. 環境效益分析\n2. 具體建議`
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI API 錯誤:', error);
        // 記錄錯誤以便監控
        logApiError(error);
        throw new Error('生成報告時發生錯誤');
    }
}

// 主要聊天功能
async function chatWithAI(userId, message, treeData) {
    try {
        // 初始化對話歷史（如果不存在）
        if (!conversationHistory[userId]) {
            conversationHistory[userId] = [
                {
                    role: "system",
                    content: `你是專業的碳匯和永續森林管理顧問，專精於樹木調查和碳儲存分析。
以下是你的職責:
1. 提供科學準確的碳匯計算解釋，基於學術研究和IPCC指南
2. 解釋樹木碳儲存和碳吸收的科學原理
3. 提供基於證據的永續森林管理建議
4. 解答與樹木調查、碳匯和林業相關的問題

回答時請:
- 強調科學證據
- 引用計算方法來源
- 避免誇張或無法證實的主張
- 對不確定的部分保持謹慎態度
- 使用清晰、教育性語言
- 盡可能使用真實調查數據作為例子`
                }
            ];
        }
        
        // 準備參考數據摘要
        let dataPrompt = "";
        if (treeData) {
            dataPrompt = `
參考數據摘要:
- 總樹木數量: ${treeData.total_trees || '無數據'} 棵
- 總碳儲存量: ${treeData.total_carbon_storage || '無數據'} 公斤 CO₂當量
- 年碳吸存量: ${treeData.total_annual_carbon || '無數據'} 公斤 CO₂當量/年
- 平均樹高: ${treeData.avg_height || '無數據'} 公尺

碳計算方法:
1. 地上部生物量(AGB) = e^(-2.48 + 2.4835 × ln(胸徑))
2. 總生物量(TB) = 1.24 × AGB
3. 碳含量 = 0.50 × TB
4. CO₂當量 = 碳含量 × 3.67
5. 年碳吸存 = CO₂當量 × 生長率因子(預設0.03)
`;
        }

        // 添加用戶消息到歷史
        conversationHistory[userId].push({
            role: "user",
            content: `${dataPrompt}\n用戶問題: ${message}`
        });

        // 保持對話歷史在適當長度
        if (conversationHistory[userId].length > 20) {
            // 移除最舊的對話，但保留系統消息
            conversationHistory[userId] = [
                conversationHistory[userId][0],
                ...conversationHistory[userId].slice(-19)
            ];
        }

        // 調用 API
        const response = await openai.chat.completions.create({
            model: "gpt-4.1", // 使用最新模型
            messages: conversationHistory[userId],
            max_tokens: 800,
            temperature: 0.7,
        });

        // 獲取並保存AI回應
        const aiResponse = response.choices[0].message.content;
        conversationHistory[userId].push({
            role: "assistant",
            content: aiResponse
        });
        
        return aiResponse;
    } catch (error) {
        console.error('OpenAI API 錯誤:', error);
        return `與AI助手通信時出錯: ${error.message}`;
    }
}

// 碳匯教育提示生成
async function generateCarbonEducationContent(topic) {
    try {
        const topics = {
            "碳循環": "解釋森林在全球碳循環中的作用，包括碳匯與碳源概念",
            "計算方法": "詳細說明樹木碳儲存量計算方法，包括生物量方程和轉換係數",
            "樹種比較": "比較不同樹種的碳吸存能力與特性",
            "管理策略": "森林碳匯優化的管理策略與最佳實務"
        };

        const prompt = `請以教授角度撰寫一段關於"${topics[topic] || topic}"的科學解說，內容應包含:
1. 核心科學原理
2. 關鍵研究發現和引用
3. 實際應用意義
4. 對林業從業者或研究人員的建議

保持篇幅約300-500字，使用教育性但平易近人的語言，確保內容準確無誤且基於最新科學共識。`;

        const response = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages: [
                { role: "system", content: "你是森林科學與碳匯研究領域的專家學者，專長於提供準確、教育性的科學解說。" },
                { role: "user", content: prompt }
            ],
            max_tokens: 800,
            temperature: 0.7,
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('生成教育內容錯誤:', error);
        return `生成教育內容時出錯: ${error.message}`;
    }
}

// 碳足跡計算建議
async function generateCarbonFootprintAdvice(data) {
    try {
        const { activityType, amount, unit } = data;
        
        // 構建適合的系統提示
        const systemPrompt = `你是碳足跡計算與減排專家。使用科學文獻支持的排放因子和計算方法。引用權威來源（如IPCC、EPA和國家溫室氣體清冊），避免誇大或未經證實的聲明。保持學術嚴謹性同時使用平易近人的語言。`;
        
        // 構建用戶提示
        const userPrompt = `針對以下活動提供科學的碳足跡估算和減排建議：
活動類型: ${activityType}
數量: ${amount} ${unit}

請提供:
1. 碳足跡估算（使用範圍而非精確數字，並註明計算依據）
2. 3-5條實證支持的減排建議
3. 如果適用，說明樹木種植如何抵消這些排放（基於真實碳匯計算）`;

        const response = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            max_tokens: 800,
            temperature: 0.7,
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('生成碳足跡建議錯誤:', error);
        return `生成碳足跡建議時出錯: ${error.message}`;
    }
}

// 碳足跡抵消計算
async function calculateCarbonOffsetTree(carbonFootprint) {
    try {
        // 驗證輸入
        const carbonAmount = parseFloat(carbonFootprint.amount);
        if (isNaN(carbonAmount) || carbonAmount <= 0) {
            throw new Error('碳足跡數量必須是正數');
        }

        // 碳單位轉換 (如果需要)
        let carbonKg = carbonAmount;
        if (carbonFootprint.unit.toLowerCase() === 'ton' || carbonFootprint.unit.toLowerCase() === '噸') {
            carbonKg = carbonAmount * 1000; // 噸轉公斤
        }

        // 獲取樹木平均數據 (從資料庫或使用預設值)
        // 假設一棵平均樹每年吸收25公斤CO2
        const averageAnnualCarbonSequestrationPerTree = 25; // 公斤CO2/年
        
        // 計算需要多少棵樹來抵消碳足跡（一年內）
        const treesNeeded = Math.ceil(carbonKg / averageAnnualCarbonSequestrationPerTree);
        
        // 計算不同樹種的抵消能力
        const speciesOffset = {
            '台灣欒樹': Math.ceil(carbonKg / 30), // 假設每年吸收30公斤CO2
            '樟樹': Math.ceil(carbonKg / 22),    // 假設每年吸收22公斤CO2
            '楓香': Math.ceil(carbonKg / 27),    // 假設每年吸收27公斤CO2
            '榕樹': Math.ceil(carbonKg / 35)     // 假設每年吸收35公斤CO2
        };
        
        // 計算10年和20年期間內所需的樹木數量
        const treesNeeded10Years = Math.ceil(carbonKg / (averageAnnualCarbonSequestrationPerTree * 10));
        const treesNeeded20Years = Math.ceil(carbonKg / (averageAnnualCarbonSequestrationPerTree * 20));
        
        return {
            carbonFootprintKg: carbonKg,
            treesNeededForOneYear: treesNeeded,
            treesNeededFor10Years: treesNeeded10Years,
            treesNeededFor20Years: treesNeeded20Years,
            speciesComparison: speciesOffset,
            note: "樹木抵消碳排放是長期過程，樹木的碳吸收率會隨年齡和種類而變化。本計算基於每年平均值，實際效果可能因環境條件、樹木健康狀況等因素而異。"
        };
    } catch (error) {
        console.error('計算樹木抵消數量錯誤:', error);
        return {
            error: `計算樹木抵消數量時出錯: ${error.message}`,
            carbonFootprintKg: 0,
            treesNeededForOneYear: 0
        };
    }
}

// 樹種碳匯比較
async function generateSpeciesCarbonComparison(speciesList) {
    try {
        // 標準樹種生長和碳匯特性資料庫
        const speciesData = {
            "樟樹": {
                growthRate: "中",
                carbonFactor: 0.02,
                lifespan: "長（可達百年以上）",
                advantages: "適應性強，抗汙染，藥用價值高",
                disadvantages: "生長較慢，需要較大空間"
            },
            "台灣欒樹": {
                growthRate: "快",
                carbonFactor: 0.04,
                lifespan: "中等（50-80年）",
                advantages: "生長快速，觀賞價值高，適應城市環境",
                disadvantages: "樹冠較小，單株碳儲存潛力較有限"
            },
            "相思樹": {
                growthRate: "快",
                carbonFactor: 0.04,
                lifespan: "中等（40-60年）",
                advantages: "生長快速，固氮能力強，可改善土壤",
                disadvantages: "木材密度較低，碳儲存密度相對較小"
            },
            "楓香": {
                growthRate: "中-快",
                carbonFactor: 0.03,
                lifespan: "長（80-100年）",
                advantages: "碳儲存能力強，觀賞價值高，葉面積大",
                disadvantages: "需要適當管理，較易受病蟲害影響"
            },
            "榕樹": {
                growthRate: "中",
                carbonFactor: 0.02,
                lifespan: "長（可達數百年）",
                advantages: "生物量大，空氣淨化能力強，根系發達",
                disadvantages: "根系侵略性強，不適合種植於建築物附近"
            }
        };

        let comparisonContent = "";
        
        // 檢查請求的樹種是否在資料庫中
        const availableSpecies = speciesList.filter(species => speciesData[species]);
        const unavailableSpecies = speciesList.filter(species => !speciesData[species]);
        
        if (availableSpecies.length > 0) {
            // 構建比較數據
            comparisonContent = availableSpecies.map(species => {
                const data = speciesData[species];
                return `**${species}**:
- 生長速度: ${data.growthRate}
- 碳吸存率因子: ${data.carbonFactor} (年增長率)
- 預期壽命: ${data.lifespan}
- 優勢: ${data.advantages}
- 限制: ${data.disadvantages}`;
            }).join("\n\n");
        }

        // 處理不在資料庫中的樹種
        if (unavailableSpecies.length > 0) {
            // 使用 OpenAI 生成這些未知樹種的估計資料
            const unknownSpeciesPrompt = `以下是需要估計碳匯特性的樹種: ${unavailableSpecies.join('、')}

請提供這些樹種的以下資訊:
1. 生長速度 (慢/中/快)
2. 碳吸存率因子 (0.01-0.04之間的年增長率，根據真實研究數據)
3. 預期壽命範圍
4. 主要優勢
5. 主要限制

只提供有可靠科學依據的資訊，對於不確定的部分請明確表示。`;

            const response = await openai.chat.completions.create({
                model: "gpt-4.1",
                messages: [
                    { role: "system", content: "你是樹木生長與碳吸存專家，只提供有科學依據的資訊。對於不確定的內容，應明確表示這是估計值或缺乏資料。" },
                    { role: "user", content: unknownSpeciesPrompt }
                ],
                max_tokens: 800,
                temperature: 0.7,
            });

            if (comparisonContent) {
                comparisonContent += "\n\n--- 估計資料（可能需要進一步驗證）---\n\n";
            }
            comparisonContent += response.choices[0].message.content;
        }

        return comparisonContent;
    } catch (error) {
        console.error('生成樹種比較錯誤:', error);
        return `生成樹種比較時出錯: ${error.message}`;
    }
}

// 記錄 API 錯誤
function logApiError(error) {
    const errorLog = {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
    };
    
    // 將錯誤寫入日誌文件
    const logPath = path.join(__dirname, '../logs/api-errors.log');
    fs.appendFileSync(logPath, JSON.stringify(errorLog) + '\n');
}

// 碳匯預測模型 - 由於缺乏歷史數據，暫時注釋此功能
/*
async function predictCarbonSequestration(historicalData, yearsToPredict = 5) {
    try {
        // 添加請求計數
        const requestCount = process.env.API_REQUEST_COUNT ? parseInt(process.env.API_REQUEST_COUNT) + 1 : 1;
        process.env.API_REQUEST_COUNT = requestCount.toString();

        // 格式化歷史數據，使其更易於模型理解
        const formattedData = historicalData.map(item => 
            `年份: ${item.year}, 平均樹高: ${item.avg_height}公尺, 平均胸徑: ${item.avg_dbh}公分, 總碳儲存: ${item.total_carbon}噸`
        ).join('\n');

        const currentYear = new Date().getFullYear();
        const yearsToProject = Array.from({length: yearsToPredict}, (_, i) => currentYear + i + 1);
        
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `你是一位專業的森林碳匯分析師，擅長根據歷史數據預測未來樹木生長和碳儲存趨勢。
                    你的預測需要基於科學原理和實際的歷史數據趨勢。
                    請提供的預測要有理有據，並解釋你的推理過程。
                    你的預測應包含每年的平均樹高、平均胸徑和總碳儲存量的具體數值。
                    請以表格和描述性文字的形式呈現預測結果。`
                },
                {
                    role: "user",
                    content: `以下是我們的樹木歷史數據：
                    
${formattedData}

請根據這些數據預測未來${yearsToPredict}年(${yearsToProject.join(', ')})的樹木生長和碳儲存情況。
具體來說，請預測每年的：
1. 平均樹高(公尺)
2. 平均胸徑(公分)
3. 總碳儲存量(噸)

請先提供預測的數值表格，然後解釋你的預測依據和可能影響因素。最後，提供一個碳匯發展趨勢摘要。`
                }
            ],
            temperature: 0.5, // 降低溫度以獲得更確定性的預測
            max_tokens: 1000
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI 碳匯預測錯誤:', error);
        logApiError(error);
        throw new Error('生成碳匯預測時發生錯誤');
    }
}
*/

// 永續發展政策建議引擎
async function generateSustainabilityPolicyRecommendations(treeData, focusArea) {
    try {
        // 添加請求計數
        const requestCount = process.env.API_REQUEST_COUNT ? parseInt(process.env.API_REQUEST_COUNT) + 1 : 1;
        process.env.API_REQUEST_COUNT = requestCount.toString();

        // 格式化樹木數據
        const formattedData = `
總樹木數量: ${treeData.total_trees}棵
總碳儲存量: ${treeData.total_carbon_storage}噸
年碳吸存量: ${treeData.total_annual_carbon}噸
平均樹高: ${treeData.avg_height}公尺
物種多樣性: ${treeData.species_diversity || '未提供'}種
主要樹種: ${treeData.main_species || '未提供'}
區域分佈: ${treeData.area_distribution || '未提供'}
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages: [
                {
                    role: "system",
                    content: `你是一位永續發展政策專家，擅長根據樹木和生態數據提供符合最新環保標準的政策建議。
                    你的建議應基於實際數據，考慮環境、社會和經濟的多重面向。
                    請確保你的建議具體可行，並符合臺灣現行的環保法規和國際永續發展目標(SDGs)。
                    你需要針對用戶關注的特定領域提供客製化的政策建議。`
                },
                {
                    role: "user",
                    content: `以下是我們的樹木調查數據：
                    
${formattedData}

我們特別關注的領域是：${focusArea}

請根據這些數據和關注領域，提供以下內容：
1. 3-5條具體的永續發展政策建議
2. 每條建議的實施步驟和預期效益
3. 如何與現有環保政策協同，以達到最大效益
4. 如何評估政策實施的成效

請確保建議具有科學依據，並能適應台灣的本地條件。`
                }
            ],
            temperature: 0.7,
            max_tokens: 1200
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI 政策建議錯誤:', error);
        logApiError(error);
        throw new Error('生成永續政策建議時發生錯誤');
    }
}

module.exports = {
    generateSustainabilityReport,
    chatWithAI,
    // predictCarbonSequestration, // 由於缺乏歷史數據，暫時注釋此功能
    generateSustainabilityPolicyRecommendations,
    generateCarbonEducationContent,
    generateCarbonFootprintAdvice,
    generateSpeciesCarbonComparison,
    calculateCarbonOffsetTree
}; 