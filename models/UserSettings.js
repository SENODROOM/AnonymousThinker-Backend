const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    sparse: true
  },

  // CHAT PREFERENCES (affect AI behavior)
  defaultModel: {
    type: String,
    enum: ['groq', 'huggingface'],
    default: 'groq'
  },
  temperature: {
    type: Number,
    min: 0,
    max: 2,
    default: 0.65
  },
  maxTokens: {
    type: Number,
    min: 500,
    max: 4000,
    default: 2000
  },
  skipRAGForSimple: {
    type: Boolean,
    default: true
  },

  // PERSONALIZATION
  preferredLanguage: {
    type: String,
    default: 'en'
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  themePreference: {
    type: String,
    enum: ['light', 'dark', 'auto'],
    default: 'auto'
  },

  // UI/UX PREFERENCES
  showSourceCitations: {
    type: Boolean,
    default: true
  },
  conversationsSortBy: {
    type: String,
    enum: ['recent', 'pinned', 'alphabetical'],
    default: 'recent'
  },

  // PRIVACY & TRACKING
  storeConversations: {
    type: Boolean,
    default: true
  },
  allowAnalytics: {
    type: Boolean,
    default: false
  },

  // TIMESTAMPS
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update updatedAt on every save
userSettingsSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// ============================================================
// DEFAULT SETTINGS CONSTANT
// ============================================================
const DEFAULT_SETTINGS = {
  defaultModel: 'groq',
  temperature: 0.65,
  maxTokens: 2000,
  skipRAGForSimple: true,
  preferredLanguage: 'en',
  timezone: 'UTC',
  themePreference: 'auto',
  showSourceCitations: true,
  conversationsSortBy: 'recent',
  storeConversations: true,
  allowAnalytics: false
};

module.exports = mongoose.model('UserSettings', userSettingsSchema);
module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
