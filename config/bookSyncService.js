const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfParser = require('pdf-parse');
const Knowledge = require('../models/Knowledge');
const { indexChunks, deleteVectorsByFileName } = require('./pineconeService');

// ============================================================
// GLOBAL LOCK TO PREVENT CONCURRENT SYNCS
// ============================================================
let isSyncing = false;

// ============================================================
// SMART CHUNKING (reused from training.js)
// ============================================================
function smartChunk(text, wordsPerChunk = 500) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const paragraphs = normalized.split(/\n\n+/);

  const chunks = [];
  let currentChunk = '';
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const paraWords = para.trim().split(/\s+/).length;

    if (currentWordCount + paraWords > wordsPerChunk && currentChunk.trim().length >= 100) {
      chunks.push(currentChunk.trim());
      currentChunk = para + '\n\n';
      currentWordCount = paraWords;
    } else {
      currentChunk += para + '\n\n';
      currentWordCount += paraWords;
    }
  }

  if (currentChunk.trim().length >= 50) {
    chunks.push(currentChunk.trim());
  }

  if (chunks.length === 0) {
    const chunkSize = 2000;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.substring(i, i + chunkSize).trim();
      if (chunk.length >= 50) chunks.push(chunk);
    }
  }

  return chunks;
}

// ============================================================
// HASHING & FILE METADATA
// ============================================================
function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getFileMetadata(filePath) {
  const stats = fs.statSync(filePath);
  const hash = computeFileHash(filePath);
  return {
    mtime: stats.mtimeMs,
    size: stats.size,
    hash: hash
  };
}

// ============================================================
// FILE SCANNING
// ============================================================
function scanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.warn(`⚠️ Directory not found: ${dirPath}`);
    return [];
  }

  const files = [];
  const entries = fs.readdirSync(dirPath);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = fs.statSync(fullPath);

    if (stats.isFile()) {
      const ext = path.extname(entry).toLowerCase();
      if (['.pdf', '.txt', '.md'].includes(ext)) {
        files.push({
          name: entry,
          path: fullPath,
          type: ext === '.pdf' ? 'pdf' : ext === '.txt' ? 'txt' : 'md'
        });
      }
    }
  }

  return files;
}

