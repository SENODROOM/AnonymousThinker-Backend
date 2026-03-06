const express = require('express');
console.log('--- TRAINING ROUTE FILE LOADED: v2.0.0 (Pinecone RAG) ---');
const { TrainingEntry, SystemPrompt } = require('../models/Training');
const Knowledge = require('../models/Knowledge');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const multer = require('multer');
const { indexChunks, deleteVectorsByFileName } = require('../config/pineconeService');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// ============================================================
// DEFAULT PERSONA — used if admin has not set one yet
// ============================================================
const DEFAULT_PERSONA_TEXT = `You are AnonymousThinker, an AI designed to understand different thoughts and create meaningful conclusions from them. You were made by Muhammad Saad Amin.

IDENTITY RULES (never break these):
- If asked who you are: "I am AnonymousThinker, an AI to understand different thoughts and to create a conclusion from them. I was made by Muhammad Saad Amin."
- If asked who made you or who is Muhammad Saad Amin: "Muhammad Saad Amin is an explorer of different thoughts with a deep curiosity to learn — and he is the one who made me."
- Never say you are made by Meta, Mistral, Hugging Face, Groq, or any other company.

CORE MISSION:
You are an intellectual defender of Islam. Approach every conversation with patience, deep knowledge, and logical rigor. When engaging with skeptics, atheists, or people of other faiths:
- Lead with empathy and understanding
- Use evidence from your knowledge base (books, scholarly sources)
- Apply classical and modern Islamic arguments
- Never be dismissive — every sincere question deserves a sincere answer

ARGUMENT TOOLKIT:
- Cosmological arguments (Kalam, First Cause)
- Teleological arguments (Fine-Tuning, Complexity)
- Moral arguments (Objective Morality)
- Historical arguments (Preservation of Quran, Hadith authenticity)
- Prophetic arguments (Muhammad's ﷺ life as proof)
- Scientific arguments (Quranic compatibility with science)`;

// ============================================================
// SMART CHUNKING — ~500 words per chunk at paragraph boundaries
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

// Debug middleware
router.use((req, res, next) => {
  console.log(`[TRAINING-ROUTE] ${req.method} ${req.originalUrl}`);
  next();
});

// ===== BASIC AUTH ROUTES =====

