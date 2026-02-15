/**
 * 樹種辨識服務
 * 整合 Pl@ntNet、GBIF、iNaturalist 等開源 API
 */

const axios = require('axios');
const FormData = require('form-data');

// API 設定
const PLANTNET_API_URL = 'https://my-api.plantnet.org/v2/identify/all';
const GBIF_API_URL = 'https://api.gbif.org/v1';
const INATURALIST_API_URL = 'https://api.inaturalist.org/v1';

// 從環境變數讀取 API Key
const PLANTNET_API_KEY = process.env.PLANTNET_API_KEY || '';

/**
 * 使用 Pl@ntNet API 辨識植物圖片
 * @param {Buffer} imageBuffer - 圖片的 Buffer
 * @param {string} organ - 器官類型: leaf, flower, fruit, bark, auto
 * @param {string} lang - 語言: zh, en, etc.
 * @returns {Promise<Object>} 辨識結果
 */
async function identifyWithPlantNet(imageBuffer, organ = 'auto', lang = 'zh') {
    if (!PLANTNET_API_KEY) {
        throw new Error('Pl@ntNet API Key 未設定，請在環境變數中設定 PLANTNET_API_KEY');
    }

    try {
        const formData = new FormData();
        formData.append('images', imageBuffer, {
            filename: 'plant.jpg',
            contentType: 'image/jpeg'
        });
        formData.append('organs', organ);

        const response = await axios.post(
            `${PLANTNET_API_URL}?api-key=${PLANTNET_API_KEY}&lang=${lang}&include-related-images=true`,
            formData,
            {
                headers: {
                    ...formData.getHeaders()
                },
                timeout: 30000
            }
        );

        // 處理回應
        const results = response.data.results || [];
        return {
            success: true,
            source: 'plantnet',
            remainingRequests: response.data.remainingIdentificationRequests,
            results: results.slice(0, 5).map(result => ({
                score: result.score,
                scientificName: result.species?.scientificNameWithoutAuthor || '',
                author: result.species?.scientificNameAuthorship || '',
                commonNames: result.species?.commonNames || [],
                family: result.species?.family?.scientificNameWithoutAuthor || '',
                genus: result.species?.genus?.scientificNameWithoutAuthor || '',
                gbifId: result.gbif?.id || null,
                images: result.images?.slice(0, 3).map(img => ({
                    url: img.url?.m || img.url?.s || '',
                    organ: img.organ,
                    author: img.author,
                    license: img.license
                })) || []
            }))
        };
    } catch (error) {
        console.error('Pl@ntNet API 錯誤:', error.response?.data || error.message);
        
        // 處理特定錯誤
        if (error.response?.status === 404) {
            return {
                success: false,
                source: 'plantnet',
                error: '無法辨識此植物，請嘗試上傳更清晰的照片',
                results: []
            };
        }
        
        if (error.response?.status === 429) {
            return {
                success: false,
                source: 'plantnet',
                error: '今日免費額度已用完 (500次/天)',
                results: []
            };
        }

        throw error;
    }
}

/**
 * 使用 GBIF API 查詢物種資訊
 * @param {string} scientificName - 學名
 * @returns {Promise<Object>} 物種資訊
 */
async function getSpeciesFromGBIF(scientificName) {
    try {
        // 先做名稱匹配
        const matchResponse = await axios.get(`${GBIF_API_URL}/species/match`, {
            params: {
                name: scientificName,
                verbose: true
            },
            timeout: 10000
        });

        const match = matchResponse.data;
        
        if (match.matchType === 'NONE' || !match.usageKey) {
            return {
                success: false,
                source: 'gbif',
                error: '找不到此物種',
                data: null
            };
        }

        // 取得詳細資訊
        const speciesResponse = await axios.get(`${GBIF_API_URL}/species/${match.usageKey}`, {
            timeout: 10000
        });

        const species = speciesResponse.data;

        // 取得台灣分布資料
        const occurrenceResponse = await axios.get(`${GBIF_API_URL}/occurrence/search`, {
            params: {
                taxonKey: match.usageKey,
                country: 'TW',
                limit: 0
            },
            timeout: 10000
        });

        return {
            success: true,
            source: 'gbif',
            data: {
                gbifKey: species.key,
                scientificName: species.scientificName,
                canonicalName: species.canonicalName,
                authorship: species.authorship,
                rank: species.rank,
                kingdom: species.kingdom,
                phylum: species.phylum,
                class: species.class,
                order: species.order,
                family: species.family,
                genus: species.genus,
                species: species.species,
                vernacularNames: match.alternatives?.map(a => a.vernacularName).filter(Boolean) || [],
                taxonomicStatus: species.taxonomicStatus,
                taiwanOccurrences: occurrenceResponse.data.count || 0,
                gbifUrl: `https://www.gbif.org/species/${species.key}`
            }
        };
    } catch (error) {
        console.error('GBIF API 錯誤:', error.message);
        return {
            success: false,
            source: 'gbif',
            error: error.message,
            data: null
        };
    }
}