// ============================================================
// TEXT EXTRACTION
// ============================================================
async function extractText(filePath, fileType) {
  try {
    if (fileType === 'pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParser(dataBuffer);
      return data.text || '';
    } else if (fileType === 'txt' || fileType === 'md') {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (err) {
    console.error(`❌ Failed to extract text from ${filePath}:`, err.message);
    return '';
  }
}

// ============================================================
// MAIN SYNC FUNCTION
// ============================================================
async function syncAllBooks(adminUserId) {
  // PREVENT CONCURRENT SYNCS
  if (isSyncing) {
    throw new Error('Sync already in progress. Please wait for completion.');
  }

  isSyncing = true;

  try {
    const summary = {
      added: 0,
      updated: 0,
      deleted: 0,
      booksScanned: 0,
      totalChunksIndexed: 0,
      errors: []
    };

    console.log(`\n📚 ==== STARTING BOOK SYNC (Admin: ${adminUserId}) ====`);

    // STEP 1: SCAN DIRECTORIES
    const booksDir = path.join(process.cwd(), 'books');
    const guideDir = path.join(process.cwd(), 'guide');

    const bookFiles = scanDirectory(booksDir);
    const guideFiles = scanDirectory(guideDir);
    const allFiles = [...bookFiles, ...guideFiles];

    summary.booksScanned = allFiles.length;
    console.log(`📂 Found ${allFiles.length} books to process`);

    // STEP 2: PROCESS EACH FILE
    for (const file of allFiles) {
      try {
        const dbRecord = await Knowledge.findOne({
          userId: adminUserId,
          fileName: file.name
        });

        const fileMetadata = getFileMetadata(file.path);

        // CHECK IF FILE IS NEW
        if (!dbRecord) {
          console.log(`➕ NEW: ${file.name}`);
          const text = await extractText(file.path, file.type);

          if (!text.trim()) {
            // SCANNED PDF (NO TEXT)
            const placeholder = new Knowledge({
              userId: adminUserId,
              content: '[SCANNED DOCUMENT — no text could be extracted]',
              fileName: file.name,
              fileType: file.type,
              pineconeIndexed: false
            });
            await placeholder.save();
            summary.added++;
            console.log(`   ✅ Indexed as scanned document`);
          } else {
            // NORMAL FILE WITH TEXT
            const chunks = smartChunk(text);

            // SAVE CHUNKS TO MONGODB
            const knowledgeDocs = chunks.map(chunk => ({
              userId: adminUserId,
              content: chunk,
              fileName: file.name,
              fileType: file.type,
              pineconeIndexed: false
            }));
            await Knowledge.insertMany(knowledgeDocs);

            // INDEX TO PINECONE
            await deleteVectorsByFileName(file.name); // Clean old vectors first
            const indexedCount = await indexChunks(chunks, file.name, file.type);

            // MARK AS INDEXED
            await Knowledge.updateMany(
              { userId: adminUserId, fileName: file.name },
              { pineconeIndexed: true }
            );

            summary.added++;
            summary.totalChunksIndexed += indexedCount;
            console.log(`   ✅ Created ${chunks.length} chunks (${indexedCount} vectors)`);
          }
        } else {
          // CHECK IF FILE CHANGED
          // Level 1: Check mtime + size
          const dbMtime = dbRecord.createdAt?.getTime() || 0;
          const hasTimeChanged = Math.abs(fileMetadata.mtime - dbMtime) > 1000; // 1 sec tolerance

          if (hasTimeChanged) {
            // Level 2: Check hash
            const knowledgeRecs = await Knowledge.find({
              userId: adminUserId,
              fileName: file.name
            });
            const oldHash = knowledgeRecs[0]?.content
              ? crypto.createHash('sha256').update(knowledgeRecs[0].content).digest('hex').substring(0, 16)
              : null;

            const newHashPrefix = fileMetadata.hash.substring(0, 16);

            if (oldHash !== newHashPrefix) {
              console.log(`🔄 UPDATED: ${file.name}`);

              // DELETE OLD CHUNKS AND VECTORS
              await Knowledge.deleteMany({
                userId: adminUserId,
                fileName: file.name
              });
              await deleteVectorsByFileName(file.name);

              // EXTRACT AND RE-INDEX
              const text = await extractText(file.path, file.type);

              if (!text.trim()) {
                const placeholder = new Knowledge({
                  userId: adminUserId,
                  content: '[SCANNED DOCUMENT — no text could be extracted]',
                  fileName: file.name,
                  fileType: file.type,
                  pineconeIndexed: false
                });
                await placeholder.save();
              } else {
                const chunks = smartChunk(text);
                const knowledgeDocs = chunks.map(chunk => ({
                  userId: adminUserId,
                  content: chunk,
                  fileName: file.name,
                  fileType: file.type,
                  pineconeIndexed: false
                }));
                await Knowledge.insertMany(knowledgeDocs);

                const indexedCount = await indexChunks(chunks, file.name, file.type);
                await Knowledge.updateMany(
                  { userId: adminUserId, fileName: file.name },
                  { pineconeIndexed: true }
                );

                summary.totalChunksIndexed += indexedCount;
                console.log(`   ✅ Re-indexed with ${chunks.length} chunks (${indexedCount} vectors)`);
              }

              summary.updated++;
            } else {
              console.log(`⏭️  SKIPPED (hash unchanged): ${file.name}`);
            }
          } else {
            console.log(`⏭️  SKIPPED (no changes): ${file.name}`);
          }
        }
      } catch (err) {
        console.error(`❌ Error processing ${file.name}:`, err.message);
        summary.errors.push({ file: file.name, error: err.message });
      }
    }

    // STEP 3: DELETE ORPHANED RECORDS
    const allDbRecords = await Knowledge.find({ userId: adminUserId });
    for (const dbRecord of allDbRecords) {
      const fileExists = allFiles.some(f => f.name === dbRecord.fileName);
      if (!fileExists) {
        console.log(`🗑️  DELETED: ${dbRecord.fileName}`);
        await Knowledge.deleteMany({ fileName: dbRecord.fileName, userId: adminUserId });
        await deleteVectorsByFileName(dbRecord.fileName);
        summary.deleted++;
      }
    }

    console.log(`\n✅ SYNC COMPLETE`);
    console.log(`[SYNC] Added: ${summary.added}, Updated: ${summary.updated}, Deleted: ${summary.deleted}, Total chunks: ${summary.totalChunksIndexed}`);
    if (summary.errors.length > 0) {
      console.warn(`⚠️ Errors: ${summary.errors.length}`);
    }

    return { status: 'success', summary };
  } finally {
    isSyncing = false;
  }
}

module.exports = { syncAllBooks };
