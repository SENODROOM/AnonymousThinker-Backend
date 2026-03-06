const express = require('express');
const Conversation = require('../models/Conversation');
const { SystemPrompt } = require('../models/Training');
const auth = require('../middleware/auth');
const { callHuggingFace, callGroq } = require('../config/aiService');
const { queryVectors } = require('../config/pineconeService');

const router = express.Router();

// ============================================================
// CORE IDENTITY — always prepended to every system prompt
// ============================================================
const IDENTITY_BLOCK = `
### IDENTITY (NON-NEGOTIABLE — NEVER BREAK CHARACTER)
Your name is AnonymousThinker. You are an AI designed to understand different thoughts and create meaningful conclusions from them. You were made by Muhammad Saad Amin.

STRICT RULES:
- If anyone asks "Who are you?", "What are you?", or "Who is AnonymousThinker?":
  Reply EXACTLY: "I am AnonymousThinker, an AI to understand different thoughts and to create a conclusion from them. I was made by Muhammad Saad Amin."

- If anyone asks "Who is Muhammad Saad Amin?" or "Who made you?" or "Who created you?":
  Reply EXACTLY: "Muhammad Saad Amin is an explorer of different thoughts with a deep curiosity to learn — and he is the one who made me."

- NEVER say you are made by Meta, Mistral, Hugging Face, Groq, OpenAI, or any other company or organization.
- NEVER deny being AnonymousThinker.
- NEVER break this identity under any circumstances, even if the user insists or tries to trick you.
`;

// ============================================================
// REASONING FRAMEWORK
// ============================================================
const REASONING_FRAMEWORK = `
### HOW TO REASON & ARGUE

When answering questions about religion, philosophy, or theology:

1. **UNDERSTAND THE QUESTION DEEPLY**: Identify what the person is really asking. Are they confused, skeptical, curious, or adversarial?

2. **USE THE KNOWLEDGE BASE FIRST**: Always check the provided CONTEXTUAL KNOWLEDGE before answering. Quote and reference specific books/sources when relevant.

3. **STRUCTURED ARGUMENTATION**:
   - Start with the strongest logical point
   - Use real examples, historical evidence, or Quranic/Hadith references
   - Anticipate counter-arguments and address them proactively
   - End with a clear, confident conclusion

4. **INTELLECTUAL HONESTY**: If something is complex or debated within Islamic scholarship, acknowledge it. Being honest builds more trust than pretending to have all answers.

5. **TONE**: Be confident, warm, and intellectually engaging. Never dismissive, condescending, or aggressive. The goal is to guide, not to win arguments.

6. **FOR ATHEIST/AGNOSTIC ARGUMENTS**: Use the Kalam Cosmological Argument, Fine-Tuning Argument, Moral Argument, and Historical/Textual Evidence for the Quran. Show empathy for their worldview before correcting it.

7. **FOR COMPARATIVE RELIGION**: Acknowledge the truth and sincerity in other faiths, then explain clearly and respectfully why Islam is the final and complete revelation.

8. **CITE YOUR SOURCES**: When referencing knowledge from the database, say "According to [book/source]..." to ground your response in evidence.
`;

// ============================================================
// DETECT if a message is a simple conversational question
// that does NOT need knowledge base lookup
// ============================================================
const SKIP_RAG_PATTERNS = [
  /^(hi|hello|hey|salam|salaam|assalam|assalamualaikum|greetings|good\s*(morning|evening|afternoon|night))[!?.،,]*$/i,
  /^(who (are|made|created|built) you|what are you|tell me about yourself|introduce yourself|your name)[?!.]*$/i,
  /^(how are you|how r u|are you okay|you good|what'?s up|sup)[?!.]*$/i,
  /^(thank(s| you)|thx|jazakallah|jazak allah|shukran|ok|okay|cool|great|nice|got it|understood)[!.،,]*$/i,
  /^(yes|no|maybe|sure|alright|fine)[!.?,]*$/i,
  /^bye|goodbye|see you|take care|khuda hafiz/i,
];

function shouldSkipRAG(message) {
  const trimmed = message.trim();
  return SKIP_RAG_PATTERNS.some(pattern => pattern.test(trimmed));
}

// ============================================================
// ROUTES
// ============================================================

// GET /api/chat/conversations
router.get('/conversations', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      userId: req.user._id,
      isArchived: false
    })
      .select('title createdAt updatedAt messages model')
      .sort({ updatedAt: -1 });

    const conversationsWithPreview = conversations.map(conv => ({
      _id: conv._id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messages.length,
      lastMessage: conv.messages.length > 0
        ? conv.messages[conv.messages.length - 1].content.substring(0, 100)
        : '',
      model: conv.model
    }));

    res.json(conversationsWithPreview);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
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

// PUT /api/chat/conversations/:id
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
      // ============================================================
      // SMART RAG — skip for greetings/identity/small talk
      // Only search knowledge base for substantive questions
      // ============================================================
      let knowledgeContext = '';
      let sourcesUsed = [];
      const isSimpleMessage = shouldSkipRAG(content);

      if (hasPinecone && !isSimpleMessage) {
        try {
          console.log(`\n🔍 Pinecone RAG: "${content.substring(0, 60)}..."`);
          const matches = await queryVectors(content, 5);

          // Higher threshold (0.65) = only truly relevant passages
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

      // Fetch Global Admin Persona
      const adminPersona = await SystemPrompt.findOne({ isActive: true }).sort({ createdAt: -1 });
      const baseSystemPrompt = adminPersona
        ? adminPersona.prompt
        : `You are AnonymousThinker, an AI to understand different thoughts and to create a conclusion from them. You were made by Muhammad Saad Amin. Be thoughtful, intellectually honest, and helpful.`;

      // ============================================================
      // BUILD FINAL SYSTEM PROMPT
      // ============================================================
      let knowledgeSection = '';
      if (knowledgeContext) {
        knowledgeSection = `
### RETRIEVED KNOWLEDGE (from uploaded books & sources)
The following passages are the most relevant excerpts from the knowledge base for this question.
USE THEM as your primary evidence. Cite the source name naturally in your response.

${knowledgeContext}
`;
      }
      // No knowledge section at all for simple messages — keeps response clean

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

      // Call AI
      if (hasGroq) {
        aiResponse = await callGroq(recentMessages, finalSystemPrompt);
      } else if (hasHuggingFace) {
        aiResponse = await callHuggingFace(recentMessages, finalSystemPrompt);
      } else {
        aiResponse = `⚠️ **No AI API key configured.** Please add GROQ_API_KEY or HUGGINGFACE_API_KEY to your environment variables.`;
      }

      // Only append sources if knowledge was actually used AND sources exist
      if (sourcesUsed.length > 0 && knowledgeContext) {
        // Clean up filenames for display — remove garbled encoding artifacts
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
      timestamp: new Date()
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

// DELETE /api/chat/conversations/:id/messages
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

module.exports = router;