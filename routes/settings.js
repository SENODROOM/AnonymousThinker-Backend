const express = require('express');
const UserSettings = require('../models/UserSettings');
const { DEFAULT_SETTINGS } = require('../models/UserSettings');
const auth = require('../middleware/auth');

const router = express.Router();

// ============================================================
// GET /api/settings
// Returns user's current settings or defaults if not found
// ============================================================
router.get('/', auth, async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ userId: req.user._id });

    if (!settings) {
      // Return defaults without creating record (lazy initialization)
      return res.json({ settings: DEFAULT_SETTINGS });
    }

    res.json({ settings: settings.toObject() });
  } catch (error) {
    console.error('[SETTINGS] GET error:', error.message);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// ============================================================
// PUT /api/settings
// Update user settings (upsert)
// ============================================================
router.put('/', auth, async (req, res) => {
  try {
    const allowedFields = [
      'temperature',
      'maxTokens',
      'defaultModel',
      'skipRAGForSimple',
      'preferredLanguage',
      'timezone',
      'themePreference',
      'showSourceCitations',
      'conversationsSortBy',
      'storeConversations',
      'allowAnalytics'
    ];

    const updates = {};

    // Only allow whitelisted fields
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    // VALIDATE FIELD VALUES
    if (updates.temperature !== undefined) {
      if (typeof updates.temperature !== 'number' || updates.temperature < 0 || updates.temperature > 2) {
        return res.status(400).json({ error: 'Temperature must be a number between 0 and 2' });
      }
    }

    if (updates.maxTokens !== undefined) {
      if (typeof updates.maxTokens !== 'number' || updates.maxTokens < 500 || updates.maxTokens > 4000) {
        return res.status(400).json({ error: 'Max tokens must be a number between 500 and 4000' });
      }
    }

    if (updates.defaultModel !== undefined) {
      if (!['groq', 'huggingface'].includes(updates.defaultModel)) {
        return res.status(400).json({ error: 'Default model must be "groq" or "huggingface"' });
      }
    }

    if (updates.themePreference !== undefined) {
      if (!['light', 'dark', 'auto'].includes(updates.themePreference)) {
        return res.status(400).json({ error: 'Theme preference must be "light", "dark", or "auto"' });
      }
    }

    if (updates.conversationsSortBy !== undefined) {
      if (!['recent', 'pinned', 'alphabetical'].includes(updates.conversationsSortBy)) {
        return res.status(400).json({ error: 'Conversations sort must be "recent", "pinned", or "alphabetical"' });
      }
    }

    if (updates.skipRAGForSimple !== undefined && typeof updates.skipRAGForSimple !== 'boolean') {
      return res.status(400).json({ error: 'skipRAGForSimple must be a boolean' });
    }

    if (updates.showSourceCitations !== undefined && typeof updates.showSourceCitations !== 'boolean') {
      return res.status(400).json({ error: 'showSourceCitations must be a boolean' });
    }

    if (updates.storeConversations !== undefined && typeof updates.storeConversations !== 'boolean') {
      return res.status(400).json({ error: 'storeConversations must be a boolean' });
    }

    if (updates.allowAnalytics !== undefined && typeof updates.allowAnalytics !== 'boolean') {
      return res.status(400).json({ error: 'allowAnalytics must be a boolean' });
    }

    // UPSERT: Find and update, or create new
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user._id },
      { userId: req.user._id, ...updates },
      { new: true, upsert: true, runValidators: true }
    );

    console.log(`[SETTINGS] Updated for user ${req.user._id}:`, Object.keys(updates));
    res.json({ settings: settings.toObject() });
  } catch (error) {
    console.error('[SETTINGS] PUT error:', error.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ============================================================
// DELETE /api/settings (OPTIONAL)
// Reset user settings to defaults
// ============================================================
router.delete('/', auth, async (req, res) => {
  try {
    await UserSettings.deleteOne({ userId: req.user._id });
    console.log(`[SETTINGS] Reset to defaults for user ${req.user._id}`);
    res.json({ message: 'Settings reset to defaults', settings: DEFAULT_SETTINGS });
  } catch (error) {
    console.error('[SETTINGS] DELETE error:', error.message);
    res.status(500).json({ error: 'Failed to reset settings' });
  }
});

module.exports = router;
