const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const { TrainingEntry, SystemPrompt } = require('../models/Training');
const auth = require('../middleware/auth');
const { callGroq, callHuggingFace } = require('../config/aiService');
const { queryVectors } = require('../config/pineconeService');

// ────────────────────────────────────────────────────────────────────────────────
// IDENTITY & REASONING BLOCKS
// ────────────────────────────────────────────────────────────────────────────────
const IDENTITY_BLOCK = `
### IDENTITY
You are AnonymousThinker — an AI built to understand different thoughts and draw meaningful conclusions.
You were created by Muhammad Saad Amin.
NEVER claim to be made by OpenAI, Google, Meta, Anthropic, Mistral, HuggingFace, or Groq.
`;

const REASONING_FRAMEWORK = `
### REASONING FRAMEWORK
1. Identify the core question or claim
2. Present the strongest counter-arguments first (steel-man)
3. Apply rigorous logical analysis
4. Ground your response in evidence from the knowledge base when available
5. Deliver a clear, well-structured conclusion
`;

// ────────────────────────────────────────────────────────────────────────────────
// SIMPLE MESSAGE DETECTOR — skip RAG for greetings
// ────────────────────────────────────────────────────────────────────────────────
function shouldSkipRAG(content) {
  const lower = content.toLowerCase().trim();
  const simplePatterns = [
    /^(hi|hello|hey|salam|salaam|assalam|greetings)[\s!.,?]*$/i,
    /^(how are you|what's up|whats up|how r u|how do you do)[\s!.,?]*$/i,
    /^(who are you|what are you|what is your name|who made you)[\s!.,?]*$/i,
    /^(thanks|thank you|thank u|jazakallah|shukran|ok|okay|sure|great|good|nice|cool|awesome)[\s!.,?]*$/i,
    /^(yes|no|maybe|perhaps|agree|disagree)[\s!.,?]*$/i,
    /^.{1,15}$/,
  ];
  return simplePatterns.some(p => p.test(lower));
}

// ────────────────────────────────────────────────────────────────────────────────
// ROUTES
// ────────────────────────────────────────────────────────────────────────────────

// GET /api/chat/conversations
router.get('/conversations', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      userId: req.user._id,
      isArchived: false
    })
      .select('title createdAt updatedAt messages model isPinned')
      .sort({ isPinned: -1, updatedAt: -1 });

    const conversationsWithPreview = conversations.map(conv => ({
      _id: conv._id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messages.length,
      lastMessage: conv.messages.length > 0
        ? conv.messages[conv.messages.length - 1].content.substring(0, 100)
        : '',
      model: conv.model,
      isPinned: conv.isPinned || false
    }));

    res.json(conversationsWithPreview);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// GET /api/chat/conversations/archived
