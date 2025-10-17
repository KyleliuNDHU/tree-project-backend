-- Drop existing objects for a clean run
DROP TRIGGER IF EXISTS trigger_tree_species_updated_at ON tree_species;
-- DROP FUNCTION IF EXISTS update_updated_at_column; -- Handled by 00_init_functions.pg.sql
DROP TABLE IF EXISTS tree_species;

--
-- 資料表結構 `tree_species` for PostgreSQL
--
CREATE TABLE tree_species (
  id VARCHAR(10) NOT NULL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  scientific_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add comments
COMMENT ON TABLE tree_species IS '樹種資料表';
COMMENT ON COLUMN tree_species.id IS '樹種編號';
COMMENT ON COLUMN tree_species.name IS '樹種名稱';
COMMENT ON COLUMN tree_species.scientific_name IS '學名';

-- Create the trigger
CREATE TRIGGER trigger_tree_species_updated_at
BEFORE UPDATE ON tree_species
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


--
-- 插入資料 `tree_species`
--
INSERT INTO tree_species (id, name, scientific_name, created_at, updated_at) VALUES
('0000', '其他', NULL, '2025-05-12 16:15:12', '2025-05-12 16:15:12'),
('0001', '月橘', 'Murraya paniculata', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0002', '九丁榕', 'Ficus benjamina', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0004', '人心果', 'Blighia sapida', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0008', '土肉桂', 'Cinnamomum osmophloeum', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0011', '大王椰子', 'Roystonea regia (Kunth) O.F. Cook', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0012', '大花紫薇', 'Lagerstroemia speciosa', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0013', '大葉山欖', 'Palaquium formosanum', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0014', '大葉合歡', 'Albizia lebbeck', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0016', '大葉桃花心木', 'Swietenia macrophylla', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0024', '小葉南洋杉', 'Araucaria heterophylla', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0025', '小葉桃花心木', 'Swietenia mahagoni', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0028', '小葉欖仁', 'Terminalia catappa', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0047', '巴西乳香', 'Schinus terebinthifolius', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0054', '木賊葉木麻黃', 'Casuarina equisetifolia', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0055', '毛柿', 'Diospyros discolor', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0060', '水黃皮', 'Garcinia subelliptica', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0070', '可可椰子', 'Cocos nucifera', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0073', '白千層', 'Melaleuca leucadendra', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0074', '白水木', 'Aporusa dioica', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0075', '白玉蘭', 'Magnolia alba', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0086', '印度橡膠樹', 'Ficus elastica', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0095', '西印度櫻桃', 'Eugenia uniflora', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0102', '芒果樹', 'Mangifera indica', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0118', '肯氏南洋杉', 'Araucaria cunninghamii', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0122', '金龜樹', 'Pithecellobium dulce', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0124', '阿勒勃', 'Cerbera odollam', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0125', '雨豆樹', 'Samanea saman (Jacq.) Merr.', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0134', '白榕', 'Ficus rumphii', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0144', '洋紅風鈴木', 'Tabebuia rosea', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0146', '流蘇', 'Chionanthus retusus', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0152', '緬梔', 'Plumeria obtusa', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0160', '苦楝', 'Melia azedarach', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0161', '茄苳', 'Bischofia javanica', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0181', '海檬果', 'Cerbera manghas', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0185', '破布子', 'Cordia dichotoma', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0198', '馬拉巴栗', 'Pachira macrocarpa', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0214', '雀榕', 'Ficus superba', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0221', '黃連木', 'Pistacia chinensis', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0227', '棋盤腳', 'Barringtonia asiatica', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0231', '無葉檉柳', 'Tamarix aphylla', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0236', '菩提樹', 'Ficus religiosa', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0242', '菲島福木', 'Garcinia multiflora', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0255', '黃槿', 'Hibiscus tiliaceus', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0256', '黑板樹', 'Alstonia scholaris', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0259', '楊桃', 'Averrhoa carambola', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0261', '楓香', 'Liquidambar formosana', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0268', '榕樹', 'Ficus microcarpa', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0269', '構樹', 'Broussonetia papyrifera', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0296', '櫸', 'Zelkova serrata (Thunb.) Makino', '2025-05-12 16:15:12', '2025-05-12 16:42:39'),
('0297', '臺灣欒樹', 'Koelreuteria elegans subsp. formosana', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0299', '蒲葵', 'Livistona chinensis', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0301', '銀合歡', 'Leucaena leucocephala', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0306', '鳳凰木', 'Delonix regia', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0307', '墨水樹', 'Semecarpus cuneiformis', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0312', '樟樹', 'Cinnamomum camphora', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0313', '潺槁樹', 'Litsea glutinosa', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0314', '雞蛋花', 'Plumeria rubra', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0315', '蓮霧', 'Syzygium samarangense', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0327', '鴨腳木', 'Schefflera octophylla', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0328', '龍柏', 'Juniperus chinensis ''Kaizuka''', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0329', '龍眼', 'Dimocarpus longan', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0331', '檄樹', 'Lannea coromandelica', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0346', '瓊崖海棠', 'Calophyllum inophyllum', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0355', '釋迦', 'Annona squamosa', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0363', '蘭嶼羅漢松', 'Podocarpus costalis', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0365', '鐵刀木', 'Cassia siamea', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0367', '鐵色', 'Mesua ferrea', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0372', '欖仁舅', 'Elaeocarpus sylvestris', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0373', '欖仁', 'Terminalia catappa var. pubescens', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0381', '大葉羅漢松/羅漢松', 'Podocarpus macrophyllus', '2025-05-12 16:15:12', '2025-05-12 16:40:30'),
('0392', '中東海棗', 'Phoenix dactylifera', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0407', '血桐', 'Macaranga tanarius (L.) Müll. Arg.', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0538', '赤桉', 'Eucalyptus camaldulensis', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('0965', '臺灣胡桃/野核桃', 'Juglans cathayensis', '2025-05-12 16:15:12', '2025-05-12 16:38:31'),
('無', '灌木', NULL, '2025-05-12 16:15:12', '2025-05-12 16:15:12');
