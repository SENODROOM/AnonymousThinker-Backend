const fetch = require('node-fetch');

const HUGGINGFACE_ROUTER_URL = 'https://router.huggingface.co/hf-inference/v1/chat/completions';

/**
 * Call Hugging Face Inference API
 */
async function callHuggingFace(messages, systemPrompt = '', modelId = null) {
  const selectedModel = modelId || process.env.HUGGINGFACE_MODEL || 'meta-llama/Llama-3.1-8B-Instruct';

  const chatMessages = [];
  if (systemPrompt) {
    chatMessages.push({ role: 'system', content: systemPrompt });
  }
  chatMessages.push(...messages.map(m => ({ role: m.role, content: m.content })));

  try {
    console.log(`\n🔗 Calling HuggingFace: ${selectedModel}`);

    const response = await fetch(HUGGINGFACE_ROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: chatMessages,
        max_tokens: 2000,
        temperature: 0.65,
        top_p: 0.9,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try { errorData = JSON.parse(errorText); } catch (e) { errorData = { error: errorText }; }
      const errorMsg = errorData.error?.message || errorData.error || errorText;
      if (errorMsg.includes('loading') || response.status === 503) throw new Error('MODEL_LOADING');
      throw new Error(`HuggingFace API error: ${response.status} - ${errorMsg}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '';

  } catch (error) {
    if (error.message === 'MODEL_LOADING') {
      throw new Error(`The model "${selectedModel}" is currently loading. Please try again in 30 seconds.`);
    }
    throw error;
  }
}

/**
 * Call Groq API — primary fast inference engine
 */
async function callGroq(messages, systemPrompt = '', modelId = null) {
  const selectedModel = modelId || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const groqMessages = [];

  if (systemPrompt) {
    groqMessages.push({ role: 'system', content: systemPrompt });
  }
  groqMessages.push(...messages.map(m => ({ role: m.role, content: m.content })));

  try {
    console.log(`\n🚀 Calling Groq: ${selectedModel}`);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: groqMessages,
        max_tokens: 2000,
        temperature: 0.65,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  } catch (error) {
    console.error(`❌ Groq call (${selectedModel}) failed:`, error.message);
    throw error;
  }
}

module.exports = { callHuggingFace, callGroq };