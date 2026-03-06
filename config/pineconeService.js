const fetch = require('node-fetch');
const crypto = require('crypto');

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_HOST = process.env.PINECONE_HOST;
const EMBEDDING_MODEL = 'multilingual-e5-large';

/**
 * Sanitize any filename (including Arabic/Unicode) into an ASCII-safe vector ID.
 * Uses SHA-1 hash of the filename — works with any language/encoding.
 */
function makeVectorId(fileName, chunkIndex) {
  const hash = crypto.createHash('sha1').update(fileName).digest('hex').substring(0, 12);
  return `doc_${hash}_chunk_${chunkIndex}_${Date.now()}`;
}

async function generateEmbedding(text) {
  const response = await fetch('https://api.pinecone.io/embed', {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json',
      'X-Pinecone-API-Version': '2024-10'
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      inputs: [{ text }],
      parameters: { input_type: 'query', truncate: 'END' }
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pinecone embed error: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  return data.data[0].values;
}

async function generateDocEmbedding(text) {
  const response = await fetch('https://api.pinecone.io/embed', {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json',
      'X-Pinecone-API-Version': '2024-10'
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      inputs: [{ text }],
      parameters: { input_type: 'passage', truncate: 'END' }
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pinecone embed error: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  return data.data[0].values;
}

async function upsertVectors(vectors) {
  const response = await fetch(`${PINECONE_HOST}/vectors/upsert`, {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ vectors, namespace: 'knowledge' })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pinecone upsert error: ${response.status} - ${errText}`);
  }
  return await response.json();
}

async function queryVectors(queryText, topK = 7) {
  const queryEmbedding = await generateEmbedding(queryText);
  const response = await fetch(`${PINECONE_HOST}/query`, {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      namespace: 'knowledge'
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pinecone query error: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  return data.matches || [];
}

async function deleteVectorsByFileName(fileName) {
  try {
    const hash = crypto.createHash('sha1').update(fileName).digest('hex').substring(0, 12);
    const prefix = `doc_${hash}_chunk_`;
    const listResponse = await fetch(
      `${PINECONE_HOST}/vectors/list?namespace=knowledge&prefix=${encodeURIComponent(prefix)}`,
      { headers: { 'Api-Key': PINECONE_API_KEY } }
    );
    if (!listResponse.ok) return;
    const listData = await listResponse.json();
    const ids = (listData.vectors || []).map(v => v.id);
    if (ids.length === 0) return;
    await fetch(`${PINECONE_HOST}/vectors/delete`, {
      method: 'POST',
      headers: { 'Api-Key': PINECONE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, namespace: 'knowledge' })
    });
    console.log(`🗑️ Deleted ${ids.length} vectors for file: ${fileName}`);
  } catch (err) {
    console.warn(`⚠️ Could not delete old vectors for "${fileName}": ${err.message}`);
  }
}

/**
 * Index chunks into Pinecone.
 * Uses ASCII-safe hashed IDs — works with Arabic filenames, spaces, special chars.
 * Original filename is preserved in metadata for display.
 */
async function indexChunks(chunks, fileName, fileType) {
  const vectors = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const embedding = await generateDocEmbedding(chunk);
      vectors.push({
        id: makeVectorId(fileName, i),   // ✅ Always ASCII-safe
        values: embedding,
        metadata: {
          content: chunk.substring(0, 1000),
          fileName,   // Original name stored here (metadata supports Unicode)
          fileType,
          chunkIndex: i
        }
      });
    } catch (err) {
      console.error(`❌ Failed to embed chunk ${i} of "${fileName}":`, err.message);
    }
  }

  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    await upsertVectors(batch);
    console.log(`📌 Upserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} vectors) for ${fileName}`);
  }

  return vectors.length;
}

module.exports = { queryVectors, indexChunks, deleteVectorsByFileName, generateEmbedding };