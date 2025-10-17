-- Drop existing objects for a clean run
DROP TABLE IF EXISTS tree_management_actions;
DROP TYPE IF EXISTS action_category;

-- Create custom ENUM type
CREATE TYPE action_category AS ENUM ('健康維護','碳吸存優化','長期規劃');

--
-- 資料表結構 `tree_management_actions` for PostgreSQL
--
CREATE TABLE tree_management_actions (
  action_id SERIAL PRIMARY KEY,
  tree_id INT NOT NULL,
  category action_category NOT NULL,
  action_text VARCHAR(255) NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  due_date DATE,
  created_by INT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comments
COMMENT ON TABLE tree_management_actions IS '儲存對特定樹木的建議管理措施';
COMMENT ON COLUMN tree_management_actions.action_id IS '操作唯一識別碼';
COMMENT ON COLUMN tree_management_actions.tree_id IS '對應的樹木 ID (外鍵, 對應 tree_survey.id)';
COMMENT ON COLUMN tree_management_actions.category IS '操作類別';
COMMENT ON COLUMN tree_management_actions.action_text IS '操作內容描述';
COMMENT ON COLUMN tree_management_actions.is_done IS '是否已完成';
COMMENT ON COLUMN tree_management_actions.due_date IS '預計完成日期';
COMMENT ON COLUMN tree_management_actions.created_by IS '建立此操作的使用者 ID';
COMMENT ON COLUMN tree_management_actions.created_at IS '建立時間';

--
-- 插入資料 `tree_management_actions`
--
INSERT INTO tree_management_actions (action_id, tree_id, category, action_text, is_done, due_date, created_by, created_at) VALUES
(884, 2, '健康維護', '樹木 (ID: 2, 欖仁) 為幼樹 (胸徑: 9.6公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(885, 3, '健康維護', '樹木 (ID: 3, 欖仁) 為幼樹 (胸徑: 9公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(886, 7, '健康維護', '樹木 (ID: 7, 欖仁) 為幼樹 (胸徑: 9.3公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(887, 10, '健康維護', '樹木 (ID: 10, 大葉山欖) 為幼樹 (胸徑: 9.1公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(888, 11, '健康維護', '樹木 (ID: 11, 大葉山欖) 為幼樹 (胸徑: 7.9公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(889, 13, '健康維護', '樹木 (ID: 13, 大葉山欖) 為幼樹 (胸徑: 9.1公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(890, 45, '健康維護', '樹木 (ID: 45, 大葉山欖) 為幼樹 (胸徑: 5.4公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(891, 46, '健康維護', '樹木 (ID: 46, 大葉山欖) 為幼樹 (胸徑: 4.5公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(892, 47, '碳吸存優化', '樹木 (ID: 47, 木賊葉木麻黃) 為大樹 (樹高: 15.1公尺)，碳吸存潛力高，請確保其生長空間與健康。', false, NULL, 0, '2025-05-16 11:30:48'),
(893, 49, '健康維護', '樹木 (ID: 49, 黃槿) 為幼樹 (胸徑: 6.1公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(894, 50, '健康維護', '樹木 (ID: 50, 黃槿) 為幼樹 (胸徑: 5.7公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(895, 53, '健康維護', '樹木 (ID: 53, 瓊崖海棠) 為幼樹 (胸徑: 5公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(896, 55, '健康維護', '樹木 (ID: 55, 黃槿) 為幼樹 (胸徑: 6公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(897, 57, '健康維護', '樹木 (ID: 57, 黃槿) 為幼樹 (胸徑: 6公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(898, 58, '健康維護', '樹木 (ID: 58, 黃槿) 為幼樹 (胸徑: 6.7公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(899, 61, '健康維護', '樹木 (ID: 61, 黃槿) 為幼樹 (胸徑: 5.1公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(900, 62, '健康維護', '樹木 (ID: 62, 黃槿) 為幼樹 (胸徑: 6.2公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(901, 64, '健康維護', '樹木 (ID: 64, 黃槿) 為幼樹 (胸徑: 6.9公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(902, 66, '健康維護', '樹木 (ID: 66, 黃槿) 為幼樹 (胸徑: 6.2公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(903, 68, '健康維護', '樹木 (ID: 68, 黃槿) 為幼樹 (胸徑: 6.2公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(904, 70, '健康維護', '樹木 (ID: 70, 黃槿) 為幼樹 (胸徑: 5.9公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(905, 72, '健康維護', '樹木 (ID: 72, 黃槿) 為幼樹 (胸徑: 6.4公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(906, 74, '健康維護', '樹木 (ID: 74, 黃槿) 為幼樹 (胸徑: 6.4公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(907, 77, '健康維護', '樹木 (ID: 77, 黃槿) 為幼樹 (胸徑: 6.1公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(908, 79, '健康維護', '樹木 (ID: 79, 黃槿) 為幼樹 (胸徑: 5.7公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:30:48'),
(909, 80, '碳吸存優化', '樹木 (ID: 80, 木賊葉木麻黃) 為大樹 (樹高: 15.4公尺)，碳吸存潛力高，請確保其生長空間與健康。', false, NULL, 0, '2025-05-16 11:30:48');

-- ... (many more insert statements) ...

INSERT INTO tree_management_actions (action_id, tree_id, category, action_text, is_done, due_date, created_by, created_at) VALUES
(1322, 1530, '健康維護', '樹木 (ID: 1530, 瓊崖海棠) 為幼樹 (胸徑: 9.6公分)，建議加強撫育，如除草、鬆土。', false, NULL, 0, '2025-05-16 11:34:03'),
(1323, 1531, '碳吸存優化', '樹木 (ID: 1531, 欖仁) 為大樹 (樹高: 15.5公尺)，碳吸存潛力高，請確保其生長空間與健康。', false, NULL, 0, '2025-05-16 11:34:03'),
(1324, 1533, '碳吸存優化', '樹木 (ID: 1533, 茄苳) 為大樹 (樹高: 140.02公尺)，碳吸存潛力高，請確保其生長空間與健康。', false, NULL, 0, '2025-05-16 11:34:03');

-- Update sequence
SELECT setval(pg_get_serial_sequence('tree_management_actions', 'action_id'), 1327, false);

-- Note: The FOREIGN KEY constraint is commented out. 
-- It should be added after the `tree_survey` table has been created and populated.
-- ALTER TABLE tree_management_actions ADD CONSTRAINT fk_tree_id FOREIGN KEY (tree_id) REFERENCES tree_survey (id);
