# ✈️ Telegram Growth Intelligence

AI-powered growth analytics for your Telegram channel. Collect real post metrics, understand your audience, track competitors, and generate weekly content strategy — all running locally on your machine.

---

## Two Ways to Use This

### 🧠 Option A: Claude Skill (Recommended)
Talk to Claude in plain language to analyze your channel, collect data, and get growth insights — right from your terminal or Claude.ai. Claude reads your channel data and does the thinking for you.

### 📊 Option B: Local Dashboard
A visual React dashboard at `localhost:5173` with charts, AI analysis cards, and agent second opinions.

**You can use both together.**

---

## Option A: Install as a Claude Skill

### What you can say to Claude once installed:
- *"Analyze my Telegram channel"*
- - *"Who is my audience?"*
  - - *"Collect fresh data from my channel"*
    - - *"Generate a content calendar for this week"*
      - - *"Which channels amplify my content?"*
        - - *"Start the dashboard"*
          - - *"Track @competitorchannel"*
           
            - ### Installation
           
            - **Step 1: Clone the repo**
            - ```bash
              git clone https://github.com/dittoanec/tg-growth
              cd tg-growth
              ```

              **Step 2: Copy the skill file to your Claude skills folder**
              ```bash
              mkdir -p ~/.claude/skills/tg-growth
              cp .claude/skills/tg-growth/SKILL.md ~/.claude/skills/tg-growth/SKILL.md
              ```

              **Step 3: Configure your keys**
              ```bash
              cp .env.example .env
              ```

              Edit `.env` and fill in:
              ```env
              CHANNEL_USERNAME=your_channel_username
              TG_API_ID=12345678
              TG_API_HASH=abcdef1234567890abcdef
              CLAUDE_API_KEY=sk-ant-...
              COLLECTOR_TOKEN=any-random-string
              VITE_COLLECTOR_TOKEN=same-random-string-as-above
              ```

              **Step 4: Install dependencies**
              ```bash
              npm install
              pip3 install telethon python-dotenv
              ```

              **Step 5: First data collection**
              On first run, Telethon will ask for your phone number + a Telegram OTP to authenticate. This is a one-time step.
              ```bash
              python3 collect_data.py
              ```

              After that, open Claude and say **"analyze my Telegram channel"** — Claude will pick up the skill automatically.

              ### Getting Your Keys

              | Key | Where to get it |
              |-----|----------------|
              | `TG_API_ID` + `TG_API_HASH` | [my.telegram.org](https://my.telegram.org) → API development tools → Create app |
              | `CLAUDE_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
              | `COLLECTOR_TOKEN` | Make up any random string |

              > ⚠️ **Security:** `.env` and `tg_growth_session.session` are in `.gitignore`. Never commit them — the session file is full Telegram account access.
              >
              > ---
              >
              > ## Option B: Local Dashboard
              >
              > **1. Install dependencies**
              > ```bash
              > npm install
              > pip3 install telethon python-dotenv
              > ```
              >
              > **2. Set up your keys**
              > ```bash
              > cp .env.example .env
              > ```
              >
              > **3. Collect your data**
              > ```bash
              > python3 collect_data.py
              > ```
              >
              > **4. Run the dashboard**
              > ```bash
              > npm run dev
              > ```
              > Opens at http://localhost:5173
              >
              > **5. (Optional) Run the collector backend for live refresh**
              > ```bash
              > python3 collect_data.py --serve
              > ```
              > Runs on http://localhost:3456
              >
              > ### Dashboard Features
              >
              > | Tab | What's inside |
              > |-----|--------------|
              > | 👥 **Audience** | Persona Analysis, Reaction Decoder, Persona Drift, Unified Profile |
              > | 📝 **Content** | Engagement Patterns, Content Gap Report, 7-day Calendar |
              > | 🔍 **Network** | Forward Chains, Tracked Channels, Topic Shift Radar |
              > | 📡 **Overview** | Subscriber Signal Analyzer, quick stats |
              > | ⚙️ **Settings** | API keys, channel config, Slack webhook |
              >
              > Each analysis card has **3 AI agent second opinions:**
              > - 📈 Growth Strategist
              > - - 📊 Data Analyst
              >   - - 🎯 Audience Researcher
              >    
              >     - ---
              >
              > ## How Data Collection Works
              >
              > Uses **Telethon (MTProto)** — not the Bot API — because:
              > - The Bot API cannot read channel post history
              > - - The Bot API cannot access view counts, forward counts, or reactions
              >   - - Only MTProto can pull full channel history with all metrics
              >    
              >     - On first run, Telethon asks for your phone number + a Telegram OTP. After that, the session file handles auth automatically.
              >    
              >     - ---
              >
              > ## Slack Integration (Optional)
              >
              > Add your Slack webhook to `.env` or the Settings tab:
              > ```env
              > VITE_SLACK_WEBHOOK=https://hooks.slack.com/services/...
              > ```
              >
              > Auto-posts: persona updates, weekly gap reports, topic shift radar, content calendars.
              >
              > ---
              >
              > ## Architecture
              >
              > ```
              > Local browser (Vite + React)
              > ├── python3 collect_data.py --serve  (port 3456)
              > │   ├── Telethon MTProto  →  reads your Telegram channel
              > │   ├── Claude API (server-side)  →  powers AI analysis
              > │   └── channel_data.json  →  local data store
              > └── npm run dev  (port 5173)  →  dashboard UI
              > ```
              >
              > No cloud backend. Everything runs on your machine.
              >
              > ---
              >
              > ## Troubleshooting
              >
              > **pip3 asks for Xcode on macOS**
              > Download Command Line Tools manually:
              > 1. Go to [developer.apple.com/download/all/](https://developer.apple.com/download/all/)
              > 2. 2. Search "Command Line Tools", download the `.dmg`
              >    3. 3. Run the `.pkg` installer
              >       4. 4. Re-run `pip3 install telethon`
              >         
              >          5. **Port already in use**
              >          6. ```bash
              >             lsof -ti :5173 | xargs kill -9
              >             lsof -ti :3456 | xargs kill -9
              >             ```
              >
              > **Telethon session expired**
              > Delete `tg_growth_session.session` and re-run `python3 collect_data.py`.
              >
              > **Dashboard shows "No real post data"**
              > ```bash
              > python3 collect_data.py
              > cp channel_data.json public/channel_data.json
              > ```
