# 🧠 AnonymousThinker Backend — v2.0

> [!IMPORTANT]
> **Developer Only**: AI Training and Knowledge Base features are restricted to the **Admin** role only. Regular users cannot access these features.

AnonymousThinker is an AI designed to defend Islamic truth through logic, historical evidence, and deep knowledge of comparative religion. It uses **Pinecone semantic vector search** to retrieve the most relevant passages from your uploaded books before every response — making it genuinely grounded rather than hallucinating.

---

## 🏗️ Architecture Overview

```
User Message
     │
     ▼
Pinecone Semantic Search  ←─── Your Uploaded Books (vectorized)
     │
     ▼
Top 7 Relevant Passages
     │
     ▼
System Prompt = IDENTITY + REASONING FRAMEWORK + KNOWLEDGE + PERSONA
     │
     ▼
Groq (llama-3.3-70b-versatile) → Response with Source Citations
```

### Key Components

| File                        | Role                                              |
| --------------------------- | ------------------------------------------------- |
| `config/pineconeService.js` | Embedding generation, vector upsert/query/delete  |
| `config/aiService.js`       | Groq + HuggingFace API calls                      |
| `routes/chat.js`            | Message handling, RAG pipeline, response building |
| `routes/training.js`        | PDF upload, Pinecone indexing, persona management |
| `models/Knowledge.js`       | MongoDB chunk storage (backup to Pinecone)        |

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# Database
MONGODB_URI=mongodb+srv://...

# Auth
JWT_SECRET=your_super_secret_key
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=yourAdminPassword

# AI — Groq is primary (fast, free, smart)
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

# HuggingFace — fallback only
HUGGINGFACE_API_KEY=hf_...

# Pinecone — Semantic Vector Search
PINECONE_API_KEY=pcsk_...
PINECONE_HOST=https://your-index.svc.aped-xxxx.pinecone.io
```

---

## 🔐 Gaining Admin Access

To use the training features you must promote your account to `admin`:

1. Register an account in the frontend
2. Open a terminal in `backend/`
3. Run: `node scripts/makeAdmin.js your-email@example.com`
4. Log out and back in — the **Train AI** button appears in the sidebar

---

## 📚 The Knowledge Base & Pinecone RAG

This is the most important part of making the AI intelligent. Every PDF or TXT you upload is:

1. **Extracted** — text pulled from the file
2. **Smart-chunked** — split into ~500 word semantic chunks at paragraph boundaries
3. **Saved to MongoDB** — as a backup and for metadata tracking
4. **Vectorized & indexed into Pinecone** — each chunk gets an embedding from `multilingual-e5-large`

When a user sends a message, the backend queries Pinecone for the 7 most semantically relevant passages (score > 0.45) and injects them directly into the AI's system prompt. The AI then cites the source in its response.

### What to Upload

Upload scholarly books and articles that cover:

- Islamic theology and jurisprudence (Aqeedah, Tawheed)
- Refutations of atheism (Kalam argument, Fine-Tuning, Moral argument)
- Comparative religion (Islam vs Christianity, Judaism, Hinduism)
- Quran preservation and authenticity
- Hadith sciences and Prophet's biography (Seerah)
- Philosophy of religion

The more you upload, the more grounded and precise the AI becomes.

### File Support

- ✅ `.pdf` — text-based PDFs (not scanned images)
- ✅ `.txt` — plain text files
- ⚠️ Scanned PDFs — saved as placeholder, not searchable

### Arabic/Unicode Filenames

Fully supported. Vector IDs are generated using a SHA-1 hash of the filename, so Arabic, Urdu, or any Unicode filename works without errors.

---

## 🏋️ Training Workflow

### Step 1 — Set Your Persona

In the **Train AI** page, define:

- **Persona Name**: e.g. `Intellectual Islamic Defender`
- **Core Logic & Strategy**: The instructions that shape how the AI reasons. Use the "Load Default" button for a strong starting template that includes the Kalam, Fine-Tuning, Moral, and Historical arguments.

### Step 2 — Upload Your Books

Go to the **Global Knowledge Base** section and upload your PDF/TXT files. Each upload is automatically indexed into Pinecone. You'll see:

- `● Pinecone` — fully indexed and searchable
- `○ MongoDB only` — uploaded before Pinecone was configured

### Step 3 — Re-index Existing Books (if needed)

If you had books uploaded before Pinecone was set up, run:

```bash
node scripts/reindex-pinecone.js
```

Or click the **Re-index All Books into Pinecone** button in the Train AI page.

---

## 🤖 AI Reasoning Framework

Every response is guided by a structured reasoning system built into the system prompt:

1. **Understand the question deeply** — identify if the user is confused, skeptical, or adversarial
2. **Search the knowledge base first** — always use retrieved passages as primary evidence
3. **Structured argumentation** — strongest point first, then evidence, then pre-empt counter-arguments
4. **Intellectual honesty** — acknowledge complexity within Islamic scholarship when it exists
5. **Warm tone** — confident and engaging, never aggressive or dismissive
6. **Cite sources** — responses include `📚 Sources referenced: [filename]` when knowledge was used

---

## 🚀 Deployment

### Local Development

```bash
npm install
npm run dev
```

### Production (Vercel)

The `vercel.json` is pre-configured. Just push to your connected repo.

Make sure all environment variables are set in your Vercel project settings.

---

## 📡 API Reference

| Method | Endpoint                              | Auth  | Description                    |
| ------ | ------------------------------------- | ----- | ------------------------------ |
| POST   | `/api/auth/register`                  | —     | Register user                  |
| POST   | `/api/auth/login`                     | —     | Login                          |
| GET    | `/api/auth/me`                        | User  | Get current user               |
| GET    | `/api/chat/conversations`             | User  | List conversations             |
| POST   | `/api/chat/conversations`             | User  | Create conversation            |
| POST   | `/api/chat/conversations/:id/message` | User  | Send message (triggers RAG)    |
| DELETE | `/api/chat/conversations/:id`         | User  | Delete conversation            |
| GET    | `/api/training/persona`               | User  | Get active persona             |
| POST   | `/api/training/persona`               | User  | Save persona                   |
| GET    | `/api/training/knowledge`             | Admin | List uploaded files            |
| POST   | `/api/training/knowledge/upload`      | Admin | Upload + auto-index PDF/TXT    |
| DELETE | `/api/training/knowledge/:fileName`   | Admin | Remove file from KB + Pinecone |
| GET    | `/api/training/knowledge/status`      | Admin | Check Pinecone config status   |
| POST   | `/api/training/knowledge/reindex`     | Admin | Re-index all KB into Pinecone  |
| GET    | `/api/health`                         | —     | Server health check            |
