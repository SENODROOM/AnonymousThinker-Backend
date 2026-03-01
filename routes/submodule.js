const express = require('express');
const fs = require('fs');
const path = require('path');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Knowledge = require('../models/Knowledge');
const pdfParser = require('pdf-parse');

const router = express.Router();

// Apply admin protection to all submodule management
router.use(auth, adminAuth);

// Base paths for submodules (relative to project root)
const BASE_PATH = path.join(__dirname, '..', '..');
const SUBMODULES = {
    books: path.join(BASE_PATH, 'books'),
    guide: path.join(BASE_PATH, 'guide')
};

/**
 * GET /api/submodule/list
 * Returns a list of files available in the submodules and their indexing status
 */
router.get('/list', async (req, res) => {
    try {
        const results = [];

        for (const [key, dirPath] of Object.entries(SUBMODULES)) {
            if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath);

                for (const file of files) {
                    if (file === '.git' || fs.statSync(path.join(dirPath, file)).isDirectory()) continue;

                    // Check if this file is already indexed in Knowledge Base
                    const entry = await Knowledge.findOne({ fileName: file }).select('_id');

                    results.push({
                        id: `${key}-${file}`,
                        category: key,
                        fileName: file,
                        filePath: path.join(dirPath, file),
                        isIndexed: !!entry,
                        fileType: path.extname(file).slice(1)
                    });
                }
            }
        }

        res.json(results);
    } catch (error) {
        console.error('Submodule list error:', error);
        res.status(500).json({ error: 'Failed to scan submodules' });
    }
});

/**
 * POST /api/submodule/ingest
 * Reads a local file from a submodule and indexes it
 */
router.post('/ingest', async (req, res) => {
    const { filePath, fileName } = req.body;

    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'Valid file path is required' });
    }

    try {
        const fileType = path.extname(fileName || filePath).slice(1).toLowerCase();
        let text = '';

        if (fileType === 'pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParser(dataBuffer);
            text = data.text;
        } else if (fileType === 'md' || fileType === 'txt') {
            text = fs.readFileSync(filePath, 'utf-8');
        } else {
            return res.status(400).json({ error: 'Unsupported file type for ingestion' });
        }

        const trimmedText = text ? text.trim() : '';
        if (!trimmedText) {
            return res.status(400).json({ error: 'No text extracted from file' });
        }

        // Use the same chunking logic as the upload route
        const chunkSize = 1000;
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.substring(i, i + chunkSize).trim();
            if (chunk.length >= 20) chunks.push(chunk);
        }

        if (chunks.length === 0) {
            return res.status(400).json({ error: 'File contains too little content' });
        }

        // Save chunks
        const savedKnowledge = await Promise.all(
            chunks.map(async (content) => {
                const entry = new Knowledge({
                    userId: req.user._id,
                    content,
                    fileName: fileName || path.basename(filePath),
                    fileType: fileType
                });
                return await entry.save();
            })
        );

        res.status(201).json({
            message: `Successfully ingested ${path.basename(filePath)}`,
            chunks: savedKnowledge.length
        });

    } catch (error) {
        console.error('Submodule ingest error:', error);
        res.status(500).json({ error: 'Failed to ingest file' });
    }
});

module.exports = router;
