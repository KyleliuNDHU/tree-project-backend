-- 建立一個共用的函數，用於在資料更新時自動更新 updated_at 欄位
-- 使用 CREATE OR REPLACE 來確保冪等性，即使重複執行也不會出錯
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';
