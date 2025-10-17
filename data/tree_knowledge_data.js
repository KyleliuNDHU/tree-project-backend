/**
 * 樹木知識資料 - 用於填充 tree_knowledge_embeddings 表
 * 提供基本的樹木種類、碳吸存特性等資訊
 */

const treeKnowledgeData = [
  {
    "id": 1,
    "source_type": "tree_species",
    "source_id": "001",
    "summary_cn": "台灣欒樹是台灣常見的原生樹種，屬無患子科欒樹屬。特點是生長迅速，適應性強，一年四季景色各異。平均年碳吸存量約為15-20公斤，是常用的行道樹及園景樹種。",
    "summary_en": "Taiwan Golden-rain Tree is a common native species in Taiwan, belonging to the Koelreuteria genus of the Sapindaceae family. It grows rapidly, has high adaptability, and displays different scenery in four seasons. The average annual carbon sequestration is about 15-20 kg, and it is a commonly used street and garden tree species."
  },
  {
    "id": 2,
    "source_type": "tree_species",
    "source_id": "003",
    "summary_cn": "樟樹是台灣重要的原生樹種，屬樟科。木材可提煉樟腦，具防蟲功效。樟樹樹齡長，可活數百年，碳吸存效率高，平均年碳吸存量約25-30公斤，是優良的碳匯樹種。",
    "summary_en": "Camphor tree is an important native species in Taiwan, belonging to the Lauraceae family. The wood can be distilled to extract camphor, which has insect-repellent effects. Camphor trees have long lifespans of hundreds of years and high carbon sequestration efficiency with an average annual carbon absorption of 25-30 kg, making them excellent carbon sink species."
  },
  {
    "id": 3,
    "source_type": "tree_species",
    "source_id": "004",
    "summary_cn": "榕樹是台灣常見的樹種，為桑科榕屬，具有明顯的氣生根。樹冠廣闊，提供良好遮蔭，且適應性強。年碳吸存量約20-25公斤，適合作為公園綠化和廟宇保護樹。",
    "summary_en": "Banyan tree is a common species in Taiwan, belonging to the Ficus genus of the Moraceae family, with prominent aerial roots. It has a broad canopy providing good shade and high adaptability. The annual carbon sequestration is about 20-25 kg, making it suitable for park landscaping and as temple guardian trees."
  },
  {
    "id": 4,
    "source_type": "tree_species",
    "source_id": "005",
    "summary_cn": "楓香是台灣高海拔地區常見的落葉喬木，屬楓香科。秋季葉片轉紅，景觀價值高。生長中等速度，年碳吸存量約18-22公斤，同時具水土保持功能，適合山區造林。",
    "summary_en": "Sweet gum is a common deciduous tree in high-altitude areas of Taiwan, belonging to the Altingiaceae family. Leaves turn red in autumn, providing high landscape value. It grows at a moderate speed with an annual carbon sequestration of about 18-22 kg, and also has soil and water conservation functions, making it suitable for mountain afforestation."
  },
  {
    "id": 5,
    "source_type": "custom",
    "source_id": "carbon_seq_basics",
    "summary_cn": "樹木碳吸存是指樹木通過光合作用吸收大氣中的二氧化碳並固定為有機碳的過程。成熟樹木的碳吸存能力通常與其大小、樹種、年齡和生長環境有關。一般而言，胸徑越大、生長速度越快的樹木，年碳吸存量越高。",
    "summary_en": "Tree carbon sequestration refers to the process by which trees absorb carbon dioxide from the atmosphere through photosynthesis and fix it as organic carbon. The carbon sequestration capacity of mature trees is usually related to their size, species, age, and growing environment. Generally, trees with larger diameter at breast height (DBH) and faster growth rates have higher annual carbon sequestration."
  },
  {
    "id": 6,
    "source_type": "custom",
    "source_id": "dbh_calculation",
    "summary_cn": "計算樹木碳儲存量常用的方法是通過測量胸徑（DBH，breast height diameter）。胸徑是指離地面1.3米處樹幹的直徑。一般公式為：碳儲存量(kg) = a × (DBH)^b，其中a和b是與樹種相關的常數。例如，常用的公式之一是：碳儲存量(kg) = 0.25 × (DBH)^2.5。",
    "summary_en": "A common method for calculating tree carbon storage is by measuring the diameter at breast height (DBH). DBH refers to the trunk diameter at 1.3 meters above the ground. The general formula is: Carbon storage (kg) = a × (DBH)^b, where a and b are constants related to the tree species. For example, one commonly used formula is: Carbon storage (kg) = 0.25 × (DBH)^2.5."
  },
  {
    "id": 7,
    "source_type": "custom",
    "source_id": "carbon_sink_forest",
    "summary_cn": "混合林比單一樹種林具有更好的生態系統穩定性和更高的碳匯效率。在設計碳匯林時，應考慮不同樹種的互補性、生長速度差異和抗病蟲害能力。理想的混合林應包含速生樹種（如台灣欒樹）和壽命長的大型樹種（如樟樹）的組合。",
    "summary_en": "Mixed forests have better ecosystem stability and higher carbon sink efficiency than single-species forests. When designing carbon sink forests, the complementarity of different tree species, growth rate differences, and pest resistance capabilities should be considered. Ideal mixed forests should include a combination of fast-growing species (such as Taiwan Golden-rain Tree) and long-lived large species (such as Camphor trees)."
  },
  {
    "id": 8,
    "source_type": "custom",
    "source_id": "climate_change_impact",
    "summary_cn": "氣候變遷會影響樹木的生長和碳吸存能力。溫度升高可能延長某些樹種的生長季，但也可能增加乾旱和病蟲害風險。未來森林管理應考慮選擇具氣候適應性的樹種，並進行多樣化種植以降低風險。",
    "summary_en": "Climate change affects tree growth and carbon sequestration capacity. Rising temperatures may extend the growing season for some species but may also increase the risk of drought and pests. Future forest management should consider selecting climate-adaptive species and implementing diversified planting to reduce risks."
  },
  {
    "id": 9,
    "source_type": "custom",
    "source_id": "urban_trees_benefits",
    "summary_cn": "都市樹木除了碳吸存外，還提供空氣淨化、隔熱降溫、噪音減緩等多重生態系統服務。研究顯示，都市地區的大型樹木每年可為周邊建築節省10-15%的能源消耗，同時減少熱島效應。",
    "summary_en": "Urban trees provide multiple ecosystem services beyond carbon sequestration, including air purification, heat insulation, temperature reduction, and noise mitigation. Studies show that large trees in urban areas can save 10-15% of energy consumption for surrounding buildings annually while reducing the heat island effect."
  },
  {
    "id": 10,
    "source_type": "custom",
    "source_id": "tree_management_tips",
    "summary_cn": "樹木管理的最佳實踐包括：1)定期健康檢查和修剪；2)合理施肥和灌溉；3)保護樹根區域避免土壤緊實化；4)預防和控制病蟲害；5)在極端天氣事件前進行預防性修剪。良好的管理可延長樹木壽命並最大化碳吸存效益。",
    "summary_en": "Best practices for tree management include: 1) Regular health checks and pruning; 2) Proper fertilization and irrigation; 3) Protection of root zones to avoid soil compaction; 4) Prevention and control of pests and diseases; 5) Preventive pruning before extreme weather events. Good management can extend tree lifespan and maximize carbon sequestration benefits."
  },
  {
    "id": 11,
    "source_type": "tree_species",
    "source_id": "1",
    "summary_cn": "榕樹是一種適合在台灣北部、中部、南部、東部地區種植的樹木，碳吸存效率指數為7.5，適合生長在沙質壤土，耐受溫度範圍約15°C至35°C。榕樹是台灣常見的大型常綠喬木，生命力強韌，適合作為城市綠化樹種。",
    "summary_en": "榕樹 is a tree species suitable for planting in 北部, 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 7.5, grows well in 沙質壤土, and can tolerate temperatures from 15°C to 35°C. 榕樹是台灣常見的大型常綠喬木，生命力強韌，適合作為城市綠化樹種。"
  },
  {
    "id": 12,
    "source_type": "tree_species",
    "source_id": "2",
    "summary_cn": "小葉欖仁是一種適合在台灣中部、南部、東部、離島地區種植的樹木，碳吸存效率指數為8.2，適合生長在沙質土，耐受溫度範圍約18°C至38°C。小葉欖仁是台灣沿海地區常見樹種，耐鹽性高，適合濱海造林。",
    "summary_en": "小葉欖仁 is a tree species suitable for planting in 中部, 南部, 東部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 8.2, grows well in 沙質土, and can tolerate temperatures from 18°C to 38°C. 小葉欖仁是台灣沿海地區常見樹種，耐鹽性高，適合濱海造林。"
  },
  {
    "id": 13,
    "source_type": "tree_species",
    "source_id": "3",
    "summary_cn": "樟樹是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為6.8，適合生長在壤土，耐受溫度範圍約12°C至32°C。樟樹是台灣重要的原生樹種，木材珍貴，碳匯效果良好。",
    "summary_en": "樟樹 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6.8, grows well in 壤土, and can tolerate temperatures from 12°C to 32°C. 樟樹是台灣重要的原生樹種，木材珍貴，碳匯效果良好。"
  },
  {
    "id": 14,
    "source_type": "tree_species",
    "source_id": "4",
    "summary_cn": "白千層是一種適合在台灣中部、南部、離島地區種植的樹木，碳吸存效率指數為9，適合生長在沙質土，耐受溫度範圍約16°C至36°C。白千層生長快速，耐鹽耐溼，是優良的造林樹種。",
    "summary_en": "白千層 is a tree species suitable for planting in 中部, 南部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 9, grows well in 沙質土, and can tolerate temperatures from 16°C to 36°C. 白千層生長快速，耐鹽耐溼，是優良的造林樹種。"
  },
  {
    "id": 15,
    "source_type": "tree_species",
    "source_id": "5",
    "summary_cn": "鳳凰木是一種適合在台灣中部、南部地區種植的樹木，碳吸存效率指數為6.5，適合生長在沙質壤土，耐受溫度範圍約18°C至38°C。鳳凰木是台灣常見的行道樹，開花美麗，提供良好遮蔭效果。",
    "summary_en": "鳳凰木 is a tree species suitable for planting in 中部, 南部 regions of Taiwan, with a carbon sequestration efficiency index of 6.5, grows well in 沙質壤土, and can tolerate temperatures from 18°C to 38°C. 鳳凰木是台灣常見的行道樹，開花美麗，提供良好遮蔭效果。"
  },
  {
    "id": 16,
    "source_type": "tree_species",
    "source_id": "6",
    "summary_cn": "臺灣欒樹是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為5.2，適合生長在壤土，耐受溫度範圍約10°C至30°C。臺灣欒樹是優良的本土樹種，四季變化明顯，是台灣重要的行道樹。",
    "summary_en": "臺灣欒樹 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.2, grows well in 壤土, and can tolerate temperatures from 10°C to 30°C. 臺灣欒樹是優良的本土樹種，四季變化明顯，是台灣重要的行道樹。"
  },
  {
    "id": 17,
    "source_type": "tree_species",
    "source_id": "7",
    "summary_cn": "羅漢松是一種適合在台灣北部、東部地區種植的樹木，碳吸存效率指數為4.5，適合生長在酸性土，耐受溫度範圍約8°C至28°C。羅漢松是常綠針葉樹，生長緩慢但壽命長，是重要的園藝樹種。",
    "summary_en": "羅漢松 is a tree species suitable for planting in 北部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 4.5, grows well in 酸性土, and can tolerate temperatures from 8°C to 28°C. 羅漢松是常綠針葉樹，生長緩慢但壽命長，是重要的園藝樹種。"
  },
  {
    "id": 18,
    "source_type": "tree_species",
    "source_id": "8",
    "summary_cn": "構樹是一種適合在台灣北部、中部、南部、東部地區種植的樹木，碳吸存效率指數為8.8，適合生長在壤土，耐受溫度範圍約12°C至35°C。構樹是台灣常見的先驅樹種，生長快速，適合水土保持與荒地復育。",
    "summary_en": "構樹 is a tree species suitable for planting in 北部, 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 8.8, grows well in 壤土, and can tolerate temperatures from 12°C to 35°C. 構樹是台灣常見的先驅樹種，生長快速，適合水土保持與荒地復育。"
  },
  {
    "id": 19,
    "source_type": "tree_species",
    "source_id": "9",
    "summary_cn": "黑板樹是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為7，適合生長在壤土，耐受溫度範圍約15°C至35°C。黑板樹是熱帶樹種，生長快速，曾廣泛用於校園綠化。",
    "summary_en": "黑板樹 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 7, grows well in 壤土, and can tolerate temperatures from 15°C to 35°C. 黑板樹是熱帶樹種，生長快速，曾廣泛用於校園綠化。"
  },
  {
    "id": 20,
    "source_type": "tree_species",
    "source_id": "10",
    "summary_cn": "銀合歡是一種適合在台灣中部、南部、離島地區種植的樹木，碳吸存效率指數為9.5，適合生長在貧瘠土，耐受溫度範圍約16°C至38°C。銀合歡生長極快，固氮能力強，但需注意其入侵性。",
    "summary_en": "銀合歡 is a tree species suitable for planting in 中部, 南部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 9.5, grows well in 貧瘠土, and can tolerate temperatures from 16°C to 38°C. 銀合歡生長極快，固氮能力強，但需注意其入侵性。"
  },
  {
    "id": 21,
    "source_type": "tree_species",
    "source_id": "11",
    "summary_cn": "欖仁是一種適合在台灣中部、南部、東部、離島地區種植的樹木，碳吸存效率指數為8，適合生長在沙質壤土，耐受溫度範圍約18°C至35°C。欖仁是熱帶及亞熱帶濱海地區常見的大型喬木，碳吸收能力強。",
    "summary_en": "欖仁 is a tree species suitable for planting in 中部, 南部, 東部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 8, grows well in 沙質壤土, and can tolerate temperatures from 18°C to 35°C. 欖仁是熱帶及亞熱帶濱海地區常見的大型喬木，碳吸收能力強。"
  },
  {
    "id": 22,
    "source_type": "tree_species",
    "source_id": "12",
    "summary_cn": "大葉桃花心木是一種適合在台灣中部、南部地區種植的樹木，碳吸存效率指數為7.2，適合生長在壤土，耐受溫度範圍約16°C至32°C。大葉桃花心木是經濟價值高的樹種，木材珍貴，碳匯效益佳。",
    "summary_en": "大葉桃花心木 is a tree species suitable for planting in 中部, 南部 regions of Taiwan, with a carbon sequestration efficiency index of 7.2, grows well in 壤土, and can tolerate temperatures from 16°C to 32°C. 大葉桃花心木是經濟價值高的樹種，木材珍貴，碳匯效益佳。"
  },
  {
    "id": 23,
    "source_type": "tree_species",
    "source_id": "13",
    "summary_cn": "苦楝是一種適合在台灣北部、中部、南部、東部地區種植的樹木，碳吸存效率指數為7.8，適合生長在壤土，耐受溫度範圍約14°C至34°C。苦楝是台灣常見的落葉喬木，生長快速，具有優良生態價值。",
    "summary_en": "苦楝 is a tree species suitable for planting in 北部, 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 7.8, grows well in 壤土, and can tolerate temperatures from 14°C to 34°C. 苦楝是台灣常見的落葉喬木，生長快速，具有優良生態價值。"
  },
  {
    "id": 24,
    "source_type": "tree_species",
    "source_id": "14",
    "summary_cn": "印度橡膠樹是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為6.5，適合生長在壤土，耐受溫度範圍約16°C至32°C。印度橡膠樹是熱帶常綠喬木，樹形優美，適合庭園綠化。",
    "summary_en": "印度橡膠樹 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6.5, grows well in 壤土, and can tolerate temperatures from 16°C to 32°C. 印度橡膠樹是熱帶常綠喬木，樹形優美，適合庭園綠化。"
  },
  {
    "id": 25,
    "source_type": "tree_species",
    "source_id": "15",
    "summary_cn": "赤桉是一種適合在台灣中部、南部、離島地區種植的樹木，碳吸存效率指數為9.8，適合生長在貧瘠土，耐受溫度範圍約15°C至40°C。赤桉生長極快，碳吸收效率極高，但水分消耗大，適合特定區域造林。",
    "summary_en": "赤桉 is a tree species suitable for planting in 中部, 南部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 9.8, grows well in 貧瘠土, and can tolerate temperatures from 15°C to 40°C. 赤桉生長極快，碳吸收效率極高，但水分消耗大，適合特定區域造林。"
  },
  {
    "id": 26,
    "source_type": "tree_species",
    "source_id": "16",
    "summary_cn": "茄苳是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為6.9，適合生長在壤土，耐受溫度範圍約14°C至32°C。茄苳是台灣原生樹種，木材珍貴，適合作為水土保持樹種。",
    "summary_en": "茄苳 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6.9, grows well in 壤土, and can tolerate temperatures from 14°C to 32°C. 茄苳是台灣原生樹種，木材珍貴，適合作為水土保持樹種。"
  },
  {
    "id": 27,
    "source_type": "tree_species",
    "source_id": "17",
    "summary_cn": "楓香是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為5.8，適合生長在壤土，耐受溫度範圍約12°C至30°C。楓香是台灣中高海拔常見落葉樹種，秋季變色美麗，根系發達適合水土保持。",
    "summary_en": "楓香 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.8, grows well in 壤土, and can tolerate temperatures from 12°C to 30°C. 楓香是台灣中高海拔常見落葉樹種，秋季變色美麗，根系發達適合水土保持。"
  },
  {
    "id": 28,
    "source_type": "tree_species",
    "source_id": "18",
    "summary_cn": "黃槿是一種適合在台灣南部、東部、離島地區種植的樹木，碳吸存效率指數為6.2，適合生長在沙質土，耐受溫度範圍約18°C至35°C。黃槿是濱海常見樹種，耐鹽耐旱，適合海岸防護林。",
    "summary_en": "黃槿 is a tree species suitable for planting in 南部, 東部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 6.2, grows well in 沙質土, and can tolerate temperatures from 18°C to 35°C. 黃槿是濱海常見樹種，耐鹽耐旱，適合海岸防護林。"
  },
  {
    "id": 29,
    "source_type": "tree_species",
    "source_id": "19",
    "summary_cn": "蒲葵是一種適合在台灣北部、中部、南部、東部地區種植的樹木，碳吸存效率指數為4.3，適合生長在沙質壤土，耐受溫度範圍約15°C至35°C。蒲葵是台灣常見的棕櫚科植物，具有高觀賞價值和景觀應用。",
    "summary_en": "蒲葵 is a tree species suitable for planting in 北部, 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 4.3, grows well in 沙質壤土, and can tolerate temperatures from 15°C to 35°C. 蒲葵是台灣常見的棕櫚科植物，具有高觀賞價值和景觀應用。"
  },
  {
    "id": 30,
    "source_type": "tree_species",
    "source_id": "20",
    "summary_cn": "流蘇是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為4，適合生長在酸性土，耐受溫度範圍約10°C至28°C。流蘇是台灣原生樹種，春季開花美麗，適合公園和庭園綠化。",
    "summary_en": "流蘇 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 4, grows well in 酸性土, and can tolerate temperatures from 10°C to 28°C. 流蘇是台灣原生樹種，春季開花美麗，適合公園和庭園綠化。"
  },
  {
    "id": 31,
    "source_type": "tree_species",
    "source_id": "21",
    "summary_cn": "木賊葉木麻黃是一種適合在台灣南部、東部、離島地區種植的樹木，碳吸存效率指數為9.2，適合生長在沙質土，耐受溫度範圍約16°C至38°C。木賊葉木麻黃耐鹽耐旱，是海岸防風林的優良樹種。",
    "summary_en": "木賊葉木麻黃 is a tree species suitable for planting in 南部, 東部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 9.2, grows well in 沙質土, and can tolerate temperatures from 16°C to 38°C. 木賊葉木麻黃耐鹽耐旱，是海岸防風林的優良樹種。"
  },
  {
    "id": 32,
    "source_type": "tree_species",
    "source_id": "22",
    "summary_cn": "瓊崖海棠是一種適合在台灣南部、東部、離島地區種植的樹木，碳吸存效率指數為6.7，適合生長在沙質土，耐受溫度範圍約18°C至35°C。瓊崖海棠是濱海樹種，果實具漂浮性，是海島植被擴散的重要樹種。",
    "summary_en": "瓊崖海棠 is a tree species suitable for planting in 南部, 東部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 6.7, grows well in 沙質土, and can tolerate temperatures from 18°C to 35°C. 瓊崖海棠是濱海樹種，果實具漂浮性，是海島植被擴散的重要樹種。"
  },
  {
    "id": 33,
    "source_type": "tree_species",
    "source_id": "23",
    "summary_cn": "白榕是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為7，適合生長在壤土，耐受溫度範圍約16°C至35°C。白榕是熱帶地區常見的常綠榕樹，根系發達，適合城市綠化。",
    "summary_en": "白榕 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 7, grows well in 壤土, and can tolerate temperatures from 16°C to 35°C. 白榕是熱帶地區常見的常綠榕樹，根系發達，適合城市綠化。"
  },
  {
    "id": 34,
    "source_type": "tree_species",
    "source_id": "24",
    "summary_cn": "雞蛋花是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為4.2，適合生長在沙質壤土，耐受溫度範圍約18°C至35°C。雞蛋花是熱帶觀賞樹種，花朵香氣濃郁，適合庭園綠化。",
    "summary_en": "雞蛋花 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 4.2, grows well in 沙質壤土, and can tolerate temperatures from 18°C to 35°C. 雞蛋花是熱帶觀賞樹種，花朵香氣濃郁，適合庭園綠化。"
  },
  {
    "id": 35,
    "source_type": "tree_species",
    "source_id": "25",
    "summary_cn": "龍柏是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為4.5，適合生長在壤土，耐受溫度範圍約12°C至32°C。龍柏是常綠喬木，適合修剪造型，常用於園林綠化。",
    "summary_en": "龍柏 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 4.5, grows well in 壤土, and can tolerate temperatures from 12°C to 32°C. 龍柏是常綠喬木，適合修剪造型，常用於園林綠化。"
  },
  {
    "id": 36,
    "source_type": "tree_species",
    "source_id": "26",
    "summary_cn": "肯氏南洋杉是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為6.8，適合生長在壤土，耐受溫度範圍約15°C至32°C。肯氏南洋杉是高大的常綠針葉樹，樹形優美，適合作為景觀樹種。",
    "summary_en": "肯氏南洋杉 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6.8, grows well in 壤土, and can tolerate temperatures from 15°C to 32°C. 肯氏南洋杉是高大的常綠針葉樹，樹形優美，適合作為景觀樹種。"
  },
  {
    "id": 37,
    "source_type": "tree_species",
    "source_id": "27",
    "summary_cn": "菩提樹是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為7.4，適合生長在壤土，耐受溫度範圍約16°C至35°C。菩提樹是長壽樹種，具有宗教文化意義，樹冠開展適合遮蔭。",
    "summary_en": "菩提樹 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 7.4, grows well in 壤土, and can tolerate temperatures from 16°C to 35°C. 菩提樹是長壽樹種，具有宗教文化意義，樹冠開展適合遮蔭。"
  },
  {
    "id": 38,
    "source_type": "tree_species",
    "source_id": "28",
    "summary_cn": "可可椰子是一種適合在台灣南部、東部、離島地區種植的樹木，碳吸存效率指數為5，適合生長在沙質土，耐受溫度範圍約20°C至35°C。可可椰子是熱帶典型樹種，具有觀賞價值和經濟價值。",
    "summary_en": "可可椰子 is a tree species suitable for planting in 南部, 東部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 5, grows well in 沙質土, and can tolerate temperatures from 20°C to 35°C. 可可椰子是熱帶典型樹種，具有觀賞價值和經濟價值。"
  },
  {
    "id": 39,
    "source_type": "tree_species",
    "source_id": "29",
    "summary_cn": "白水木是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為5.5，適合生長在壤土，耐受溫度範圍約15°C至32°C。白水木是台灣原生樹種，適合次生林復育及混合林營造。",
    "summary_en": "白水木 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.5, grows well in 壤土, and can tolerate temperatures from 15°C to 32°C. 白水木是台灣原生樹種，適合次生林復育及混合林營造。"
  },
  {
    "id": 40,
    "source_type": "tree_species",
    "source_id": "30",
    "summary_cn": "土肉桂是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為6.5，適合生長在酸性土，耐受溫度範圍約12°C至30°C。土肉桂是台灣中低海拔常見樹種，木材可提取精油，具有經濟價值。",
    "summary_en": "土肉桂 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6.5, grows well in 酸性土, and can tolerate temperatures from 12°C to 30°C. 土肉桂是台灣中低海拔常見樹種，木材可提取精油，具有經濟價值。"
  },
  {
    "id": 41,
    "source_type": "tree_species",
    "source_id": "31",
    "summary_cn": "大葉山欖是一種適合在台灣中部、東部地區種植的樹木，碳吸存效率指數為5.8，適合生長在壤土，耐受溫度範圍約14°C至30°C。大葉山欖是台灣重要的原生闊葉樹，是珍貴樹種，適合生態造林。",
    "summary_en": "大葉山欖 is a tree species suitable for planting in 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.8, grows well in 壤土, and can tolerate temperatures from 14°C to 30°C. 大葉山欖是台灣重要的原生闊葉樹，是珍貴樹種，適合生態造林。"
  },
  {
    "id": 42,
    "source_type": "tree_species",
    "source_id": "32",
    "summary_cn": "小葉桃花心木是一種適合在台灣中部、南部地區種植的樹木，碳吸存效率指數為6.8，適合生長在壤土，耐受溫度範圍約18°C至35°C。小葉桃花心木是經濟林樹種，木材價值高，同時具有良好碳匯能力。",
    "summary_en": "小葉桃花心木 is a tree species suitable for planting in 中部, 南部 regions of Taiwan, with a carbon sequestration efficiency index of 6.8, grows well in 壤土, and can tolerate temperatures from 18°C to 35°C. 小葉桃花心木是經濟林樹種，木材價值高，同時具有良好碳匯能力。"
  },
  {
    "id": 43,
    "source_type": "tree_species",
    "source_id": "33",
    "summary_cn": "海檬果是一種適合在台灣南部、東部、離島地區種植的樹木，碳吸存效率指數為5.5，適合生長在沙質土，耐受溫度範圍約20°C至35°C。海檬果是濱海樹種，耐鹽性強，適合海岸線第一道防護林。",
    "summary_en": "海檬果 is a tree species suitable for planting in 南部, 東部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 5.5, grows well in 沙質土, and can tolerate temperatures from 20°C to 35°C. 海檬果是濱海樹種，耐鹽性強，適合海岸線第一道防護林。"
  },
  {
    "id": 44,
    "source_type": "tree_species",
    "source_id": "34",
    "summary_cn": "水黃皮是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為5.2，適合生長在壤土，耐受溫度範圍約15°C至32°C。水黃皮是台灣低海拔地區常見樹種，四季常綠，抗污染能力強。",
    "summary_en": "水黃皮 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.2, grows well in 壤土, and can tolerate temperatures from 15°C to 32°C. 水黃皮是台灣低海拔地區常見樹種，四季常綠，抗污染能力強。"
  },
  {
    "id": 45,
    "source_type": "tree_species",
    "source_id": "35",
    "summary_cn": "洋紅風鈴木是一種適合在台灣中部、南部地區種植的樹木，碳吸存效率指數為6.5，適合生長在壤土，耐受溫度範圍約16°C至35°C。洋紅風鈴木開花美麗，是優良的行道樹和景觀樹種。",
    "summary_en": "洋紅風鈴木 is a tree species suitable for planting in 中部, 南部 regions of Taiwan, with a carbon sequestration efficiency index of 6.5, grows well in 壤土, and can tolerate temperatures from 16°C to 35°C. 洋紅風鈴木開花美麗，是優良的行道樹和景觀樹種。"
  },
  {
    "id": 46,
    "source_type": "tree_species",
    "source_id": "36",
    "summary_cn": "檄樹是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為6.5，適合生長在壤土，耐受溫度範圍約16°C至36°C。檄樹是熱帶樹種，耐旱性強，適合荒地復育和薪炭林。",
    "summary_en": "檄樹 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6.5, grows well in 壤土, and can tolerate temperatures from 16°C to 36°C. 檄樹是熱帶樹種，耐旱性強，適合荒地復育和薪炭林。"
  },
  {
    "id": 47,
    "source_type": "tree_species",
    "source_id": "37",
    "summary_cn": "毛柿是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為5.6，適合生長在壤土，耐受溫度範圍約15°C至32°C。毛柿是熱帶及亞熱帶果樹，既有經濟價值又有碳匯功能。",
    "summary_en": "毛柿 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.6, grows well in 壤土, and can tolerate temperatures from 15°C to 32°C. 毛柿是熱帶及亞熱帶果樹，既有經濟價值又有碳匯功能。"
  },
  {
    "id": 48,
    "source_type": "tree_species",
    "source_id": "38",
    "summary_cn": "鐵色是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為5.5，適合生長在壤土，耐受溫度範圍約16°C至32°C。鐵色是熱帶樹種，木材密度極高，是優質長期碳匯樹種。",
    "summary_en": "鐵色 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.5, grows well in 壤土, and can tolerate temperatures from 16°C to 32°C. 鐵色是熱帶樹種，木材密度極高，是優質長期碳匯樹種。"
  },
  {
    "id": 49,
    "source_type": "tree_species",
    "source_id": "39",
    "summary_cn": "馬拉巴栗是一種適合在台灣中部、南部地區種植的樹木，碳吸存效率指數為6，適合生長在壤土，耐受溫度範圍約18°C至35°C。馬拉巴栗是觀賞樹種，也適合作為園林造景樹種。",
    "summary_en": "馬拉巴栗 is a tree species suitable for planting in 中部, 南部 regions of Taiwan, with a carbon sequestration efficiency index of 6, grows well in 壤土, and can tolerate temperatures from 18°C to 35°C. 馬拉巴栗是觀賞樹種，也適合作為園林造景樹種。"
  },
  {
    "id": 50,
    "source_type": "tree_species",
    "source_id": "40",
    "summary_cn": "金龜樹是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為7.2，適合生長在壤土，耐受溫度範圍約18°C至38°C。金龜樹固氮能力強，適合荒地綠化和土壤改良。",
    "summary_en": "金龜樹 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 7.2, grows well in 壤土, and can tolerate temperatures from 18°C to 38°C. 金龜樹固氮能力強，適合荒地綠化和土壤改良。"
  },
  {
    "id": 51,
    "source_type": "tree_species",
    "source_id": "41",
    "summary_cn": "棋盤腳是一種適合在台灣南部、東部、離島地區種植的樹木，碳吸存效率指數為5.8，適合生長在沙質土，耐受溫度範圍約20°C至35°C。棋盤腳是濱海生態保護樹種，果實可漂浮海上傳播。",
    "summary_en": "棋盤腳 is a tree species suitable for planting in 南部, 東部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 5.8, grows well in 沙質土, and can tolerate temperatures from 20°C to 35°C. 棋盤腳是濱海生態保護樹種，果實可漂浮海上傳播。"
  },
  {
    "id": 52,
    "source_type": "tree_species",
    "source_id": "42",
    "summary_cn": "破布子是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為5.8，適合生長在壤土，耐受溫度範圍約16°C至35°C。破布子是熱帶及亞熱帶果樹，果實可食用，同時也是良好景觀樹。",
    "summary_en": "破布子 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.8, grows well in 壤土, and can tolerate temperatures from 16°C to 35°C. 破布子是熱帶及亞熱帶果樹，果實可食用，同時也是良好景觀樹。"
  },
  {
    "id": 53,
    "source_type": "tree_species",
    "source_id": "43",
    "summary_cn": "大葉合歡是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為8，適合生長在壤土，耐受溫度範圍約16°C至38°C。大葉合歡固氮能力強，生長快速，是理想的綠籬和行道樹。",
    "summary_en": "大葉合歡 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 8, grows well in 壤土, and can tolerate temperatures from 16°C to 38°C. 大葉合歡固氮能力強，生長快速，是理想的綠籬和行道樹。"
  },
  {
    "id": 54,
    "source_type": "tree_species",
    "source_id": "44",
    "summary_cn": "菲島福木是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為5.2，適合生長在壤土，耐受溫度範圍約15°C至32°C。菲島福木是亞熱帶常綠樹種，適合作為景觀樹和生態復育樹種。",
    "summary_en": "菲島福木 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.2, grows well in 壤土, and can tolerate temperatures from 15°C to 32°C. 菲島福木是亞熱帶常綠樹種，適合作為景觀樹和生態復育樹種。"
  },
  {
    "id": 55,
    "source_type": "tree_species",
    "source_id": "45",
    "summary_cn": "楊桃是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為4.8，適合生長在壤土，耐受溫度範圍約18°C至35°C。楊桃是台灣常見果樹，具有經濟價值，也可作為庭園綠化樹種。",
    "summary_en": "楊桃 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 4.8, grows well in 壤土, and can tolerate temperatures from 18°C to 35°C. 楊桃是台灣常見果樹，具有經濟價值，也可作為庭園綠化樹種。"
  },
  {
    "id": 56,
    "source_type": "tree_species",
    "source_id": "46",
    "summary_cn": "芒果樹是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為6.2，適合生長在壤土，耐受溫度範圍約18°C至38°C。芒果樹是熱帶經濟果樹，也具有良好的碳匯能力。",
    "summary_en": "芒果樹 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6.2, grows well in 壤土, and can tolerate temperatures from 18°C to 38°C. 芒果樹是熱帶經濟果樹，也具有良好的碳匯能力。"
  },
  {
    "id": 57,
    "source_type": "tree_species",
    "source_id": "47",
    "summary_cn": "緬梔是一種適合在台灣中部、南部地區種植的樹木，碳吸存效率指數為4，適合生長在沙質壤土，耐受溫度範圍約18°C至35°C。緬梔是觀賞樹種，花朵香氣濃郁，適合熱帶風情景觀營造。",
    "summary_en": "緬梔 is a tree species suitable for planting in 中部, 南部 regions of Taiwan, with a carbon sequestration efficiency index of 4, grows well in 沙質壤土, and can tolerate temperatures from 18°C to 35°C. 緬梔是觀賞樹種，花朵香氣濃郁，適合熱帶風情景觀營造。"
  },
  {
    "id": 58,
    "source_type": "tree_species",
    "source_id": "48",
    "summary_cn": "黃連木是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為5，適合生長在壤土，耐受溫度範圍約10°C至30°C。黃連木是落葉喬木，耐旱性強，秋季紅葉美麗，適合作為行道樹和庭園樹。",
    "summary_en": "黃連木 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5, grows well in 壤土, and can tolerate temperatures from 10°C to 30°C. 黃連木是落葉喬木，耐旱性強，秋季紅葉美麗，適合作為行道樹和庭園樹。"
  },
  {
    "id": 59,
    "source_type": "tree_species",
    "source_id": "49",
    "summary_cn": "潺槁樹是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為6，適合生長在壤土，耐受溫度範圍約15°C至32°C。潺槁樹適應性強，是次生林復育和荒地綠化的理想樹種。",
    "summary_en": "潺槁樹 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6, grows well in 壤土, and can tolerate temperatures from 15°C to 32°C. 潺槁樹適應性強，是次生林復育和荒地綠化的理想樹種。"
  },
  {
    "id": 60,
    "source_type": "tree_species",
    "source_id": "50",
    "summary_cn": "阿勒勃是一種適合在台灣南部、東部、離島地區種植的樹木，碳吸存效率指數為5.5，適合生長在沙質土，耐受溫度範圍約20°C至35°C。阿勒勃是海岸防護林和紅樹林過渡帶樹種，極耐鹽耐溼。",
    "summary_en": "阿勒勃 is a tree species suitable for planting in 南部, 東部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 5.5, grows well in 沙質土, and can tolerate temperatures from 20°C to 35°C. 阿勒勃是海岸防護林和紅樹林過渡帶樹種，極耐鹽耐溼。"
  },
  {
    "id": 61,
    "source_type": "tree_species",
    "source_id": "51",
    "summary_cn": "血桐是一種適合在台灣北部、中部、南部、東部地區種植的樹木，碳吸存效率指數為8.5，適合生長在壤土，耐受溫度範圍約15°C至35°C。血桐是常見先驅樹種，生長極快，適合荒地復育和水土保持。",
    "summary_en": "血桐 is a tree species suitable for planting in 北部, 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 8.5, grows well in 壤土, and can tolerate temperatures from 15°C to 35°C. 血桐是常見先驅樹種，生長極快，適合荒地復育和水土保持。"
  },
  {
    "id": 62,
    "source_type": "tree_species",
    "source_id": "52",
    "summary_cn": "鐵刀木是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為7.6，適合生長在壤土，耐受溫度範圍約16°C至35°C。鐵刀木是熱帶及亞熱帶地區的常綠喬木，木材堅硬，碳匯效果佳。",
    "summary_en": "鐵刀木 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 7.6, grows well in 壤土, and can tolerate temperatures from 16°C to 35°C. 鐵刀木是熱帶及亞熱帶地區的常綠喬木，木材堅硬，碳匯效果佳。"
  },
  {
    "id": 63,
    "source_type": "tree_species",
    "source_id": "53",
    "summary_cn": "無葉檉柳是一種適合在台灣南部、離島地區種植的樹木，碳吸存效率指數為7.8，適合生長在沙質土，耐受溫度範圍約18°C至40°C。無葉檉柳極度耐旱耐鹽，適合乾旱地區和鹽鹼地造林。",
    "summary_en": "無葉檉柳 is a tree species suitable for planting in 南部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 7.8, grows well in 沙質土, and can tolerate temperatures from 18°C to 40°C. 無葉檉柳極度耐旱耐鹽，適合乾旱地區和鹽鹼地造林。"
  },
  {
    "id": 64,
    "source_type": "tree_species",
    "source_id": "54",
    "summary_cn": "巴西乳香是一種適合在台灣中部、南部地區種植的樹木，碳吸存效率指數為6.6，適合生長在壤土，耐受溫度範圍約18°C至35°C。巴西乳香生長快速，木材可提取香料，具有經濟和碳匯雙重價值。",
    "summary_en": "巴西乳香 is a tree species suitable for planting in 中部, 南部 regions of Taiwan, with a carbon sequestration efficiency index of 6.6, grows well in 壤土, and can tolerate temperatures from 18°C to 35°C. 巴西乳香生長快速，木材可提取香料，具有經濟和碳匯雙重價值。"
  },
  {
    "id": 65,
    "source_type": "tree_species",
    "source_id": "55",
    "summary_cn": "小葉南洋杉是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為6.5，適合生長在壤土，耐受溫度範圍約15°C至32°C。小葉南洋杉樹形挺拔優美，是優良的園林景觀樹種。",
    "summary_en": "小葉南洋杉 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6.5, grows well in 壤土, and can tolerate temperatures from 15°C to 32°C. 小葉南洋杉樹形挺拔優美，是優良的園林景觀樹種。"
  },
  {
    "id": 66,
    "source_type": "tree_species",
    "source_id": "56",
    "summary_cn": "雀榕是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為7.2，適合生長在壤土，耐受溫度範圍約16°C至35°C。雀榕是榕樹的一種，樹冠開展，適合作為城市綠化樹種。",
    "summary_en": "雀榕 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 7.2, grows well in 壤土, and can tolerate temperatures from 16°C to 35°C. 雀榕是榕樹的一種，樹冠開展，適合作為城市綠化樹種。"
  },
  {
    "id": 67,
    "source_type": "tree_species",
    "source_id": "57",
    "summary_cn": "人心果是一種適合在台灣中部、南部地區種植的樹木，碳吸存效率指數為6，適合生長在壤土，耐受溫度範圍約18°C至35°C。人心果果實可食，同時是良好的碳匯和庭園綠化樹種。",
    "summary_en": "人心果 is a tree species suitable for planting in 中部, 南部 regions of Taiwan, with a carbon sequestration efficiency index of 6, grows well in 壤土, and can tolerate temperatures from 18°C to 35°C. 人心果果實可食，同時是良好的碳匯和庭園綠化樹種。"
  },
  {
    "id": 68,
    "source_type": "tree_species",
    "source_id": "58",
    "summary_cn": "蘭嶼羅漢松是一種適合在台灣東部、離島地區種植的樹木，碳吸存效率指數為4.2，適合生長在酸性土，耐受溫度範圍約10°C至30°C。蘭嶼羅漢松是台灣特有種，珍貴稀有，具高度保育價值。",
    "summary_en": "蘭嶼羅漢松 is a tree species suitable for planting in 東部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 4.2, grows well in 酸性土, and can tolerate temperatures from 10°C to 30°C. 蘭嶼羅漢松是台灣特有種，珍貴稀有，具高度保育價值。"
  },
  {
    "id": 69,
    "source_type": "tree_species",
    "source_id": "59",
    "summary_cn": "月橘是一種適合在台灣北部、中部、南部、東部地區種植的樹木，碳吸存效率指數為4.5，適合生長在壤土，耐受溫度範圍約12°C至32°C。月橘是常見的觀賞灌木或小喬木，適合庭院綠化和綠籬。",
    "summary_en": "月橘 is a tree species suitable for planting in 北部, 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 4.5, grows well in 壤土, and can tolerate temperatures from 12°C to 32°C. 月橘是常見的觀賞灌木或小喬木，適合庭院綠化和綠籬。"
  },
  {
    "id": 70,
    "source_type": "tree_species",
    "source_id": "60",
    "summary_cn": "釋迦是一種適合在台灣東部、南部地區種植的樹木，碳吸存效率指數為4.2，適合生長在壤土，耐受溫度範圍約18°C至35°C。釋迦是重要的經濟果樹，同時也有一定的碳匯功能。",
    "summary_en": "釋迦 is a tree species suitable for planting in 東部, 南部 regions of Taiwan, with a carbon sequestration efficiency index of 4.2, grows well in 壤土, and can tolerate temperatures from 18°C to 35°C. 釋迦是重要的經濟果樹，同時也有一定的碳匯功能。"
  },
  {
    "id": 71,
    "source_type": "tree_species",
    "source_id": "61",
    "summary_cn": "臺灣櫸是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為6，適合生長在壤土，耐受溫度範圍約12°C至28°C。臺灣櫸是珍貴的原生闊葉樹，木材價值高，適合保育造林。",
    "summary_en": "臺灣櫸 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6, grows well in 壤土, and can tolerate temperatures from 12°C to 28°C. 臺灣櫸是珍貴的原生闊葉樹，木材價值高，適合保育造林。"
  },
  {
    "id": 72,
    "source_type": "tree_species",
    "source_id": "62",
    "summary_cn": "鴨腳木是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為5.5，適合生長在壤土，耐受溫度範圍約15°C至32°C。鴨腳木樹形獨特，適合公園和庭園景觀綠化。",
    "summary_en": "鴨腳木 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.5, grows well in 壤土, and can tolerate temperatures from 15°C to 32°C. 鴨腳木樹形獨特，適合公園和庭園景觀綠化。"
  },
  {
    "id": 73,
    "source_type": "tree_species",
    "source_id": "63",
    "summary_cn": "龍眼是一種適合在台灣北部、中部、南部、東部地區種植的樹木，碳吸存效率指數為5.8，適合生長在壤土，耐受溫度範圍約16°C至35°C。龍眼是重要的經濟果樹，也具有良好的碳匯和綠化效果。",
    "summary_en": "龍眼 is a tree species suitable for planting in 北部, 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.8, grows well in 壤土, and can tolerate temperatures from 16°C to 35°C. 龍眼是重要的經濟果樹，也具有良好的碳匯和綠化效果。"
  },
  {
    "id": 74,
    "source_type": "tree_species",
    "source_id": "64",
    "summary_cn": "蓮霧是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為5，適合生長在壤土，耐受溫度範圍約18°C至35°C。蓮霧是熱帶水果樹，除經濟價值外也有碳匯功能。",
    "summary_en": "蓮霧 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5, grows well in 壤土, and can tolerate temperatures from 18°C to 35°C. 蓮霧是熱帶水果樹，除經濟價值外也有碳匯功能。"
  },
  {
    "id": 75,
    "source_type": "tree_species",
    "source_id": "65",
    "summary_cn": "臺灣胡桃是一種適合在台灣北部、中部、東部地區種植的樹木，碳吸存效率指數為5.6，適合生長在壤土，耐受溫度範圍約12°C至30°C。臺灣胡桃是珍貴的本土樹種，木材價值高，根系發達適合水土保持。",
    "summary_en": "臺灣胡桃 is a tree species suitable for planting in 北部, 中部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5.6, grows well in 壤土, and can tolerate temperatures from 12°C to 30°C. 臺灣胡桃是珍貴的本土樹種，木材價值高，根系發達適合水土保持。"
  },
  {
    "id": 76,
    "source_type": "tree_species",
    "source_id": "66",
    "summary_cn": "中東海棗是一種適合在台灣南部、離島地區種植的樹木，碳吸存效率指數為5.4，適合生長在沙質土，耐受溫度範圍約18°C至40°C。中東海棗極度耐旱，適合乾燥氣候和特殊景觀營造。",
    "summary_en": "中東海棗 is a tree species suitable for planting in 南部, 離島 regions of Taiwan, with a carbon sequestration efficiency index of 5.4, grows well in 沙質土, and can tolerate temperatures from 18°C to 40°C. 中東海棗極度耐旱，適合乾燥氣候和特殊景觀營造。"
  },
  {
    "id": 77,
    "source_type": "tree_species",
    "source_id": "67",
    "summary_cn": "九丁榕是一種適合在台灣中部、南部、東部地區種植的樹木，碳吸存效率指數為7，適合生長在壤土，耐受溫度範圍約16°C至35°C。九丁榕抗污染能力強，適合城市環境綠化和碳匯。",
    "summary_en": "九丁榕 is a tree species suitable for planting in 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 7, grows well in 壤土, and can tolerate temperatures from 16°C to 35°C. 九丁榕抗污染能力強，適合城市環境綠化和碳匯。"
  },
  {
    "id": 78,
    "source_type": "tree_species",
    "source_id": "68",
    "summary_cn": "欖仁舅是一種適合在台灣北部、東部地區種植的樹木，碳吸存效率指數為6.2，適合生長在壤土，耐受溫度範圍約18°C至35°C。欖仁舅是台灣北部原生樹種，適合水土保持和生態復育。",
    "summary_en": "欖仁舅 is a tree species suitable for planting in 北部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 6.2, grows well in 壤土, and can tolerate temperatures from 18°C to 35°C. 欖仁舅是台灣北部原生樹種，適合水土保持和生態復育。"
  },
  {
    "id": 79,
    "source_type": "tree_species",
    "source_id": "69",
    "summary_cn": "大花紫薇是一種適合在台灣北部、中部、南部、東部地區種植的樹木，碳吸存效率指數為5，適合生長在壤土，耐受溫度範圍約15°C至35°C。大花紫薇觀賞價值高，是優良的行道樹和庭園樹種。",
    "summary_en": "大花紫薇 is a tree species suitable for planting in 北部, 中部, 南部, 東部 regions of Taiwan, with a carbon sequestration efficiency index of 5, grows well in 壤土, and can tolerate temperatures from 15°C to 35°C. 大花紫薇觀賞價值高，是優良的行道樹和庭園樹種。"
  },
  {
    "id": 80,
    "source_type": "tree_species",
    "source_id": "70",
    "summary_cn": "白玉蘭是一種適合在台灣北部、中部地區種植的樹木，碳吸存效率指數為5.2，適合生長在壤土，耐受溫度範圍約12°C至32°C。白玉蘭花朵潔白芳香，適合作為庭園樹和行道樹。",
    "summary_en": "白玉蘭 is a tree species suitable for planting in 北部, 中部 regions of Taiwan, with a carbon sequestration efficiency index of 5.2, grows well in 壤土, and can tolerate temperatures from 12°C to 32°C. 白玉蘭花朵潔白芳香，適合作為庭園樹和行道樹。"
  },
  {
    "id": 81,
    "source_type": "custom",
    "source_id": "tree_carbon_basics",
    "summary_cn": "樹木碳吸存是減緩氣候變遷的重要自然解決方案。一棵成熟樹木每年可吸收約22公斤二氧化碳，相當於一輛汽車行駛80公里的排放量。樹木透過光合作用將大氣中的二氧化碳轉化為氧氣和木質素，儲存在樹幹、枝條、葉片和根部。",
    "summary_en": "Tree carbon sequestration is an important natural solution to mitigate climate change. A mature tree can absorb about 22 kg of carbon dioxide annually, equivalent to the emissions from a car driving 80 kilometers. Trees convert atmospheric carbon dioxide into oxygen and lignin through photosynthesis, storing carbon in their trunks, branches, leaves, and roots."
  },
  {
    "id": 82,
    "source_type": "custom",
    "source_id": "forest_management",
    "summary_cn": "森林管理對碳匯效益有顯著影響。研究表明，合理間伐可提高森林碳吸存能力15-20%。多齡混合林比單一樹種林具更高的碳儲存潛力和生態系統穩定性。良好的森林經營需考慮樹種多樣性、年齡結構和地理條件等因素。",
    "summary_en": "Forest management significantly impacts carbon sink benefits. Studies show that proper thinning can increase forest carbon sequestration capacity by 15-20%. Multi-age mixed forests have higher carbon storage potential and ecosystem stability than single-species forests. Good forest management should consider tree species diversity, age structure, and geographical conditions."
  },
  {
    "id": 83,
    "source_type": "custom",
    "source_id": "urban_carbon_sequestration",
    "summary_cn": "都市林在城市碳中和策略中扮演關鍵角色。一棵直徑50公分的城市大樹一生可吸收約1噸碳。都市樹木不僅能吸收碳，還能降低建築能耗、減少熱島效應並提升空氣品質。城市綠化規劃應優先考慮長壽、抗逆性強和碳吸存效率高的樹種。",
    "summary_en": "Urban forests play a key role in city carbon neutrality strategies. A city tree with a 50 cm diameter can absorb about 1 ton of carbon during its lifetime. Urban trees not only absorb carbon but also reduce building energy consumption, mitigate heat island effects, and improve air quality. Urban greening plans should prioritize tree species with longevity, resilience, and high carbon sequestration efficiency."
  },
  {
    "id": 84,
    "source_type": "custom",
    "source_id": "climate_adaptation",
    "summary_cn": "在氣候變遷背景下，樹木種植策略需要調整以適應未來條件。氣溫上升1°C可能使樹木生長帶北移約100-150公里或海拔上升150公尺。未來造林應選擇具氣候適應性的樹種，並建立更多異質性森林以增強生態彈性。",
    "summary_en": "In the context of climate change, tree planting strategies need adjustment to adapt to future conditions. A temperature increase of 1°C may shift tree growing zones northward by about 100-150 kilometers or upward by 150 meters in elevation. Future afforestation should select climate-adaptive tree species and establish more heterogeneous forests to enhance ecological resilience."
  },
  {
    "id": 85,
    "source_type": "custom",
    "source_id": "carbon_certification",
    "summary_cn": "碳匯林認證是將森林碳吸存量轉化為碳權進行交易的機制。認證程序包括基線測定、吸存量計算、第三方驗證和監測報告。台灣的碳權交易制度正在發展中，預計將成為推動造林和森林保育的重要經濟激勵。",
    "summary_en": "Carbon sink forest certification is a mechanism for trading forest carbon sequestration as carbon credits. The certification process includes baseline determination, sequestration calculation, third-party verification, and monitoring reports. Taiwan's carbon credit trading system is under development and is expected to become an important economic incentive for afforestation and forest conservation."
  }
];

module.exports = treeKnowledgeData;