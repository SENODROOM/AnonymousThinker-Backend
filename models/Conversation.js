const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  // Reaction data stored per-message (AI messages only)
  reactions: {
    thumbsUp: { type: Number, default: 0 },
    thumbsDown: { type: Number, default: 0 }
  },
  // Last reaction by this user (for toggle logic)
  userReaction: {
    type: String,
    enum: ['thumbsUp', 'thumbsDown', null],
    default: null
  }
}, { _id: true });

const conversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    default: 'New Chat',
    trim: true,
    maxLength: 120
  },
  messages: [messageSchema],
  model: {
    type: String,
    default: 'groq'
  },
  // ── New fields ────────────────────────────
  isPinned: {
    type: Boolean,
    default: false
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  // ──────────────────────────────────────────
}, {
  timestamps: true  // adds createdAt, updatedAt automatically
});

// Auto-generate a title from the first user message
conversationSchema.methods.generateTitle = function () {
  const firstUserMsg = this.messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    const words = firstUserMsg.content.trim().split(/\s+/).slice(0, 8).join(' ');
    this.title = words.length > 60 ? words.substring(0, 57) + '...' : words;
  }
};

// Index for common queries
conversationSchema.index({ userId: 1, isArchived: 1, updatedAt: -1 });
conversationSchema.index({ userId: 1, isPinned: 1, updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);