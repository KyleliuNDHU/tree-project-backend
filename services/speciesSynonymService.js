/**
 * 樹種同義詞分析與合併服務
 * 
 * 功能：
 * 1. 分析 tree_survey 中的樹種名稱，找出潛在同義詞/名稱變體
 * 2. 自動建立同義詞關聯
 * 3. 提供統一後的樹種列表給前端
 * 4. 定期清理重複名稱
 */

const db = require('../config/db');

// ========== 字串相似度工具 ==========

/**
 * Levenshtein 距離 (編輯距離)
 */
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // 替換
                    matrix[i][j - 1] + 1,       // 插入
                    matrix[i - 1][j] + 1        // 刪除
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * 計算字串相似度 (0~1)
 */
function stringSimilarity(a, b) {
    if (!a || !b) return 0;
    const la = a.toLowerCase().trim();
    const lb = b.toLowerCase().trim();
    if (la === lb) return 1;
    const maxLen = Math.max(la.length, lb.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(la, lb) / maxLen;
}

/**
 * 台繁體正規化（台→臺、麻→蔴 等常見異體字）
 */
function normalizeChinese(text) {
    if (!text) return '';
    const map = {
        '台': '臺', '麻': '蔴', '裡': '裏', '佈': '布',
        '啟': '啓', '為': '爲', '線': '綫', '群': '羣', '峰': '峯',
    };
    // 只做台→臺 這個最常見的
    return text.replace(/台/g, '臺');
}

/**
 * 移除名稱中的括號內容和常見後綴
 * 例如：「大葉羅漢松/羅漢松」→ 取第一個
 */
function cleanSpeciesName(name) {
    if (!name) return '';
    let clean = name.trim();
    // 移除括號內容
    clean = clean.replace(/[（(].+?[）)]/g, '').trim();
    // 如果有 / 分隔，取第一個
    if (clean.includes('/')) {
        clean = clean.split('/')[0].trim();
    }
    return clean;
}


// ========== 核心服務 ==========

/**
 * 分析所有樹種名稱變體，產生報告
 * 掃描 tree_survey 中的 species_name，與 tree_species 表比對
 * 
 * @returns {Object} 分析報告
 */
async function analyzeSpeciesVariants() {
    const report = {
        totalSurveyNames: 0,
        totalSpeciesInDB: 0,
        exactMatches: 0,
        fuzzyMatches: [],
        unmatched: [],
        duplicates: [],
        timestamp: new Date().toISOString()
    };

    try {
        // 1. 取得所有 tree_species 標準名稱
        const { rows: dbSpecies } = await db.query(
            'SELECT id, name, scientific_name FROM tree_species ORDER BY name'
        );
        report.totalSpeciesInDB = dbSpecies.length;

        // 2. 取得 tree_survey 中所有不同的樹種名稱
        const { rows: surveyNames } = await db.query(`
            SELECT DISTINCT species_name as name, COUNT(*) as count 
            FROM tree_survey 
            WHERE species_name IS NOT NULL AND species_name != '' AND species_name != '預設樹種'
            GROUP BY species_name 
            ORDER BY count DESC
        `);
        report.totalSurveyNames = surveyNames.length;

        // 3. 取得已有同義詞
        let existingSynonyms = [];
        try {
            const { rows } = await db.query('SELECT variant_name, canonical_species_id FROM species_synonyms');
            existingSynonyms = rows;
        } catch (e) {
            if (e.code !== '42P01') console.error('查詢同義詞表錯誤:', e.message);
        }

        // 4. 逐一分析各調查名稱
        for (const survey of surveyNames) {
            const surveyName = survey.name;
            const normalized = normalizeChinese(surveyName);
            const cleaned = cleanSpeciesName(surveyName);

            // 4a. 精確匹配
            const exactMatch = dbSpecies.find(sp => 
                sp.name === surveyName || 
                sp.name === normalized || 
                sp.name === cleaned
            );
            if (exactMatch) {
                report.exactMatches++;
                continue;
            }

            // 4b. 已在同義詞表中
            const synMatch = existingSynonyms.find(syn => syn.variant_name === surveyName);
            if (synMatch) {
                report.exactMatches++;
                continue;
            }

            // 4c. 模糊匹配
            let bestMatch = null;
            let bestScore = 0;

            for (const sp of dbSpecies) {
                // 比較名稱
                const score1 = stringSimilarity(surveyName, sp.name);
                const score2 = stringSimilarity(normalized, sp.name);
                const score3 = stringSimilarity(cleaned, sp.name);
                // 比較清理後的標準名稱
                const cleanedDbName = cleanSpeciesName(sp.name);
                const score4 = stringSimilarity(cleaned, cleanedDbName);
                // 包含關係加分
                let containScore = 0;
                if (sp.name.includes(cleaned) || cleaned.includes(sp.name)) {
                    containScore = 0.85;
                }

                const score = Math.max(score1, score2, score3, score4, containScore);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = sp;
                }
            }

            if (bestScore >= 0.7) {
                report.fuzzyMatches.push({
                    surveyName,
                    surveyCount: parseInt(survey.count),
                    matchedSpecies: bestMatch.name,
                    matchedId: bestMatch.id,
                    similarity: parseFloat(bestScore.toFixed(3))
                });
            } else {
                report.unmatched.push({
                    name: surveyName,
                    count: parseInt(survey.count),
                    bestGuess: bestMatch ? bestMatch.name : null,
                    bestScore: bestMatch ? parseFloat(bestScore.toFixed(3)) : 0
                });
            }
        }

        // 5. 找出 tree_species 中可能重複的條目
        for (let i = 0; i < dbSpecies.length; i++) {
            for (let j = i + 1; j < dbSpecies.length; j++) {
                const sim = stringSimilarity(dbSpecies[i].name, dbSpecies[j].name);
                if (sim >= 0.75 && sim < 1) {
                    report.duplicates.push({
                        species1: { id: dbSpecies[i].id, name: dbSpecies[i].name },
                        species2: { id: dbSpecies[j].id, name: dbSpecies[j].name },
                        similarity: parseFloat(sim.toFixed(3))
                    });
                }
            }
        }

    } catch (err) {
        console.error('[SynonymService] 分析錯誤:', err);
        report.error = err.message;
    }

    return report;
}


