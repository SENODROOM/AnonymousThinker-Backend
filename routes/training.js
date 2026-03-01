const express = require('express');
console.log('--- TRAINING ROUTE FILE LOADED: v1.0.2 ---');
const { TrainingEntry, SystemPrompt } = require('../models/Training');
const Knowledge = require('../models/Knowledge');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const multer = require('multer');
// parsePDF removed from top-level to be required inline for debugging

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// Debug middleware to log ALL requests to this router
router.use((req, res, next) => {
  console.log(`[TRAINING-ROUTE] ${req.method} ${req.originalUrl}`);
  next();
});

// GET /api/training/persona - moved to top for testing
router.get('/persona', auth, async (req, res) => {
  console.log('DEBUG: /api/training/persona GET route hit');
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

// POST /api/training/persona - moved to top for testing
router.post('/persona', auth, async (req, res) => {
  console.log('DEBUG: /api/training/persona POST route hit');
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

// Apply adminAuth to OTHER training routes
router.use(auth, adminAuth);

// ===== SYSTEM PROMPTS (Persona Training) =====

// GET /api/training/prompts - get all system prompts
router.get('/prompts', auth, async (req, res) => {
  try {
    const prompts = await SystemPrompt.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    res.json(prompts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// POST /api/training/prompts - create system prompt
router.post('/prompts', auth, async (req, res) => {
  try {
    const { name, prompt, isActive } = req.body;

    if (!name || !prompt) {
      return res.status(400).json({ error: 'Name and prompt are required' });
    }

    // If setting as active, deactivate all others
    if (isActive) {
      await SystemPrompt.updateMany(
        { userId: req.user._id },
        { isActive: false }
      );
    }

    const systemPrompt = new SystemPrompt({
      userId: req.user._id,
      name,
      prompt,
      isActive: isActive || false
    });

    await systemPrompt.save();
    res.status(201).json(systemPrompt);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// PUT /api/training/prompts/:id/activate - set a prompt as active
router.put('/prompts/:id/activate', auth, async (req, res) => {
  try {
    // Deactivate all
    await SystemPrompt.updateMany(
      { userId: req.user._id },
      { isActive: false }
    );

    // Activate selected
    const prompt = await SystemPrompt.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isActive: true },
      { new: true }
    );

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json(prompt);
  } catch (error) {
    res.status(500).json({ error: 'Failed to activate prompt' });
  }
});

// PUT /api/training/prompts/deactivate-all - use default prompt
router.put('/prompts/deactivate-all', auth, async (req, res) => {
  try {
    await SystemPrompt.updateMany(
      { userId: req.user._id },
      { isActive: false }
    );
    res.json({ message: 'All prompts deactivated, using default' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to deactivate prompts' });
  }
});

// DELETE /api/training/prompts/:id
router.delete('/prompts/:id', auth, async (req, res) => {
  try {
    await SystemPrompt.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });
    res.json({ message: 'Prompt deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});


// ===== TRAINING EXAMPLES (Few-shot learning) =====

// GET /api/training/examples
router.get('/examples', auth, async (req, res) => {
  try {
    const examples = await TrainingEntry.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    res.json(examples);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch examples' });
  }
});

// POST /api/training/examples - add training example
router.post('/examples', auth, async (req, res) => {
  try {
    const { prompt, response, category } = req.body;

    if (!prompt || !response) {
      return res.status(400).json({ error: 'Prompt and response are required' });
    }

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
router.delete('/examples/:id', auth, async (req, res) => {
  try {
    await TrainingEntry.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });
    res.json({ message: 'Example deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete example' });
  }
});

// GET /api/training/export - export training data as JSONL (for fine-tuning)
router.get('/export', auth, async (req, res) => {
  try {
    const examples = await TrainingEntry.find({
      userId: req.user._id,
      isApproved: true
    });

    // Format as JSONL for Hugging Face fine-tuning
    const jsonlData = examples.map(ex => ({
      messages: [
        { role: 'user', content: ex.prompt },
        { role: 'assistant', content: ex.response }
      ]
    }));

    const jsonlString = jsonlData.map(d => JSON.stringify(d)).join('\n');

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename="training_data.jsonl"');
    res.send(jsonlString);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export training data' });
  }
});

// ===== KNOWLEDGE BASE (PDF/Text RAG) =====

// GET /api/training/knowledge - list all uploaded knowledge
router.get('/knowledge', auth, async (req, res) => {
  try {
    const knowledge = await Knowledge.find({ userId: req.user._id })
      .select('fileName fileType createdAt')
      .sort({ createdAt: -1 });

    // Group by filename to show a cleaner list in UI
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

// POST /api/training/knowledge/upload - upload PDF/Text and extract snippets
router.post('/knowledge/upload', auth, upload.single('file'), async (req, res) => {
  console.log('DEBUG ENTRY: Upload route hit');
  try {
    if (!req.file) {
      console.log('DEBUG: No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileName = req.file.originalname;
    console.log('DEBUG: Uploading file:', fileName);
    const fileType = fileName.split('.').pop().toLowerCase();
    let text = '';

    if (fileType === 'pdf') {
      try {
        const pdfParser = require('pdf-parse');
        console.log('DEBUG-V2: Starting PDF extraction for:', fileName);
        const data = await pdfParser(req.file.buffer);
        text = data.text;

        console.log('DEBUG: Extraction complete. Text length:', text ? text.length : 0);

        // Detect likely scanned PDF (CamScanner or similar) for logging purposes
        const isCamScanner = data.info?.Producer?.toLowerCase().includes('camscanner') ||
          data.info?.Author?.toLowerCase().includes('camscanner') ||
          data.info?.Producer?.toLowerCase().includes('intsig');

        const onlyNewlines = text && text.replace(/[\n\s\t]/g, '').length === 0;

        if (isCamScanner || onlyNewlines) {
          console.log('DEBUG: Warning - Scanned or low-text document detected.');
          // We will let it proceed; the chunking logic will handle empty results.
        }

        if (text) {
          console.log('DEBUG: First 100 chars of extracted text:', JSON.stringify(text.substring(0, 100)));
          if (data.info) {
            console.log('DEBUG: PDF Info:', JSON.stringify(data.info));
          }
        }
      } catch (err) {
        console.error('PDF Parsing inner error:', err);
        return res.status(500).json({ error: `PDF Processing failed: ${err.message}` });
      }
    } else if (fileType === 'txt') {
      text = req.file.buffer.toString('utf-8');
      console.log('DEBUG: TXT read complete. Text length:', text.length);
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please use PDF or TXT.' });
    }

    const trimmedText = text ? text.trim() : '';
    if (!trimmedText || trimmedText.length === 0) {
      console.log('DEBUG: Extraction resulted in NO text (after trim).');
      // Return 200 instead of 400 to allow UI to handle it gracefully
      return res.status(200).json({
        message: 'Upload successful, but no text layer was found in this PDF.',
        noTextExtracted: true,
        error: 'This PDF appears to be a scanned image or contains no selectable text. Please upload a text-based PDF or copy-paste the content directly.'
      });
    }

    // Chunking logic
    const chunkSize = 1000;
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.substring(i, i + chunkSize).trim();
      // Reduced from 50 to 20 to capture shorter snippets
      if (chunk.length >= 20) chunks.push(chunk);
    }

    console.log(`DEBUG: Created ${chunks.length} valid chunks.`);

    if (chunks.length === 0) {
      console.log('DEBUG: No chunks passed the length threshold (20 chars).');
      return res.status(400).json({ error: 'The file contains too little text to be processed (min 20 chars required).' });
    }

    // Save chunks to database
    console.log('DEBUG: Saving chunks to MongoDB...');
    const savedKnowledge = await Promise.all(
      chunks.map(async (content, index) => {
        try {
          const entry = new Knowledge({
            userId: req.user._id,
            content,
            fileName,
            fileType
          });
          return await entry.save();
        } catch (saveErr) {
          console.error(`DEBUG: Failed to save chunk ${index}:`, saveErr.message);
          throw saveErr;
        }
      })
    );

    console.log(`DEBUG: Successfully saved ${savedKnowledge.length} chunks.`);

    res.status(201).json({
      message: `Successfully processed ${fileName}`,
      chunks: savedKnowledge.length
    });

  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// DELETE /api/training/knowledge/:filename - delete all chunks of a file
router.delete('/knowledge/:fileName', auth, async (req, res) => {
  try {
    await Knowledge.deleteMany({
      userId: req.user._id,
      fileName: req.params.fileName
    });
    res.json({ message: 'File and related knowledge removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete knowledge' });
  }
});

module.exports = router;