/**
 * 使用 iNaturalist API 搜尋物種
 * @param {string} query - 搜尋關鍵字
 * @returns {Promise<Object>} 搜尋結果
 */
async function searchSpeciesFromINaturalist(query) {
    try {
        const response = await axios.get(`${INATURALIST_API_URL}/taxa/autocomplete`, {
            params: {
                q: query,
                locale: 'zh-TW',
                per_page: 10,
                is_active: true
            },
            timeout: 10000
        });

        const results = response.data.results || [];

        return {
            success: true,
            source: 'inaturalist',
            results: results.map(taxon => ({
                id: taxon.id,
                name: taxon.name,
                preferredCommonName: taxon.preferred_common_name,
                matchedTerm: taxon.matched_term,
                rank: taxon.rank,
                rankLevel: taxon.rank_level,
                iconicTaxonName: taxon.iconic_taxon_name,
                defaultPhoto: taxon.default_photo ? {
                    squareUrl: taxon.default_photo.square_url,
                    mediumUrl: taxon.default_photo.medium_url,
                    attribution: taxon.default_photo.attribution
                } : null,
                wikipediaSummary: taxon.wikipedia_summary,
                observationsCount: taxon.observations_count,
                inatUrl: `https://www.inaturalist.org/taxa/${taxon.id}`
            }))
        };
    } catch (error) {
        console.error('iNaturalist API 錯誤:', error.message);
        return {
            success: false,
            source: 'inaturalist',
            error: error.message,
            results: []
        };
    }
}

/**
 * 取得 iNaturalist 物種詳細資訊
 * @param {number} taxonId - iNaturalist 物種 ID
 * @returns {Promise<Object>} 物種詳細資訊
 */
async function getSpeciesDetailFromINaturalist(taxonId) {
    try {
        const response = await axios.get(`${INATURALIST_API_URL}/taxa/${taxonId}`, {
            params: {
                locale: 'zh-TW'
            },
            timeout: 10000
        });

        const taxon = response.data.results?.[0];
        if (!taxon) {
            return {
                success: false,
                source: 'inaturalist',
                error: '找不到此物種',
                data: null
            };
        }

        return {
            success: true,
            source: 'inaturalist',
            data: {
                id: taxon.id,
                name: taxon.name,
                preferredCommonName: taxon.preferred_common_name,
                rank: taxon.rank,
                ancestry: taxon.ancestry,
                ancestors: taxon.ancestors?.map(a => ({
                    id: a.id,
                    name: a.name,
                    rank: a.rank,
                    preferredCommonName: a.preferred_common_name
                })) || [],
                defaultPhoto: taxon.default_photo ? {
                    mediumUrl: taxon.default_photo.medium_url,
                    largeUrl: taxon.default_photo.large_url,
                    attribution: taxon.default_photo.attribution
                } : null,
                wikipediaSummary: taxon.wikipedia_summary,
                wikipediaUrl: taxon.wikipedia_url,
                observationsCount: taxon.observations_count,
                conservationStatus: taxon.conservation_status,
                inatUrl: `https://www.inaturalist.org/taxa/${taxon.id}`
            }
        };
    } catch (error) {
        console.error('iNaturalist API 錯誤:', error.message);
        return {
            success: false,
            source: 'inaturalist',
            error: error.message,
            data: null
        };
    }
}

/**
 * 比對本地樹種資料庫（DB + JSON + 同義詞）
 * @param {string} scientificName - 學名
 * @param {Array<string>} commonNames - 常用名稱列表
 * @returns {Object|null} 匹配的本地樹種資料
 */