/**
 * 執行同義詞合併
 * 1. 分析 tree_survey 中的名稱
 * 2. 對高信心度的匹配自動建立同義詞
 * 3. 正規化調查記錄中的樹種名稱
 * 
 * @returns {Object} 合併結果
 */
async function runSynonymMerge() {
    const result = {
        synonymsAdded: 0,
        surveysNormalized: 0,
        details: [],
        timestamp: new Date().toISOString()
    };

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 確保同義詞表存在
        try {
            await client.query('SELECT 1 FROM species_synonyms LIMIT 1');
        } catch (e) {
            if (e.code === '42P01') {
                console.log('[SynonymService] species_synonyms 表不存在，跳過合併');
                await client.query('ROLLBACK');
                result.error = '同義詞表尚未建立，請先執行資料庫遷移';
                return result;
            }
            throw e;
        }

        // 取得標準樹種
        const { rows: dbSpecies } = await client.query(
            'SELECT id, name, scientific_name FROM tree_species ORDER BY name'
        );

        // 取得調查中的不同名稱
        const { rows: surveyNames } = await client.query(`
            SELECT DISTINCT species_name as name, COUNT(*) as count,
                   array_agg(DISTINCT species_id) as species_ids
            FROM tree_survey 
            WHERE species_name IS NOT NULL AND species_name != '' AND species_name != '預設樹種'
            GROUP BY species_name
            ORDER BY count DESC
        `);

        // 取得已有同義詞
        const { rows: existingSynonyms } = await client.query(
            'SELECT variant_name, canonical_species_id FROM species_synonyms'
        );
        const existingSet = new Set(existingSynonyms.map(s => s.variant_name));

        for (const survey of surveyNames) {
            const surveyName = survey.name;
            
            // 已經是標準名稱
            if (dbSpecies.some(sp => sp.name === surveyName)) continue;
            // 已經是已知同義詞
            if (existingSet.has(surveyName)) continue;

            // 嘗試匹配
            const normalized = normalizeChinese(surveyName);
            const cleaned = cleanSpeciesName(surveyName);

            let bestMatch = null;
            let bestScore = 0;
            let matchReason = '';

            for (const sp of dbSpecies) {
                // 正規化比對
                if (normalizeChinese(sp.name) === normalized) {
                    bestMatch = sp;
                    bestScore = 0.95;
                    matchReason = '繁簡/異體字正規化';
                    break;
                }

                // 清理後精確匹配
                if (cleanSpeciesName(sp.name) === cleaned && cleaned.length >= 2) {
                    bestMatch = sp;
                    bestScore = 0.9;
                    matchReason = '清理後名稱匹配';
                    break;
                }

                // 包含關係
                if (sp.name.length >= 2 && cleaned.length >= 2) {
                    if (sp.name.includes(cleaned) || cleaned.includes(sp.name)) {
                        const sim = stringSimilarity(surveyName, sp.name);
                        if (sim > bestScore) {
                            bestMatch = sp;
                            bestScore = Math.max(sim, 0.8);
                            matchReason = '名稱包含關係';
                        }
                    }
                }

                // 編輯距離
                const sim = stringSimilarity(surveyName, sp.name);
                if (sim > bestScore && sim >= 0.8) {
                    bestMatch = sp;
                    bestScore = sim;
                    matchReason = '字串相似度';
                }
            }

            // 只對高信心度的自動合併
            if (bestMatch && bestScore >= 0.8) {
                try {
                    await client.query(`
                        INSERT INTO species_synonyms (canonical_species_id, variant_name, scientific_name, source, confidence)
                        VALUES ($1, $2, $3, 'auto', $4)
                        ON CONFLICT (canonical_species_id, variant_name) DO NOTHING
                    `, [bestMatch.id, surveyName, bestMatch.scientific_name, bestScore]);

                    result.synonymsAdded++;
                    result.details.push({
                        variantName: surveyName,
                        canonicalName: bestMatch.name,
                        canonicalId: bestMatch.id,
                        confidence: bestScore,
                        reason: matchReason,
                        surveyCount: parseInt(survey.count)
                    });

                    // 記錄到合併日誌
                    await client.query(`
                        INSERT INTO species_merge_log (merge_type, source_name, target_species_id, target_species_name, affected_survey_count, details)
                        VALUES ('synonym_add', $1, $2, $3, $4, $5)
                    `, [
                        surveyName, bestMatch.id, bestMatch.name, parseInt(survey.count),
                        JSON.stringify({ confidence: bestScore, reason: matchReason })
                    ]);

                } catch (insertErr) {
                    console.error(`[SynonymService] 新增同義詞失敗 (${surveyName}):`, insertErr.message);
                }
            }
        }

        await client.query('COMMIT');
        console.log(`[SynonymService] 合併完成: 新增 ${result.synonymsAdded} 個同義詞`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[SynonymService] 合併錯誤:', err);
        result.error = err.message;
    } finally {
        client.release();
    }

    return result;
}


