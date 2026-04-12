# ✈️ Telegram Growth Intelligence — Local Dashboard

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up your keys (pick one method)

# Option A: .env file (recommended)
cp .env.example .env
# Edit .env and add your keys

# Option B: Enter keys in the dashboard Settings tab after launching

# 3. Run
npm run dev

# Opens at http://localhost:5173
```

## What You Need

| Key | Required | Where to get it |
|-----|----------|----------------|
| **Claude API Key** | Yes | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| **Telegram Bot Token** | Yes | @BotFather on Telegram → `/newbot` |
| **Slack Webhook** | Optional | [api.slack.com/apps](https://api.slack.com/apps) → Incoming Webhooks |

## Features

### 👥 Persona Analysis
- Engagement pattern mining (what formats/topics your audience engages with)
- Comment persona extraction (what your followers talk about and want)
- Reaction sentiment decoder (emoji patterns → emotional response map)
- Unified persona profile builder

### 🔍 Similar Channel Analysis
- Forward chain tracker (who amplifies your content)
- Manual channel deep dives (paste any @channel link)
- Topic shift radar (weekly niche trend detection)

### 🧠 Weekly Analyst
- Content ↔ Persona gap reports
- Persona drift detection (monthly)
- Auto-generated 7-day content calendar

### 🤖 Agent Reviews
Every analysis card has 3 AI agents you can run for additional perspectives:
- **📈 Growth Strategist** — actionable growth recommendations
- **📊 Data Analyst** — quantitative patterns and benchmarks
- **🎯 Audience Researcher** — behavioral persona insights

### 📱 Slack Integration
Reports auto-post to Slack when webhook is configured:
- Persona profile updates
- Weekly gap reports
- Topic shift radar
- Content calendars

## Architecture

```
Local browser (Vite + React)
    ├── Telegram Bot API (direct, free)
    ├── Claude API (your key, ~$5-15/mo for solo use)
    ├── Slack Webhooks (optional)
    └── localStorage (all state persists between sessions)
```

No backend needed. Everything runs in your browser.

## Keys Security
- Keys entered in Settings are stored in **localStorage** (your browser only)
- Keys in `.env` are embedded at build time by Vite
- Nothing is sent to any server except the APIs themselves
- **Never commit your `.env` file** — it's in `.gitignore`