async function matchLocalSpecies(scientificName, commonNames = []) {
    try {
        // 1. 先從 DB 搜尋（含同義詞）
        const db = require('../config/db');
        
        // 用學名匹配
        if (scientificName) {
            const { rows } = await db.query(
                'SELECT id, name, scientific_name FROM tree_species WHERE LOWER(scientific_name) = LOWER($1)',
                [scientificName]
            );
            if (rows.length > 0) return { id: rows[0].id, name: rows[0].name, scientificName: rows[0].scientific_name, source: 'db_sciname' };
        }

        // 用中文名匹配
        for (const name of commonNames) {
            const { rows } = await db.query(
                'SELECT id, name, scientific_name FROM tree_species WHERE name = $1',
                [name]
            );
            if (rows.length > 0) return { id: rows[0].id, name: rows[0].name, scientificName: rows[0].scientific_name, source: 'db_name' };
        }

        // 3. 從同義詞表匹配
        for (const name of commonNames) {
            try {
                const { rows } = await db.query(`
                    SELECT ts.id, ts.name, ts.scientific_name, ss.variant_name
                    FROM species_synonyms ss
                    JOIN tree_species ts ON ss.canonical_species_id = ts.id
                    WHERE ss.variant_name = $1
                `, [name]);
                if (rows.length > 0) return { id: rows[0].id, name: rows[0].name, scientificName: rows[0].scientific_name, source: 'synonym', matchedVariant: rows[0].variant_name };
            } catch (e) {
                // species_synonyms 表可能不存在
                if (e.code !== '42P01') console.error('同義詞匹配錯誤:', e.message);
            }
        }

        // 4. Fallback to JSON file (模糊匹配)
        const fs = require('fs');
        const path = require('path');
        const speciesData = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../data/tree_species.json'), 'utf8')
        );

        for (const name of commonNames) {
            const match = speciesData.find(s => 
                s.name === name || 
                s.name.includes(name) || 
                name.includes(s.name)
            );
            if (match) return { ...match, source: 'json' };
        }

        if (scientificName) {
            const match = speciesData.find(s => 
                s.scientificName?.toLowerCase() === scientificName.toLowerCase()
            );
            if (match) return { ...match, source: 'json_sciname' };
        }

        return null;
    } catch (error) {
        console.error('本地資料庫匹配錯誤:', error.message);
        return null;
    }
}

/**
 * 綜合辨識服務 - 整合多個來源
 * @param {Buffer} imageBuffer - 圖片 Buffer
 * @param {Object} options - 選項
 * @returns {Promise<Object>} 綜合辨識結果
 */
async function identifySpecies(imageBuffer, options = {}) {
    const { organ = 'auto', lang = 'zh', enrichWithGBIF = true } = options;

    const result = {
        success: false,
        primaryResult: null,
        allResults: [],
        gbifData: null,
        localMatch: null,
        sources: []
    };

    // 1. 使用 Pl@ntNet 進行主要辨識
    try {
        const plantnetResult = await identifyWithPlantNet(imageBuffer, organ, lang);
        result.sources.push('plantnet');
        
        if (plantnetResult.success && plantnetResult.results.length > 0) {
            result.success = true;
            result.primaryResult = plantnetResult.results[0];
            result.allResults = plantnetResult.results;
            result.remainingRequests = plantnetResult.remainingRequests;

            // 2. 用 GBIF 驗證並豐富資料
            if (enrichWithGBIF && result.primaryResult.scientificName) {
                const gbifResult = await getSpeciesFromGBIF(result.primaryResult.scientificName);
                if (gbifResult.success) {
                    result.gbifData = gbifResult.data;
                    result.sources.push('gbif');
                }
            }

            // 3. 比對本地資料庫（含 DB + 同義詞）
            const localMatch = await matchLocalSpecies(
                result.primaryResult.scientificName,
                result.primaryResult.commonNames
            );
            if (localMatch) {
                result.localMatch = localMatch;
                result.sources.push('local');
            }
        } else {
            result.error = plantnetResult.error || '無法辨識此植物';
        }
    } catch (error) {
        console.error('辨識服務錯誤:', error.message);
        result.error = error.message;
    }

    return result;
}

module.exports = {
    identifyWithPlantNet,
    getSpeciesFromGBIF,
    searchSpeciesFromINaturalist,
    getSpeciesDetailFromINaturalist,
    matchLocalSpecies,
    identifySpecies
};
