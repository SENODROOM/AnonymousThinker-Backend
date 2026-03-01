const express = require('express');
console.log('--- TRAINING ROUTE FILE LOADED: v1.0.4 ---');
const { TrainingEntry, SystemPrompt } = require('../models/Training');
const Knowledge = require('../models/Knowledge');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// Debug middleware to log ALL requests to this router
router.use((req, res, next) => {
  console.log(`[TRAINING-ROUTE] ${req.method} ${req.originalUrl}`);
  next();
});

// ===== UNPROTECTED OR BASIC AUTH ROUTES =====

// GET /api/training/persona - Only requires basic auth
router.get('/persona', auth, async (req, res) => {
  try {
    const prompt = await SystemPrompt.findOne({ userId: req.user._id, isActive: true });
    if (!prompt) {
      return res.json({ persona: '', text: '' });
    }
    res.json({ persona: prompt.name, text: prompt.prompt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch persona' });
  }
});

// POST /api/training/persona - Only requires basic auth
router.post('/persona', auth, async (req, res) => {
  try {
    const { persona, text } = req.body;
    if (!persona || !text) {
      return res.status(400).json({ error: 'Persona name and logic text are required' });
    }
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

// ===== ADMIN PROTECTED ROUTES =====
// Apply adminAuth to ALL subsequent routes
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
    const prompt = await SystemPrompt.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { isActive: true }, { new: true });
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
    const entry = new TrainingEntry({ userId: req.user._id, prompt, response, category: category || 'general' });
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
      .select('fileName fileType createdAt')
      .sort({ createdAt: -1 });

    const grouped = knowledge.reduce((acc, curr) => {
      if (!acc[curr.fileName]) {
        acc[curr.fileName] = {
          _id: curr._id,
          fileName: curr.fileName,
          fileType: curr.fileType,
          createdAt: curr.createdAt,
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
      return res.status(400).json({ error: 'Unsupported file type.' });
    }

    const trimmedText = text ? text.trim() : '';
    if (!trimmedText) {
      const placeholder = new Knowledge({
        userId: req.user._id,
        content: "[SCANNED DOCUMENT]",
        fileName,
        fileType
      });
      await placeholder.save();
      return res.status(200).json({ message: 'Upload successful (Scanned)', chunks: 1 });
    }

    const chunkSize = 1000;
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.substring(i, i + chunkSize).trim();
      if (chunk.length >= 20) chunks.push(chunk);
    }

    await Promise.all(chunks.map(content => {
      return new Knowledge({ userId: req.user._id, content, fileName, fileType }).save();
    }));

    res.status(201).json({ message: `Processed ${fileName}`, chunks: chunks.length });
  } catch (error) {
    console.error('[UPLOAD ERROR]', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// DELETE /api/training/knowledge/:fileName
router.delete('/knowledge/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    await Knowledge.deleteMany({ userId: req.user._id, fileName });
    res.json({ message: `Knowledge source "${fileName}" removed` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete knowledge' });
  }
});

module.exports = router;
