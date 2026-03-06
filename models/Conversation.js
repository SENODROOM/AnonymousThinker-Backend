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
  }
});

const conversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    default: 'New Chat'
  },
  messages: [messageSchema],
  model: {
    type: String,
    default: 'llama-3.3-70b-versatile'
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on every save
conversationSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Auto-generate title from first message
conversationSchema.methods.generateTitle = function () {
  if (this.messages.length > 0) {
    const firstUserMessage = this.messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const title = firstUserMessage.content.substring(0, 50);
      this.title = title.length < firstUserMessage.content.length ? title + '...' : title;
    }
  }
};

module.exports = mongoose.model('Conversation', conversationSchema);