router.get('/conversations/archived', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      userId: req.user._id,
      isArchived: true
    })
      .select('title createdAt updatedAt messages')
      .sort({ updatedAt: -1 });

    res.json(conversations.map(conv => ({
      _id: conv._id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messages.length,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch archived conversations' });
  }
});

// POST /api/chat/conversations
router.post('/conversations', auth, async (req, res) => {
  try {
    const { title } = req.body;
    const conversation = new Conversation({
      userId: req.user._id,
      title: title || 'New Chat',
      messages: []
    });
    await conversation.save();
    res.status(201).json(conversation);
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// GET /api/chat/conversations/:id
router.get('/conversations/:id', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// PUT /api/chat/conversations/:id  (rename)
router.put('/conversations/:id', auth, async (req, res) => {
  try {
    const { title } = req.body;
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { title },
      { new: true }
    );
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// PATCH /api/chat/conversations/:id/pin  — toggle pin
router.patch('/conversations/:id/pin', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    conversation.isPinned = !conversation.isPinned;
    await conversation.save();
    res.json({ isPinned: conversation.isPinned });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

// PATCH /api/chat/conversations/:id/archive  — toggle archive
router.patch('/conversations/:id/archive', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    conversation.isArchived = !conversation.isArchived;
    await conversation.save();
    res.json({ isArchived: conversation.isArchived });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle archive' });
  }
});

// DELETE /api/chat/conversations/:id
router.delete('/conversations/:id', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// POST /api/chat/conversations/:id/message
router.post('/conversations/:id/message', auth, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const userMessage = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };
    conversation.messages.push(userMessage);

    if (conversation.messages.length === 1) {
      conversation.generateTitle();
    }

    const recentMessages = conversation.messages
      .slice(-30)
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const hasGroq = !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
    const hasHuggingFace = !!(process.env.HUGGINGFACE_API_KEY && process.env.HUGGINGFACE_API_KEY.trim());
    const hasPinecone = !!(process.env.PINECONE_API_KEY && process.env.PINECONE_HOST);

    let aiResponse;

    try {
      let knowledgeContext = '';
      let sourcesUsed = [];
      const isSimpleMessage = shouldSkipRAG(content);

      if (hasPinecone && !isSimpleMessage) {
        try {
          console.log(`\n🔍 Pinecone RAG: "${content.substring(0, 60)}..."`);
          const matches = await queryVectors(content, 5);
          const goodMatches = matches.filter(m => m.score > 0.65);

          if (goodMatches.length > 0) {
            sourcesUsed = [...new Set(goodMatches.map(m => m.metadata?.fileName).filter(Boolean))];
            knowledgeContext = goodMatches
              .map((m, i) =>
                `[Source ${i + 1}: "${m.metadata?.fileName || 'Knowledge Base'}"]\n${m.metadata?.content}`
              )
              .join('\n\n---\n\n');
            console.log(`✅ RAG: ${goodMatches.length} relevant passages | Sources: ${sourcesUsed.join(', ')}`);
          } else {
            console.log(`⚠️ RAG: No high-confidence matches (best: ${matches[0]?.score?.toFixed(3) || 'N/A'})`);
          }
        } catch (pineconeError) {
          console.error('❌ Pinecone RAG failed:', pineconeError.message);
        }
      } else if (isSimpleMessage) {
        console.log(`\n💬 Simple message — skipping RAG`);
      }

      const adminPersona = await SystemPrompt.findOne({ isActive: true }).sort({ createdAt: -1 });
      const baseSystemPrompt = adminPersona
        ? adminPersona.prompt
        : `You are AnonymousThinker, an AI to understand different thoughts and to create a conclusion from them. You were made by Muhammad Saad Amin. Be thoughtful, intellectually honest, and helpful.`;

      let knowledgeSection = '';
      if (knowledgeContext) {
        knowledgeSection = `
### RETRIEVED KNOWLEDGE (from uploaded books & sources)
The following passages are the most relevant excerpts from the knowledge base for this question.
USE THEM as your primary evidence. Cite the source name naturally in your response.

${knowledgeContext}
`;
      }

      const missionBlock = `
### MISSION & WORLDVIEW
You are an intellectual defender of Islam. Your role is to:
1. Provide a thoughtful, safe space for exploring ideas
2. Use logic, historical evidence, and Islamic scholarship to demonstrate the truth of Islam
3. Respectfully engage with atheism, agnosticism, and other religious perspectives
4. Ground every answer in evidence from the knowledge base when available
5. Be patient, warm, and intellectually honest — never arrogant or dismissive
`;

      const finalSystemPrompt = knowledgeContext
        ? `${IDENTITY_BLOCK}\n${REASONING_FRAMEWORK}\n${missionBlock}\n${knowledgeSection}\n### YOUR PERSONA\n${baseSystemPrompt}`
        : `${IDENTITY_BLOCK}\n${missionBlock}\n### YOUR PERSONA\n${baseSystemPrompt}`;

      if (hasGroq) {
        aiResponse = await callGroq(recentMessages, finalSystemPrompt);
      } else if (hasHuggingFace) {
        aiResponse = await callHuggingFace(recentMessages, finalSystemPrompt);
      } else {
        aiResponse = `⚠️ **No AI API key configured.** Please add GROQ_API_KEY or HUGGINGFACE_API_KEY to your environment variables.`;
      }

      if (sourcesUsed.length > 0 && knowledgeContext) {
        const cleanSources = sourcesUsed
          .map(s => s.replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, ' ').trim())
          .filter(s => s.length > 3)
          .join(', ');
        if (cleanSources) {
          aiResponse += `\n\n---\n📚 *Sources: ${cleanSources}*`;
        }
      }

    } catch (aiError) {
      console.error('❌ AI call failed:', aiError.message);
      aiResponse = `⚠️ AI Error: ${aiError.message}`;
    }

    const assistantMessage = {
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date(),
      reactions: { thumbsUp: 0, thumbsDown: 0 }
    };
    conversation.messages.push(assistantMessage);

    await conversation.save();

    res.json({
      userMessage,
      assistantMessage,
      conversationId: conversation._id,
      title: conversation.title
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/chat/conversations/:id/messages/:msgIndex/react
// Body: { reaction: 'thumbsUp' | 'thumbsDown' }
router.post('/conversations/:id/messages/:msgIndex/react', auth, async (req, res) => {
  try {
    const { reaction } = req.body;
    if (!['thumbsUp', 'thumbsDown'].includes(reaction)) {
      return res.status(400).json({ error: 'Invalid reaction' });
    }

    const conversation = await Conversation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const msgIndex = parseInt(req.params.msgIndex);
    const message = conversation.messages[msgIndex];
    if (!message || message.role !== 'assistant') {
      return res.status(400).json({ error: 'Invalid message index' });
    }

    if (!message.reactions) message.reactions = { thumbsUp: 0, thumbsDown: 0 };

    // Toggle: if same reaction exists, remove it; otherwise set new one
    const previousReaction = message.userReaction;
    if (previousReaction === reaction) {
      // Un-react
      message.reactions[reaction] = Math.max(0, (message.reactions[reaction] || 0) - 1);
      message.userReaction = null;
    } else {
      if (previousReaction) {
        message.reactions[previousReaction] = Math.max(0, (message.reactions[previousReaction] || 0) - 1);
      }
      message.reactions[reaction] = (message.reactions[reaction] || 0) + 1;
      message.userReaction = reaction;
    }

    conversation.markModified('messages');
    await conversation.save();

    res.json({ reactions: message.reactions, userReaction: message.userReaction });
  } catch (error) {
    console.error('React error:', error);
    res.status(500).json({ error: 'Failed to save reaction' });
  }
});

// DELETE /api/chat/conversations/:id/messages  (clear messages)
router.delete('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { messages: [], title: 'New Chat' },
      { new: true }
    );
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ message: 'Messages cleared', conversation });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear messages' });
  }
});

// GET /api/chat/conversations/:id/export
// Returns conversation as formatted markdown text
router.get('/conversations/:id/export', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const lines = [`# ${conversation.title}`, `*Exported from AnonymousThinker · ${new Date().toLocaleString()}*\n\n---\n`];
    for (const msg of conversation.messages) {
      const role = msg.role === 'user' ? '**You**' : '**AnonymousThinker**';
      const time = new Date(msg.timestamp).toLocaleString();
      lines.push(`${role} *(${time})*\n\n${msg.content}\n\n---\n`);
    }

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${conversation.title.replace(/[^a-z0-9]/gi, '_')}.md"`);
    res.send(lines.join('\n'));
  } catch (error) {
    res.status(500).json({ error: 'Failed to export conversation' });
  }
});

module.exports = router;