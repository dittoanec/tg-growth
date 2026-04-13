# ✈️ Telegram Growth Intelligence

AI-powered growth analytics for your Telegram channel. Collect real post metrics, understand your audience, track competitors, and generate weekly content strategy — all running locally on your machine.

---

## Two Ways to Use This

### 🧠 Option A: Claude Skill (Recommended)
Talk to Claude in plain language to analyze your channel, collect data, and get growth insights. Claude reads your channel data and does the thinking for you.

### 📊 Option B: Local Dashboard
A visual React dashboard at `localhost:5173` with charts, AI analysis cards, and agent second opinions.

**You can use both together.**

---

## Option A: Install as a Claude Skill

### What you can say to Claude once installed:

- "Analyze my Telegram channel"
- "Who is my audience?"
- "Collect fresh data from my channel"
- "Generate a content calendar for this week"
- "Which channels amplify my content?"
- "Start the dashboard"
- "Track @competitorchannel"

### Install the skill (one command)

```bash
mkdir -p ~/.claude/skills/tg-growth && \
curl -fsSL https://raw.githubusercontent.com/dittoanec/tg-growth/main/.claude/skills/tg-growth/SKILL.md \
  -o ~/.claude/skills/tg-growth/SKILL.md
```

That's it. Open Claude and say **"analyze my Telegram channel"** — Claude will pick up the skill and walk you through the rest.

### What Claude will ask you on first use:

1. Where you cloned or downloaded the project
2. Your Telegram channel username
3. Your API keys (see below)

### Getting Your Keys

| Key | Where to get it |
|-----|----------------|
| `TG_API_ID` + `TG_API_HASH` | [my.telegram.org](https://my.telegram.org) → API development tools → Create app |
| `CLAUDE_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `COLLECTOR_TOKEN` | Make up any random string |

### Setting up the project (one-time)

```bash
git clone https://github.com/dittoanec/tg-growth
cd tg-growth
cp .env.example .env
# Edit .env and fill in your keys
npm install
pip3 install telethon python-dotenv
python3 collect_data.py  # first data collection — will ask for phone + OTP once
```

> ⚠️ **Security:** `.env` and `tg_growth_session.session` are in `.gitignore`. Never commit them — the session file is full Telegram account access.

---

## Option B: Local Dashboard

**1. Clone and install**
```bash
git clone https://github.com/dittoanec/tg-growth
cd tg-growth
npm install
pip3 install telethon python-dotenv
```

**2. Configure**
```bash
cp .env.example .env
# Fill in your keys
```

**3. Collect data**
```bash
python3 collect_data.py
```

**4. Run**
```bash
npm run dev                      # dashboard at http://localhost:5173
python3 collect_data.py --serve  # optional: live refresh API at http://localhost:3456
```

### Dashboard Tabs

| Tab | What's inside |
|-----|--------------|
| 👥 **Audience** | Persona Analysis, Reaction Decoder, Persona Drift, Unified Profile |
| 📝 **Content** | Engagement Patterns, Content Gap Report, 7-day Calendar |
| 🔍 **Network** | Forward Chains, Tracked Channels, Topic Shift Radar |
| 📡 **Overview** | Subscriber Signal Analyzer, quick stats |
| ⚙️ **Settings** | API keys, channel config, Slack webhook |

Each card has **3 AI agent second opinions:** 📈 Growth Strategist, 📊 Data Analyst, 🎯 Audience Researcher.

---

## How Data Collection Works

Uses **Telethon (MTProto)** — not the Bot API — because:

- The Bot API cannot read channel post history
- The Bot API cannot access view counts, forward counts, or reactions
- Only MTProto can pull full channel history with all metrics

On first run, Telethon asks for your phone number + a Telegram OTP. After that, the session file handles auth automatically.

---

## Slack Integration (Optional)

```env
VITE_SLACK_WEBHOOK=https://hooks.slack.com/services/...
```

Auto-posts: persona updates, weekly gap reports, topic shift radar, content calendars.

---

## Architecture

```
Local browser (Vite + React)
├── python3 collect_data.py --serve  (port 3456)
│   ├── Telethon MTProto  →  your Telegram channel
│   ├── Claude API (server-side)  →  AI analysis
│   └── channel_data.json  →  local data store
└── npm run dev  (port 5173)  →  dashboard UI
```

No cloud backend. Everything runs on your machine.

---

## Troubleshooting

**pip3 asks for Xcode on macOS**
Download Command Line Tools manually: [developer.apple.com/download/all/](https://developer.apple.com/download/all/) → search "Command Line Tools" → download the `.dmg` → run the `.pkg`

**Port already in use**
```bash
lsof -ti :5173 | xargs kill -9
lsof -ti :3456 | xargs kill -9
```

**Telethon session expired**
Delete `tg_growth_session.session` and re-run `python3 collect_data.py`

**Dashboard shows "No real post data"**
```bash
python3 collect_data.py
cp channel_data.json public/channel_data.json
```
