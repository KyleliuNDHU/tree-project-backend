const db = require('../config/db');
const { getEmbedding } = require('../services/knowledgeEmbeddingService');
const treeKnowledgeData = require('../data/tree_knowledge_data');

const BATCH_SIZE = 5; // Process 5 items at a time to avoid overwhelming the server/API
const DELAY_MS = 1000; // Wait 1 second between batches

async function populateKnowledge() {
  console.log('Starting knowledge base population...');
  const client = await db.pool.connect();
  
  try {
    // Check if knowledge base is already populated
    const checkRes = await client.query('SELECT COUNT(*) FROM tree_knowledge_embeddings_v2');
    const existingCount = parseInt(checkRes.rows[0].count, 10);
    
    if (existingCount >= treeKnowledgeData.length) {
      console.log(`Knowledge base already populated with ${existingCount} entries. Skipping.`);
      return;
    }

    console.log(`Found ${existingCount} existing entries. Populating remaining...`);

    // Process in batches
    for (let i = 0; i < treeKnowledgeData.length; i += BATCH_SIZE) {
      const batch = treeKnowledgeData.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(treeKnowledgeData.length / BATCH_SIZE)}...`);

      await Promise.all(batch.map(async (item) => {
        try {
          // Check if this specific item already exists
          const existCheck = await client.query(
            'SELECT id FROM tree_knowledge_embeddings_v2 WHERE source_type = $1 AND internal_source_record_id = $2',
            [item.source_type, item.source_id]
          );

          if (existCheck.rows.length > 0) {
            return; // Skip existing
          }

          const contentToEmbed = item.text_content || item.summary_cn;
          if (!contentToEmbed) return;

          const embedding = await getEmbedding(contentToEmbed);
          if (!embedding) {
            console.error(`Failed to generate embedding for item ${item.id}`);
            return;
          }

          const insertQuery = `
            INSERT INTO tree_knowledge_embeddings_v2 
            (source_type, internal_source_record_id, text_content, summary_cn, embedding, updated_at,
             original_source_title, original_source_author, original_source_publication_year,
             original_source_url_or_doi, original_source_type_detailed, keywords, confidence_score) 
            VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12)
          `;

          await client.query(insertQuery, [
            item.source_type,
            item.source_id,
            item.text_content,
            item.summary_cn,
            JSON.stringify(embedding),
            item.original_source_title,
            item.original_source_author,
            item.original_source_publication_year,
            item.original_source_url_or_doi,
            item.original_source_type_detailed,
            item.keywords,
            item.confidence_score
          ]);
        } catch (err) {
          console.error(`Error processing item ${item.id}:`, err.message);
        }
      }));

      // Delay between batches
      if (i + BATCH_SIZE < treeKnowledgeData.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    console.log('Knowledge base population completed!');

  } catch (err) {
    console.error('Error populating knowledge base:', err);
  } finally {
    client.release();
    // If running as standalone script, exit
    if (require.main === module) {
      process.exit(0);
    }
  }
}

// Allow running directly
if (require.main === module) {
  populateKnowledge();
}

module.exports = populateKnowledge;

