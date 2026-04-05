# تثبّت من كل حاجة — ZvenDenLabs Verification Suite

ZvenDenLabs Verification Suite ("مثبّت") is a 4-tool misinformation verification platform built for MenaCraft Hackathon 2026 (The Trust Crisis).

## What This Project Is

This repository contains a single Node.js + Express web app that exposes four verification tools through one interface:

1. AI media authenticity checking
2. Image-caption consistency checking
3. Text authenticity/manipulation detection
4. Real-time claim fact-checking with cited sources

## The 4 Tools

| Tool | What it does | Primary APIs/Models | Tier |
|---|---|---|---|
| 🖼️ كاشف الصور والفيديو (AI Media Detector) | Detects whether uploaded media appears AI-generated | Groq (Llama 4 Scout Vision) | Freemium |
| 🔗 محقق التطابق (Consistency Checker) | Checks if an image matches its caption/context | Groq (Llama 4 Scout Vision) | Freemium |
| 📝 كاشف النص (TruthLens) | Classifies text as Human / AI / Manipulated | Groq (LLaMA 3.3 70B) | Freemium |
| 🔍 مثبّت (Melle5er Fact-Checker) | Searches evidence and returns verdict + sources in Derja/French | Tavily + Firecrawl + Anthropic Claude Sonnet | Premium |

## 🔍 Melle5er — WhatsApp Fact-Checker Agent

Melle5er is the premium AI agent component of the suite. It runs on OpenClaw (an open-source self-hosted AI gateway) and is connected to WhatsApp. It uses Claude Sonnet with real-time web search via Tavily to fact-check any claim sent by a user.

The agent is not included in this repo — it runs as a live service and will be demonstrated live during the presentation.

Live demo: send any claim to the agent on WhatsApp during the presentation.

## How To Run

### Prerequisites

- Node.js 18+ (Node 20+ recommended)
- npm

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local `.env` file with the required keys:

```env
PORT=3000
GROQ_API_KEY=your_key
TAVILY_API_KEY=your_key
FIRECRAWL_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
```

3. Start the server:

```bash
node server.js
```

4. Open in browser:

```text
http://localhost:3000
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Frontend | Vanilla HTML/CSS/JS (served from `public/`) |
| File upload handling | Multer |
| Config management | dotenv |
| AI/LLM providers | Groq, Anthropic |
| Search & extraction | Tavily, Firecrawl |

## Project Structure

- `server.js` — Express API + tool orchestration
- `public/index.html` — main UI
- `public/app.js` — frontend interactions and API calls
- `package.json` — scripts and dependencies

## Pitch Context

- Problem: misinformation spread and trust erosion
- Positioning: Arabic-first verification workflow for MENA
- Model: Tools 1-3 as freemium infrastructure, Tool 4 as premium agent product
