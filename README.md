<img width="1680" height="883" alt="image" src="https://github.com/user-attachments/assets/b54e2adb-defb-48e1-af79-cb8404538d4b" />

# 🤖 AI Support Agent

An intelligent AI-powered Support Agent built with **Next.js**, **Vercel AI SDK**, and **TypeScript** that answers user queries using Retrieval-Augmented Generation (RAG) and real-time web search.

## ✨ Features

- 💬 Conversational AI chat interface
- 🔍 Intelligent routing between knowledge base and web search
- 📚 Retrieval-Augmented Generation (RAG)
- 🌐 Real-time web search for up-to-date information
- ⚡ Streaming AI responses
- 🧠 Context-aware conversations
- 📱 Responsive UI
- 🎨 Modern chat experience

---

## 🏗️ Architecture

The agent follows a hybrid retrieval strategy:

```
                User Query
                     │
                     ▼
              AI Decision Layer
                     │
         ┌───────────┴───────────┐
         │                       │
 Need Internal Knowledge?      General Query
         │                       │
        Yes                     No
         │                       │
         ▼                       ▼
   Vector Database         LLM Response
         │
         ▼
Need Real-Time Information?
         │
    ┌────┴────┐
    │         │
   Yes       No
    │         │
    ▼         ▼
Web Search   Vector Search
    │         │
    └────┬────┘
         ▼
      AI Response
```

---

## 🛠️ Tech Stack

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

### AI
- Vercel AI SDK
- Google Gemini 
- Tool Calling
- Streaming Responses

### Retrieval
- RAG
- supasbase pg vector database
- Semantic Search

### Backend
- Node.js

---

## 🔄 Agent Workflow

1. User submits a query.
2. The AI determines whether retrieval is required.
3. If no retrieval is needed, the LLM responds directly.
4. If retrieval is required:
   - Uses Vector Search for internal knowledge.
   - Uses Web Search for real-time information.
5. Retrieved context is sent back to the LLM.
6. The AI generates a grounded response.


## 👨‍💻 Author

**Rachit Garg**

- LinkedIn: https://linkedin.com/in/rachitgarg56
- GitHub: https://github.com/Rachitgarg56