/**
 * 根據名稱查找標準樹種（含同義詞搜尋）
 * 供前端搜尋時使用
 * 
 * @param {string} query - 搜尋關鍵字
 * @returns {Array} 匹配到的樹種列表（含匹配類別）
 */
async function searchSpeciesWithSynonyms(query) {
    if (!query || query.trim().length === 0) return [];

    const q = query.trim().toLowerCase();
    const results = [];

    try {
        // 1. 從 tree_species 精確/部分匹配
        const { rows: directMatches } = await db.query(`
            SELECT id, name, scientific_name, 'direct' as match_type, 1.0 as relevance
            FROM tree_species
            WHERE LOWER(name) LIKE $1 OR LOWER(scientific_name) LIKE $1 OR LOWER(id) LIKE $1
            ORDER BY 
                CASE WHEN LOWER(name) = $2 THEN 0
                     WHEN LOWER(name) LIKE $3 THEN 1
                     ELSE 2 END,
                name
            LIMIT 20
        `, [`%${q}%`, q, `${q}%`]);
        results.push(...directMatches);

        // 2. 從同義詞表匹配
        try {
            const { rows: synMatches } = await db.query(`
                SELECT ts.id, ts.name, ts.scientific_name, 
                       'synonym' as match_type, 
                       ss.confidence as relevance,
                       ss.variant_name as matched_variant
                FROM species_synonyms ss
                JOIN tree_species ts ON ss.canonical_species_id = ts.id
                WHERE LOWER(ss.variant_name) LIKE $1
                ORDER BY ss.confidence DESC
                LIMIT 10
            `, [`%${q}%`]);

            // 不重複加入
            for (const syn of synMatches) {
                if (!results.find(r => r.id === syn.id)) {
                    results.push(syn);
                }
            }
        } catch (e) {
            if (e.code !== '42P01') console.error('同義詞搜尋錯誤:', e.message);
        }

    } catch (err) {
        console.error('[SynonymService] 搜尋錯誤:', err);
    }

    return results;
}


/**
 * 定期同義詞維護任務（由 scheduler 呼叫）
 */
async function scheduledSynonymMaintenance() {
    try {
        console.log('[SynonymService] 開始定期同義詞維護...');
        const result = await runSynonymMerge();
        console.log(`[SynonymService] 定期維護完成: 新增 ${result.synonymsAdded} 個同義詞`);
        return result;
    } catch (err) {
        console.error('[SynonymService] 定期維護錯誤:', err);
        return { error: err.message };
    }
}


module.exports = {
    analyzeSpeciesVariants,
    runSynonymMerge,
    searchSpeciesWithSynonyms,
    scheduledSynonymMaintenance,
    // 工具函數（供測試用）
    stringSimilarity,
    normalizeChinese,
    cleanSpeciesName,
};
