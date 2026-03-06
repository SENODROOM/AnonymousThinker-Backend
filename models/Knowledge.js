const mongoose = require('mongoose');

const knowledgeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String, // The extracted text chunk
        required: true
    },
    fileName: {
        type: String, // Source file name (e.g., "Islamic_Refutation.pdf")
        required: true
    },
    fileType: {
        type: String, // 'pdf' or 'txt'
        required: true
    },
    pineconeIndexed: {
        type: Boolean,
        default: false  // True when this chunk has been vectorized and stored in Pinecone
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Text index for MongoDB fallback search
knowledgeSchema.index({ content: 'text' });
// Index for fast file-based queries
knowledgeSchema.index({ fileName: 1, userId: 1 });

module.exports = mongoose.model('Knowledge', knowledgeSchema);