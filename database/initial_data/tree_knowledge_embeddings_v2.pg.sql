CREATE TABLE IF NOT EXISTS tree_knowledge_embeddings_v2 (
    id SERIAL PRIMARY KEY,
    source_type TEXT NOT NULL,
    internal_source_table_name TEXT,
    internal_source_record_id TEXT NOT NULL,
    text_content TEXT,
    summary_cn TEXT,
    embedding TEXT NOT NULL, -- Storing as JSON string
    original_source_title TEXT,
    original_source_author TEXT,
    original_source_publication_year INTEGER,
    original_source_url_or_doi TEXT,
    original_source_type_detailed TEXT,
    keywords TEXT,
    confidence_score REAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ,
    UNIQUE (source_type, internal_source_record_id)
);

-- Trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_tree_knowledge_embeddings_v2_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tree_knowledge_embeddings_v2_updated_at ON tree_knowledge_embeddings_v2;
CREATE TRIGGER update_tree_knowledge_embeddings_v2_updated_at
BEFORE UPDATE ON tree_knowledge_embeddings_v2
FOR EACH ROW
EXECUTE FUNCTION update_tree_knowledge_embeddings_v2_updated_at_column();
