# 🧠 AnonymousThinker Backend — Developer AI Training Guide

> [!IMPORTANT]
> **Developer Only**: AI Training and Knowledge Base features are restricted to the **Admin** role only. Regular users cannot access these features.

This guide explains how you, as the developer, can train the AI to prove Islamic truth and respectfully refute other religions using logic.

---

## 🔐 Gaining Admin Access
To use the training features in the app, you must promote your account to the `admin` role:
1. Register an account in the frontend.
2. Open a terminal in the `backend/scripts` folder.
3. Run: `node makeAdmin.js your-email@example.com`
4. Log out and log back in. The **"Train AI"** button will now appear in your sidebar.

---

## 🏗️ The Training Workflow

### 1. Define your Persona
Use the **Train AI** page to set your "Core System Prompt."
- **Islamic Defense Strategy**: Tell the AI to search the Knowledge Base and use logical proofs to show why Islam is the final, complete truth.
- **Tone**: Instruct it to be "Intellectually Rigorous, Respectful, and Firm."

### 2. Knowledge Base (PDF/Text)
Upload scholarly proof, refutations of atheism, and comparative religion logic.
- The AI uses **Global RAG**: Any user who chats with AnonymousThinker will now receive answers grounded in the specific knowledge YOU upload.

### 3. Response Guidance
Provide "few-shot" examples of how to reject specific atheistic claims or misconceptions about other religions. Focus on logic and historical evidence.

---

## 🚀 Deployment
Once your Knowledge Base and Persona are set, the AI is "trained" globally.

- To export your data for weight-level fine-tuning on Hugging Face, use the **JSONL Export** in settings.

---

## 🔬 Comparative Analysis
Use the **Comparison Mode** feature to see how standard AI (like Llama-3 70B) responds versus your **Grounded Islamic AI**. This helps you identify gaps where you need to upload more knowledge.