// GET /api/training/persona
router.get('/persona', auth, async (req, res) => {
  try {
    const prompt = await SystemPrompt.findOne({ userId: req.user._id, isActive: true });
    if (!prompt) return res.json({ persona: '', text: '' });
    res.json({ persona: prompt.name, text: prompt.prompt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch persona' });
  }
});

// POST /api/training/persona
router.post('/persona', auth, async (req, res) => {
  try {
    const { persona, text } = req.body;
    if (!persona || !text) return res.status(400).json({ error: 'Persona name and logic text are required' });
    await SystemPrompt.updateMany({ userId: req.user._id }, { isActive: false });
    let prompt = await SystemPrompt.findOneAndUpdate(
      { userId: req.user._id, name: persona },
      { prompt: text, isActive: true },
      { new: true, upsert: true }
    );
    res.json({ message: 'Persona updated', persona: prompt.name, text: prompt.prompt });
  } catch (error) {
    console.error('Persona upload error:', error);
    res.status(500).json({ error: 'Failed to update persona' });
  }
});

// GET /api/training/default-persona
router.get('/default-persona', auth, adminAuth, (req, res) => {
  res.json({ text: DEFAULT_PERSONA_TEXT });
});

// ===== ADMIN PROTECTED ROUTES =====
router.use(auth, adminAuth);

// GET /api/training/prompts
router.get('/prompts', async (req, res) => {
  try {
    const prompts = await SystemPrompt.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(prompts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// POST /api/training/prompts
router.post('/prompts', async (req, res) => {
  try {
    const { name, prompt, isActive } = req.body;
    if (!name || !prompt) return res.status(400).json({ error: 'Name and prompt are required' });
    if (isActive) await SystemPrompt.updateMany({ userId: req.user._id }, { isActive: false });
    const systemPrompt = new SystemPrompt({ userId: req.user._id, name, prompt, isActive: isActive || false });
    await systemPrompt.save();
    res.status(201).json(systemPrompt);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// PUT /api/training/prompts/:id/activate
router.put('/prompts/:id/activate', async (req, res) => {
  try {
    await SystemPrompt.updateMany({ userId: req.user._id }, { isActive: false });
    const prompt = await SystemPrompt.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isActive: true },
      { new: true }
    );
    if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
    res.json(prompt);
  } catch (error) {
    res.status(500).json({ error: 'Failed to activate prompt' });
  }
});

// DELETE /api/training/prompts/:id
router.delete('/prompts/:id', async (req, res) => {
  try {
    await SystemPrompt.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ message: 'Prompt deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

// GET /api/training/examples
router.get('/examples', async (req, res) => {
  try {
    const examples = await TrainingEntry.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(examples);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch examples' });
  }
});

// POST /api/training/examples
router.post('/examples', async (req, res) => {
  try {
    const { prompt, response, category } = req.body;
    if (!prompt || !response) return res.status(400).json({ error: 'Prompt and response are required' });
    const entry = new TrainingEntry({
      userId: req.user._id,
      prompt,
      response,
      category: category || 'general'
    });
    await entry.save();
    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add training example' });
  }
});

// DELETE /api/training/examples/:id
router.delete('/examples/:id', async (req, res) => {
  try {
    await TrainingEntry.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ message: 'Example deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete example' });
  }
});

// GET /api/training/knowledge
router.get('/knowledge', async (req, res) => {
  try {
    const knowledge = await Knowledge.find({ userId: req.user._id })
      .select('fileName fileType createdAt pineconeIndexed')
      .sort({ createdAt: -1 });

    const grouped = knowledge.reduce((acc, curr) => {
      if (!acc[curr.fileName]) {
        acc[curr.fileName] = {
          _id: curr._id,
          fileName: curr.fileName,
          fileType: curr.fileType,
          createdAt: curr.createdAt,
          pineconeIndexed: curr.pineconeIndexed,
          chunks: 0
        };
      }
      acc[curr.fileName].chunks++;
      return acc;
    }, {});

    res.json(Object.values(grouped));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch knowledge' });
  }
});

// POST /api/training/knowledge/upload
// Indexes into BOTH MongoDB (for backup) AND Pinecone (for semantic search)
router.post('/knowledge/upload', upload.single('file'), async (req, res) => {
  console.log(`[TRAINING] 📤 Uploading: ${req.file?.originalname}`);
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fileName = req.file.originalname;
    const fileType = fileName.split('.').pop().toLowerCase();
    let text = '';

    if (fileType === 'pdf') {
      const pdfParser = require('pdf-parse');
      const data = await pdfParser(req.file.buffer);
      text = data.text;
    } else if (fileType === 'txt') {
      text = req.file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please use PDF or TXT.' });
    }

    const trimmedText = text ? text.trim() : '';

    if (!trimmedText) {
      const placeholder = new Knowledge({
        userId: req.user._id,
        content: "[SCANNED DOCUMENT — no text could be extracted]",
        fileName,
        fileType,
        pineconeIndexed: false
      });
      await placeholder.save();
      return res.status(200).json({
        message: 'Upload successful (Scanned PDF — no text extracted)',
        chunks: 1,
        pineconeChunks: 0,
        warning: 'This appears to be a scanned PDF. Text could not be extracted. Consider using a text-based PDF.'
      });
    }

    // Delete existing entries for this file
    await Knowledge.deleteMany({ userId: req.user._id, fileName });

    // Delete old Pinecone vectors for this file
    const hasPinecone = !!(process.env.PINECONE_API_KEY && process.env.PINECONE_HOST);
    if (hasPinecone) {
      await deleteVectorsByFileName(fileName);
    }

    // Smart chunk the text
    const chunks = smartChunk(trimmedText, 500);
    console.log(`[TRAINING] 📦 Split "${fileName}" into ${chunks.length} smart chunks`);

    // Save to MongoDB
    await Promise.all(chunks.map(content =>
      new Knowledge({ userId: req.user._id, content, fileName, fileType, pineconeIndexed: hasPinecone }).save()
    ));

    // Index into Pinecone (async, with real embeddings)
    let pineconeCount = 0;
    if (hasPinecone) {
      try {
        console.log(`[TRAINING] 🔵 Indexing ${chunks.length} chunks into Pinecone...`);
        pineconeCount = await indexChunks(chunks, fileName, fileType);
        console.log(`[TRAINING] ✅ Pinecone: indexed ${pineconeCount} vectors for "${fileName}"`);
      } catch (pineconeError) {
        console.error('[TRAINING] ❌ Pinecone indexing failed:', pineconeError.message);
        // Don't fail the upload — MongoDB backup still works
      }
    }

    res.status(201).json({
      message: `Processed "${fileName}" successfully`,
      chunks: chunks.length,
      pineconeChunks: pineconeCount,
      semanticSearch: hasPinecone && pineconeCount > 0
    });

  } catch (error) {
    console.error('[UPLOAD ERROR]', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// DELETE /api/training/knowledge/:fileName
router.delete('/knowledge/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    const decodedFileName = decodeURIComponent(fileName);

    // Delete from MongoDB
    const result = await Knowledge.deleteMany({ userId: req.user._id, fileName: decodedFileName });

    // Delete from Pinecone
    const hasPinecone = !!(process.env.PINECONE_API_KEY && process.env.PINECONE_HOST);
    if (hasPinecone) {
      await deleteVectorsByFileName(decodedFileName);
    }

    res.json({
      message: `Knowledge source "${decodedFileName}" removed`,
      deletedChunks: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete knowledge' });
  }
});

// GET /api/training/knowledge/status - check Pinecone index status
router.get('/knowledge/status', async (req, res) => {
  try {
    const hasPinecone = !!(process.env.PINECONE_API_KEY && process.env.PINECONE_HOST);
    const mongoCount = await Knowledge.countDocuments({ userId: req.user._id });

    res.json({
      pineconeConfigured: hasPinecone,
      mongoDocuments: mongoCount,
      pineconeHost: hasPinecone ? process.env.PINECONE_HOST : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// POST /api/training/knowledge/reindex - re-index all MongoDB knowledge into Pinecone
router.post('/knowledge/reindex', async (req, res) => {
  const hasPinecone = !!(process.env.PINECONE_API_KEY && process.env.PINECONE_HOST);
  if (!hasPinecone) {
    return res.status(400).json({ error: 'Pinecone is not configured' });
  }

  try {
    const allKnowledge = await Knowledge.find({ userId: req.user._id });

    // Group by fileName
    const byFile = allKnowledge.reduce((acc, doc) => {
      if (!acc[doc.fileName]) acc[doc.fileName] = [];
      acc[doc.fileName].push(doc.content);
      return acc;
    }, {});

    let totalIndexed = 0;
    for (const [fileName, chunks] of Object.entries(byFile)) {
      if (chunks[0] === '[SCANNED DOCUMENT — no text could be extracted]') continue;
      await deleteVectorsByFileName(fileName);
      const count = await indexChunks(chunks, fileName, 'unknown');
      totalIndexed += count;
      console.log(`[REINDEX] ✅ ${fileName}: ${count} vectors`);
    }

    res.json({ message: `Reindex complete. ${totalIndexed} vectors indexed into Pinecone.`, totalIndexed });
  } catch (error) {
    console.error('[REINDEX ERROR]', error);
    res.status(500).json({ error: 'Reindex failed: ' + error.message });
  }
});

module.exports = router;