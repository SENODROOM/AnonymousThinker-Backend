/**
 * scripts/reindex-pinecone.js
 * 
 * Run this ONCE to migrate all existing MongoDB knowledge chunks into Pinecone.
 * Usage: node scripts/reindex-pinecone.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Knowledge = require('../models/Knowledge');
const { indexChunks, deleteVectorsByFileName } = require('../config/pineconeService');

async function reindex() {
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_HOST) {
    console.error('❌ PINECONE_API_KEY and PINECONE_HOST must be set in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const allKnowledge = await Knowledge.find({});
    console.log(`📚 Found ${allKnowledge.length} total chunks in MongoDB`);

    // Group by fileName
    const byFile = allKnowledge.reduce((acc, doc) => {
      if (!acc[doc.fileName]) {
        acc[doc.fileName] = { chunks: [], fileType: doc.fileType };
      }
      acc[doc.fileName].chunks.push(doc.content);
      return acc;
    }, {});

    const files = Object.keys(byFile);
    console.log(`📁 Processing ${files.length} unique files...\n`);

    let totalVectors = 0;
    for (const [fileName, { chunks, fileType }] of Object.entries(byFile)) {
      if (chunks.length === 1 && chunks[0].includes('[SCANNED DOCUMENT')) {
        console.log(`⏭️  Skipping scanned doc: ${fileName}`);
        continue;
      }

      console.log(`🔄 Processing: ${fileName} (${chunks.length} chunks)`);

      // Clean old vectors first
      await deleteVectorsByFileName(fileName);

      // Index new vectors
      const count = await indexChunks(chunks, fileName, fileType);
      totalVectors += count;
      console.log(`   ✅ Indexed ${count} vectors\n`);

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    // Mark all as pinecone-indexed in MongoDB
    await Knowledge.updateMany({}, { pineconeIndexed: true });

    console.log(`\n🎉 REINDEX COMPLETE!`);
    console.log(`   Total vectors indexed: ${totalVectors}`);
    console.log(`   Files processed: ${files.length}`);

  } catch (error) {
    console.error('❌ Reindex failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

reindex();