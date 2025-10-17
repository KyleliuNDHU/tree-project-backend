const db = require('../config/database');
const fs = require('fs');
const path = require('path');

/**
 * 精確計算特定樹種的碳吸收量
 * @param {Object} req - 請求對象，含樹種名稱或學名
 * @param {Object} res - 響應對象
 */
exports.calculateSpeciesCarbon = async (req, res) => {
  try {
    const { speciesId, speciesName, age, dbh, height } = req.query;
    
    let query = 'SELECT * FROM tree_carbon_data WHERE ';
    let params = [];
    
    if (speciesId) {
      query += 'id = ?';
      params.push(speciesId);
    } else if (speciesName) {
      query += 'common_name_zh LIKE ? OR scientific_name LIKE ?';
      params.push(`%${speciesName}%`, `%${speciesName}%`);
    } else {
      return res.status(400).json({ success: false, message: '請提供樹種ID或樹種名稱' });
    }
    
    const [species] = await db.query(query, params);
    
    if (!species || species.length === 0) {
      return res.status(404).json({ success: false, message: '找不到該樹種' });
    }
    
    const treeData = species[0];
    let carbonAbsorption = 0;
    
    // 計算碳吸收量
    if (dbh && height) {
      // 基於胸徑和樹高計算
      const woodDensity = (treeData.wood_density_min + treeData.wood_density_max) / 2;
      const carbonContent = (treeData.carbon_content_min + treeData.carbon_content_max) / 2;
      
      // 計算樹木體積 (約等於圓柱體體積的70%)
      const radius = dbh / 2 / 100; // 從公分轉換為公尺並求半徑
      const volume = Math.PI * radius * radius * height * 0.7; // 單位：立方公尺
      
      // 計算碳含量
      const carbonWeight = volume * woodDensity * 1000 * carbonContent; // 單位：kg碳
      carbonAbsorption = carbonWeight * 3.67; // 轉換為CO2當量
    } else if (age) {
      // 基於年齡計算
      const minAbsorption = treeData.carbon_absorption_min || 0;
      const maxAbsorption = treeData.carbon_absorption_max || 0;
      const avgYearlyAbsorption = (minAbsorption + maxAbsorption) / 2;
      
      carbonAbsorption = avgYearlyAbsorption * age;
    } else {
      // 返回樹種的年平均碳吸收範圍
      carbonAbsorption = {
        min: treeData.carbon_absorption_min || 0,
        max: treeData.carbon_absorption_max || 0,
        unit: 'kgCO₂/株/年'
      };
    }
    
    return res.json({
      success: true,
      data: {
        species: treeData,
        carbonAbsorption,
        unit: typeof carbonAbsorption === 'object' ? undefined : 'kgCO₂'
      }
    });
  } catch (error) {
    console.error('計算樹種碳吸收量出錯：', error);
    return res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
};

/**
 * 根據樹木數量和年齡計算總碳吸收量
 * @param {Object} req - 請求對象，含樹種ID, 數量和年齡
 * @param {Object} res - 響應對象
 */
exports.calculateTotalCarbon = async (req, res) => {
  try {
    const { trees } = req.body;
    
    if (!trees || !Array.isArray(trees) || trees.length === 0) {
      return res.status(400).json({ success: false, message: '請提供有效的樹木資料' });
    }
    
    let totalCarbonAbsorption = 0;
    const results = [];
    
    for (const tree of trees) {
      const { speciesId, count, age, dbh, height } = tree;
      
      if (!speciesId || !count) {
        continue; // 跳過無效資料
      }
      
      const [species] = await db.query('SELECT * FROM tree_carbon_data WHERE id = ?', [speciesId]);
      
      if (!species || species.length === 0) {
        continue; // 跳過找不到的樹種
      }
      
      const treeData = species[0];
      let carbonAbsorption = 0;
      
      if (dbh && height) {
        // 基於胸徑和樹高計算
        const woodDensity = (treeData.wood_density_min + treeData.wood_density_max) / 2;
        const carbonContent = (treeData.carbon_content_min + treeData.carbon_content_max) / 2;
        
        const radius = dbh / 2 / 100; // 轉換為公尺
        const volume = Math.PI * radius * radius * height * 0.7; // 單位：立方公尺
        
        carbonAbsorption = volume * woodDensity * 1000 * carbonContent * 3.67; // 轉換為CO2當量
      } else if (age) {
        // 基於年齡計算
        const minAbsorption = treeData.carbon_absorption_min || 0;
        const maxAbsorption = treeData.carbon_absorption_max || 0;
        const avgYearlyAbsorption = (minAbsorption + maxAbsorption) / 2;
        
        carbonAbsorption = avgYearlyAbsorption * age;
      }
      
      const treeTotalAbsorption = carbonAbsorption * count;
      totalCarbonAbsorption += treeTotalAbsorption;
      
      results.push({
        species: treeData.common_name_zh,
        count,
        carbonAbsorption,
        totalAbsorption: treeTotalAbsorption
      });
    }
    
    return res.json({
      success: true,
      data: {
        results,
        totalCarbonAbsorption,
        unit: 'kgCO₂'
      }
    });
  } catch (error) {
    console.error('計算總碳吸收量出錯：', error);
    return res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
};

/**
 * 根據地區推薦適合樹種
 * @param {Object} req - 請求對象，含地區選擇
 * @param {Object} res - 響應對象
 */
exports.recommendByRegion = async (req, res) => {
  try {
    const { region, purpose, limit } = req.query;
    
    if (!region) {
      return res.status(400).json({ success: false, message: '請提供地區資訊' });
    }
    
    let query = 'SELECT * FROM tree_carbon_data WHERE ';
    let params = [];
    
    // 地區條件
    switch (region.toLowerCase()) {
      case 'north':
      case 'northern':
      case '北部':
        query += 'north_taiwan = 1';
        break;
      case 'central':
      case '中部':
        query += 'central_taiwan = 1';
        break;
      case 'south':
      case 'southern':
      case '南部':
        query += 'south_taiwan = 1';
        break;
      case 'east':
      case 'eastern':
      case '東部':
        query += 'east_taiwan = 1';
        break;
      case 'coastal':
      case '沿海':
        query += 'coastal_area = 1';
        break;
      case 'mountain':
      case '山區':
        query += 'mountain_area = 1';
        break;
      case 'urban':
      case '都市':
        query += 'urban_area = 1';
        break;
      default:
        return res.status(400).json({ success: false, message: '無效的地區參數' });
    }
    
    // 用途條件
    if (purpose) {
      switch (purpose.toLowerCase()) {
        case 'carbon':
        case '碳吸收':
          query += ' ORDER BY carbon_absorption_max DESC';
          break;
        case 'economic':
        case '經濟':
          query += ' ORDER BY economic_value DESC';
          break;
        case 'ecological':
        case '生態':
          query += ' ORDER BY ecological_value DESC';
          break;
        default:
          query += ' ORDER BY carbon_absorption_max DESC';
      }
    } else {
      query += ' ORDER BY carbon_absorption_max DESC';
    }
    
    // 限制結果數量
    const resultLimit = limit ? parseInt(limit) : 10;
    query += ' LIMIT ?';
    params.push(resultLimit);
    
    const [species] = await db.query(query, params);
    
    if (!species || species.length === 0) {
      return res.status(404).json({ success: false, message: '找不到符合條件的樹種' });
    }
    
    return res.json({
      success: true,
      data: species
    });
  } catch (error) {
    console.error('根據地區推薦樹種出錯：', error);
    return res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
};

/**
 * 依碳吸收效率篩選樹種
 * @param {Object} req - 請求對象，含效率等級
 * @param {Object} res - 響應對象
 */
exports.filterByEfficiency = async (req, res) => {
  try {
    const { efficiency, growthRate, limit } = req.query;
    
    let query = 'SELECT * FROM tree_carbon_data WHERE 1=1';
    let params = [];
    
    // 碳吸收效率條件
    if (efficiency) {
      query += ' AND carbon_efficiency = ?';
      params.push(efficiency);
    }
    
    // 生長速率條件
    if (growthRate) {
      query += ' AND growth_rate = ?';
      params.push(growthRate);
    }
    
    // 排序
    query += ' ORDER BY carbon_absorption_max DESC';
    
    // 限制結果數量
    const resultLimit = limit ? parseInt(limit) : 20;
    query += ' LIMIT ?';
    params.push(resultLimit);
    
    const [species] = await db.query(query, params);
    
    if (!species || species.length === 0) {
      return res.status(404).json({ success: false, message: '找不到符合條件的樹種' });
    }
    
    return res.json({
      success: true,
      data: species
    });
  } catch (error) {
    console.error('依碳吸收效率篩選樹種出錯：', error);
    return res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
};

/**
 * 根據環境條件篩選樹種
 * @param {Object} req - 請求對象，含環境條件
 * @param {Object} res - 響應對象
 */
exports.filterByEnvironment = async (req, res) => {
  try {
    const { 
      droughtTolerance,
      wetTolerance,
      saltTolerance,
      pollutionResistance,
      soilType,
      limit 
    } = req.query;
    
    let query = 'SELECT * FROM tree_carbon_data WHERE 1=1';
    let params = [];
    
    // 環境條件篩選
    if (droughtTolerance) {
      query += ' AND drought_tolerance = ?';
      params.push(droughtTolerance);
    }
    
    if (wetTolerance) {
      query += ' AND wet_tolerance = ?';
      params.push(wetTolerance);
    }
    
    if (saltTolerance) {
      query += ' AND salt_tolerance = ?';
      params.push(saltTolerance);
    }
    
    if (pollutionResistance) {
      query += ' AND pollution_resistance = ?';
      params.push(pollutionResistance);
    }
    
    if (soilType) {
      query += ' AND soil_types LIKE ?';
      params.push(`%${soilType}%`);
    }
    
    // 排序
    query += ' ORDER BY carbon_absorption_max DESC';
    
    // 限制結果數量
    const resultLimit = limit ? parseInt(limit) : 20;
    query += ' LIMIT ?';
    params.push(resultLimit);
    
    const [species] = await db.query(query, params);
    
    if (!species || species.length === 0) {
      return res.status(404).json({ success: false, message: '找不到符合條件的樹種' });
    }
    
    return res.json({
      success: true,
      data: species
    });
  } catch (error) {
    console.error('根據環境條件篩選樹種出錯：', error);
    return res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
};

/**
 * 生成混合造林推薦
 * @param {Object} req - 請求對象，含場地條件和造林目標
 * @param {Object} res - 響應對象
 */
exports.generateMixedForest = async (req, res) => {
  try {
    const { 
      region, 
      area, 
      purpose, 
      environmentalConditions,
      carbonGoal
    } = req.body;
    
    if (!region || !area) {
      return res.status(400).json({ success: false, message: '請提供地區和面積資訊' });
    }
    
    // 先根據地區篩選適合的樹種
    let query = 'SELECT * FROM tree_carbon_data WHERE ';
    let params = [];
    
    // 地區條件
    switch (region.toLowerCase()) {
      case 'north':
      case 'northern':
      case '北部':
        query += 'north_taiwan = 1';
        break;
      case 'central':
      case '中部':
        query += 'central_taiwan = 1';
        break;
      case 'south':
      case 'southern':
      case '南部':
        query += 'south_taiwan = 1';
        break;
      case 'east':
      case 'eastern':
      case '東部':
        query += 'east_taiwan = 1';
        break;
      case 'coastal':
      case '沿海':
        query += 'coastal_area = 1';
        break;
      case 'mountain':
      case '山區':
        query += 'mountain_area = 1';
        break;
      case 'urban':
      case '都市':
        query += 'urban_area = 1';
        break;
      default:
        return res.status(400).json({ success: false, message: '無效的地區參數' });
    }
    
    // 環境條件篩選
    if (environmentalConditions) {
      if (environmentalConditions.droughtTolerance) {
        query += ' AND drought_tolerance = ?';
        params.push(environmentalConditions.droughtTolerance);
      }
      
      if (environmentalConditions.wetTolerance) {
        query += ' AND wet_tolerance = ?';
        params.push(environmentalConditions.wetTolerance);
      }
      
      if (environmentalConditions.saltTolerance) {
        query += ' AND salt_tolerance = ?';
        params.push(environmentalConditions.saltTolerance);
      }
      
      if (environmentalConditions.pollutionResistance) {
        query += ' AND pollution_resistance = ?';
        params.push(environmentalConditions.pollutionResistance);
      }
      
      if (environmentalConditions.soilType) {
        query += ' AND soil_types LIKE ?';
        params.push(`%${environmentalConditions.soilType}%`);
      }
    }
    
    // 用途條件排序
    if (purpose) {
      switch (purpose.toLowerCase()) {
        case 'carbon':
        case '碳吸收':
          query += ' ORDER BY carbon_absorption_max DESC';
          break;
        case 'economic':
        case '經濟':
          query += ' ORDER BY economic_value DESC';
          break;
        case 'ecological':
        case '生態':
          query += ' ORDER BY ecological_value DESC';
          break;
        default:
          query += ' ORDER BY carbon_absorption_max DESC';
      }
    } else {
      query += ' ORDER BY carbon_absorption_max DESC';
    }
    
    // 限制結果數量，為了混合造林，選擇較多樹種
    query += ' LIMIT 15';
    
    const [species] = await db.query(query, params);
    
    if (!species || species.length === 0) {
      return res.status(404).json({ success: false, message: '找不到符合條件的樹種' });
    }
    
    // 生成混合造林方案
    const areaHectares = parseFloat(area); // 面積，單位：公頃
    const totalCarbonAbsorption = carbonGoal ? parseFloat(carbonGoal) : null; // 碳吸收目標，單位：噸CO₂/年
    
    // 樹種分配
    const forestPlan = [];
    let remainingArea = areaHectares;
    let estimatedCarbonAbsorption = 0;
    
    // 主要樹種 (高碳吸收或符合主要目的)
    const mainSpecies = species.slice(0, 3);
    const mainSpeciesAllocation = 0.5; // 主要樹種佔50%面積
    
    for (let i = 0; i < mainSpecies.length; i++) {
      const sp = mainSpecies[i];
      const speciesArea = remainingArea * mainSpeciesAllocation / mainSpecies.length;
      
      // 計算平均每公頃碳吸收量
      const avgHectareAbsorption = (sp.hectare_absorption_min + sp.hectare_absorption_max) / 2;
      
      // 計算理想的株數 (基於理想間距)
      const avgSpacing = (sp.ideal_spacing_min + sp.ideal_spacing_max) / 2 || 5; // 預設5公尺
      const treesPerHectare = 10000 / (avgSpacing * avgSpacing); // 每公頃10000平方公尺
      
      // 該樹種的預估碳吸收量
      const speciesCarbonAbsorption = avgHectareAbsorption * speciesArea;
      estimatedCarbonAbsorption += speciesCarbonAbsorption;
      
      forestPlan.push({
        id: sp.id,
        species: sp.common_name_zh,
        scientificName: sp.scientific_name,
        area: speciesArea,
        percentage: (speciesArea / areaHectares) * 100,
        trees: Math.round(treesPerHectare * speciesArea),
        carbonAbsorption: speciesCarbonAbsorption,
        carbonEfficiency: sp.carbon_efficiency,
        growthRate: sp.growth_rate,
        notes: generatePlantingNotes(sp)
      });
      
      remainingArea -= speciesArea;
    }
    
    // 次要樹種 (混合多樣性提高)
    const secondarySpecies = species.slice(3, 8);
    const secondarySpeciesAllocation = 0.3; // 次要樹種佔30%面積
    
    for (let i = 0; i < secondarySpecies.length; i++) {
      const sp = secondarySpecies[i];
      const speciesArea = remainingArea * secondarySpeciesAllocation / secondarySpecies.length;
      
      // 計算平均每公頃碳吸收量
      const avgHectareAbsorption = (sp.hectare_absorption_min + sp.hectare_absorption_max) / 2;
      
      // 計算理想的株數 (基於理想間距)
      const avgSpacing = (sp.ideal_spacing_min + sp.ideal_spacing_max) / 2 || 5; // 預設5公尺
      const treesPerHectare = 10000 / (avgSpacing * avgSpacing); // 每公頃10000平方公尺
      
      // 該樹種的預估碳吸收量
      const speciesCarbonAbsorption = avgHectareAbsorption * speciesArea;
      estimatedCarbonAbsorption += speciesCarbonAbsorption;
      
      forestPlan.push({
        id: sp.id,
        species: sp.common_name_zh,
        scientificName: sp.scientific_name,
        area: speciesArea,
        percentage: (speciesArea / areaHectares) * 100,
        trees: Math.round(treesPerHectare * speciesArea),
        carbonAbsorption: speciesCarbonAbsorption,
        carbonEfficiency: sp.carbon_efficiency,
        growthRate: sp.growth_rate,
        notes: generatePlantingNotes(sp)
      });
      
      remainingArea -= speciesArea;
    }
    
    // 輔助樹種 (生態功能或美觀)
    const supportSpecies = species.slice(8, 15);
    
    for (let i = 0; i < supportSpecies.length; i++) {
      const sp = supportSpecies[i];
      const speciesArea = remainingArea / supportSpecies.length;
      
      // 計算平均每公頃碳吸收量
      const avgHectareAbsorption = (sp.hectare_absorption_min + sp.hectare_absorption_max) / 2;
      
      // 計算理想的株數 (基於理想間距)
      const avgSpacing = (sp.ideal_spacing_min + sp.ideal_spacing_max) / 2 || 5; // 預設5公尺
      const treesPerHectare = 10000 / (avgSpacing * avgSpacing); // 每公頃10000平方公尺
      
      // 該樹種的預估碳吸收量
      const speciesCarbonAbsorption = avgHectareAbsorption * speciesArea;
      estimatedCarbonAbsorption += speciesCarbonAbsorption;
      
      forestPlan.push({
        id: sp.id,
        species: sp.common_name_zh,
        scientificName: sp.scientific_name,
        area: speciesArea,
        percentage: (speciesArea / areaHectares) * 100,
        trees: Math.round(treesPerHectare * speciesArea),
        carbonAbsorption: speciesCarbonAbsorption,
        carbonEfficiency: sp.carbon_efficiency,
        growthRate: sp.growth_rate,
        notes: generatePlantingNotes(sp)
      });
    }
    
    // 檢查是否達到碳吸收目標
    let meetsCarbonGoal = true;
    let carbonGoalDifference = 0;
    
    if (totalCarbonAbsorption) {
      meetsCarbonGoal = estimatedCarbonAbsorption >= totalCarbonAbsorption;
      carbonGoalDifference = estimatedCarbonAbsorption - totalCarbonAbsorption;
    }
    
    // 生成管理建議
    const managementRecommendations = generateManagementRecommendations(forestPlan, region);
    
    return res.json({
      success: true,
      data: {
        forestPlan,
        summary: {
          totalArea: areaHectares,
          totalTreeCount: forestPlan.reduce((sum, sp) => sum + sp.trees, 0),
          estimatedCarbonAbsorption,
          meetsCarbonGoal,
          carbonGoalDifference,
          unit: '噸CO₂/年'
        },
        managementRecommendations
      }
    });
  } catch (error) {
    console.error('生成混合造林推薦出錯：', error);
    return res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
};

// 生成種植注意事項
function generatePlantingNotes(species) {
  const notes = [];
  
  // 種植間距
  if (species.ideal_spacing_min && species.ideal_spacing_max) {
    notes.push(`建議種植間距：${species.ideal_spacing_min}-${species.ideal_spacing_max}公尺`);
  }
  
  // 管理方式
  if (species.management_approach) {
    notes.push(`管理方式：${species.management_approach}`);
  }
  
  // 提高碳吸收的措施
  if (species.carbon_enhancement) {
    notes.push(`提高碳吸收：${species.carbon_enhancement}`);
  }
  
  // 修剪時機
  if (species.pruning_time) {
    notes.push(`修剪時機：${species.pruning_time}`);
  }
  
  return notes.join('；');
}

// 生成管理建議
function generateManagementRecommendations(forestPlan, region) {
  const recommendations = [];
  
  // 快、中、慢生長樹種統計
  const fastGrowingSpecies = forestPlan.filter(sp => sp.growthRate === '極快' || sp.growthRate === '快');
  const mediumGrowingSpecies = forestPlan.filter(sp => sp.growthRate === '中快' || sp.growthRate === '中等');
  const slowGrowingSpecies = forestPlan.filter(sp => sp.growthRate === '中慢' || sp.growthRate === '慢');
  
  // 早期管理
  recommendations.push({
    phase: '早期管理（1-3年）',
    recommendations: [
      '確保所有新植樹木有良好的灌溉和養護，尤其是在夏季',
      '監控和控制雜草競爭，特別是在快速生長樹種周圍',
      '檢查和調整支撐系統，確保樹木能夠抵抗風力',
      '補植任何失敗或健康狀況不佳的樹木'
    ]
  });
  
  // 中期管理
  const mediumTermRecs = [
    '逐步減少灌溉，鼓勵樹木發展深層根系',
    '監控樹冠競爭，必要時進行選擇性疏伐',
    '開始對快速生長樹種進行選擇性修剪'
  ];
  
  // 針對特定地區的建議
  if (region.toLowerCase().includes('沿海') || region.toLowerCase().includes('coastal')) {
    mediumTermRecs.push('加強監測鹽害和風害，必要時提供額外保護');
  }
  
  if (region.toLowerCase().includes('山區') || region.toLowerCase().includes('mountain')) {
    mediumTermRecs.push('監控水土保持情況，必要時加強坡地保護措施');
  }
  
  recommendations.push({
    phase: '中期管理（4-10年）',
    recommendations: mediumTermRecs
  });
  
  // 長期管理
  const longTermRecs = [
    '實施選擇性伐採，優先考慮快速生長樹種',
    '鼓勵天然更新，尤其是本土樹種',
    '監控森林健康，預防病蟲害',
    '定期評估碳吸收成效，調整管理策略'
  ];
  
  if (fastGrowingSpecies.length > 0) {
    longTermRecs.push(`考慮對快速生長樹種（如${fastGrowingSpecies.map(sp => sp.species).join('、')}）進行循環採伐，促進最大碳吸收`);
  }
  
  if (slowGrowingSpecies.length > 0) {
    longTermRecs.push(`保護慢速生長樹種（如${slowGrowingSpecies.map(sp => sp.species).join('、')}）作為長期碳匯貯存`);
  }
  
  recommendations.push({
    phase: '長期管理（10年以上）',
    recommendations: longTermRecs
  });
  
  return recommendations;
}

/**
 * 獲取樹種資料
 * @param {Object} req - 請求對象
 * @param {Object} res - 響應對象
 */
exports.getTreeSpecies = async (req, res) => {
  try {
    // 從本地JSON文件讀取樹種數據
    const treeDataPath = path.join(__dirname, '../data/tree_species.json');
    
    if (fs.existsSync(treeDataPath)) {
      const treeData = JSON.parse(fs.readFileSync(treeDataPath, 'utf8'));
      
      return res.json({
        success: true,
        data: treeData
      });
    } else {
      // 如果本地文件不存在，則從數據庫獲取數據
      const [treeSpecies] = await db.query('SELECT * FROM tree_species');
      
      if (!treeSpecies || treeSpecies.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: '找不到樹種數據' 
        });
      }
      
      // 將數據轉換為前端需要的格式
      const formattedData = treeSpecies.map(species => ({
        id: species.id.toString(),
        name: species.common_name_zh,
        carbonEfficiency: parseFloat(species.carbon_efficiency || 5.0),
        soilType: species.soil_preferred || '壤土',
        sunExposure: species.sun_preferred || '全日照',
        minTemperature: parseFloat(species.min_temperature || 10.0),
        maxTemperature: parseFloat(species.max_temperature || 35.0),
        suitableRegions: _getRegionsFromSpecies(species),
        description: species.description || `${species.common_name_zh}是台灣常見樹種。`
      }));
      
      return res.json({
        success: true,
        data: formattedData
      });
    }
  } catch (error) {
    console.error('獲取樹種數據出錯：', error);
    return res.status(500).json({ 
      success: false, 
      message: '伺服器錯誤，無法獲取樹種數據' 
    });
  }
};

// 輔助函數 - 從樹種數據中獲取適合地區列表
function _getRegionsFromSpecies(species) {
  const regions = [];
  
  if (species.north_taiwan === 1) regions.push('北部');
  if (species.central_taiwan === 1) regions.push('中部');
  if (species.south_taiwan === 1) regions.push('南部');
  if (species.east_taiwan === 1) regions.push('東部');
  if (species.coastal_area === 1) regions.push('離島');
  
  // 如果沒有指定地區，默認為全台適合
  if (regions.length === 0) {
    regions.push('北部', '中部', '南部', '東部');
  }
  
  return regions;
} 