---
name: tg-growth
description: >
  Telegram Growth Intelligence — analyze, collect, and grow any Telegram channel using AI-powered persona analysis, competitor tracking, and weekly content strategy. Use this skill whenever the user mentions their Telegram channel, wants to analyze Telegram post performance, track competitors, understand their audience, generate content ideas, run the tg-growth dashboard, collect channel data, or grow a Telegram following. Also trigger when the user says "set up tg-growth", "install tg-growth", "help me get started", or "guide me through setup". Trigger on phrases like "my channel", "analyze my Telegram", "collect data", "run the dashboard", "who is my audience", "forward chains", "topic shift", "persona", or "weekly analyst".
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# Telegram Growth Intelligence

An AI-powered growth system for Telegram channel owners. Analyzes real post metrics across 3 features: Audience Persona, Content Performance, and Channel Network Analysis.

---

## Setup Wizard

When the user says anything like "set up", "get started", "install", "help me set up", or "guide me" — run this interactive wizard. Ask ONE question at a time. Wait for their answer before moving to the next step. Never dump all steps at once.

### Step 0: Check what's already done

Before asking anything, check silently:
```bash
ls ~/.claude/skills/tg-growth/SKILL.md 2>/dev/null \u0026\u0026 echo "skill_installed" || echo "no_skill"
```

The skill is already installed (they're talking to you), so skip to checking the project:

```bash
# Ask the user: "Do you already have the tg-growth project downloaded?"
# If yes → ask where it is and cd there
# If no → guide them to clone it (Step 1)
```

### Step 1: Clone the project (if not already done)

Tell them:
> "First, let's download the project. Open your Terminal and paste this:"

```bash
git clone https://github.com/dittoanec/tg-growth
cd tg-growth
```

Ask: "Done? Let me know when you're in the tg-growth folder."

> Once they confirm, set PROJECT_PATH to wherever they cloned it (default: ~/tg-growth).

### Step 2: Telegram API credentials

Tell them:
> "Now we need to connect to your Telegram account. This lets the tool read your channel's real data — views, reactions, who forwarded your posts. Here's how to get your credentials:"
>
> 1. Go to **my.telegram.org** in your browser
> 2. Log in with your Telegram phone number
> 3. Click **"API development tools"**
> 4. Fill in any app name (e.g. "my growth tool") and click **Create application**
> 5. You'll see **App api_id** (a number) and **App api_hash** (a long string) — copy both

Ask: "Got your api_id and api_hash? Paste them here and I'll set them up for you. (Don't worry — I won't store or share them.)"

When they paste → save to memory for the .env step.

### Step 3: Claude API key

Tell them:
> "Next, your Claude API key. This is what powers the analysis."
>
> 1. Go to **console.anthropic.com**
> 2. Click **API Keys** in the left menu → **Create Key**
> 3. Copy the key (starts with `sk-ant-...`)

Ask: "Got it? Paste it here."

### Step 4: Create the .env file

Now create the .env file automatically:

```bash
cd $PROJECT_PATH
cp .env.example .env
```

Then write their values into it:
```bash
# Use sed or direct write to fill in CHANNEL_USERNAME, TG_API_ID, TG_API_HASH, CLAUDE_API_KEY
# Also set COLLECTOR_TOKEN and VITE_COLLECTOR_TOKEN to a random string
```

Ask: "What's your Telegram channel username? (without the @)"

When they answer, fill in CHANNEL_USERNAME too.

Tell them: "Setting up your config file now..."

### Step 5: Install dependencies

```bash
cd $PROJECT_PATH
npm install \u0026\u0026 pip3 install telethon python-dotenv
```

Tell them: "Installing required tools — this takes 1–3 minutes. Let me know when it finishes."

If they get an Xcode error on Mac:
> "You need to install Mac developer tools first. Run this and click Install when a popup appears:"
> `xcode-select --install`
> "Once that finishes (~10 mins), run the install command again."

### Step 6: First Telegram login

Tell them:
> "Almost there! This next step connects to your Telegram account for the first time — like logging into a new device. Telegram will send you a verification code."

```bash
cd $PROJECT_PATH
python3 collect_data.py
```

Tell them:
> "Enter your phone number with country code (e.g. +82 10 1234 5678), then enter the code Telegram sends you. This only happens once — after this it logs in automatically."
>
> "You can see this 'device' in your Telegram app under Settings → Devices, and revoke it any time."

Ask: "Did it finish successfully? You should see something like 'Saved X posts'."

### Step 7: Move data to dashboard

```bash
cp channel_data.json public/channel_data.json
```

### Step 8: Setup complete!

Tell them:
> "You're all set! Here's what you can do now:"
>
> - **"Analyze my audience"** — find out who your followers are and what they want
> - **"Analyze my content performance"** — see which posts worked best and why
> - **"Analyze my channel network"** — see which channels share your content
>
> To refresh your data weekly, just say **"collect fresh data"**.
>
> To open the visual dashboard, say **"start the dashboard"**.
>
> What would you like to analyze first?

---

## Commands

### `start` / `run` / `start the dashboard`
```bash
lsof -i :5173 -i :3456 2>/dev/null | grep LISTEN
python3 collect_data.py --serve \u0026
npm run dev \u0026
```
Tell them: Dashboard at http://localhost:5173

### `collect` / `refresh` / `collect fresh data`
```bash
python3 collect_data.py \u0026\u0026 cp channel_data.json public/channel_data.json
```

### `stop`
```bash
lsof -ti :5173 | xargs kill -9 2>/dev/null
lsof -ti :3456 | xargs kill -9 2>/dev/null
```

### `status`
```bash
lsof -i :5173 -i :3456 2>/dev/null | grep LISTEN
python3 -c "import json; d=json.load(open('channel_data.json')); s=d['summary']; print(s['total_posts_collected'], s['member_count'], s['collected_at'][:10])"
```

### `analyze audience` / `analyze my audience`
Load channel_data.json, summarize top posts by engagement patterns, build behavioral persona profile. Always use real data. Never fabricate metrics.

### `analyze content` / `analyze my content`
Load channel_data.json, rank posts by views and forwards, identify top-performing formats and topics, flag content gaps.

### `analyze network` / `analyze my channel network`
Load forward_chains from channel_data.json, identify amplifier channels, map which posts get shared most and by whom.

### `track <@channel>`
```bash
curl -s -H "Authorization: Bearer $COLLECTOR_TOKEN" "http://localhost:3456/collect?channel=channelname"
```

### Anything else
Interpret intent and help. Always use real data when available. Never fabricate metrics.

---

## How Data Collection Works

Uses Telethon (MTProto) — not the Bot API — because:
- Bot API cannot read channel post history
- Bot API cannot access view/forward counts or reactions
- Only MTProto pulls full channel history with all metrics

On first run: phone + OTP verification (one-time). After that, tg_growth_session.session handles auth automatically. NEVER share or commit the session file — it is full Telegram account access.

---

## Data Structure (channel_data.json)

Five top-level keys: summary, posts, daily_stats, daily_member_changes, forward_chains.

Each post: id, date, text, views, forwards, replies, reactions[], reaction_total, media_type, has_link, text_length.

daily_member_changes only covers ~48h of admin log — collect frequently for complete history.

---

## Troubleshooting

Port in use: `lsof -ti :5173 | xargs kill -9`
Session expired: delete tg_growth_session.session, re-run python3 collect_data.py
No data in dashboard: run python3 collect_data.py then cp channel_data.json public/
pip3/Xcode issues on Mac: run `xcode-select --install` first
---
name: tg-growth
description: >
  Telegram Growth Intelligence — analyze, collect, and grow any Telegram channel using AI-powered persona analysis, competitor tracking, and weekly content strategy. Use this skill whenever the user mentions their Telegram channel, wants to analyze Telegram post performance, track competitors, understand their audience, generate content ideas, run the tg-growth dashboard, collect channel data, or grow a Telegram following. Trigger on phrases like "my channel", "analyze my Telegram", "collect data", "run the dashboard", "who is my audience", "content calendar", "forward chains", "topic shift", "persona", or "weekly analyst".
  allowed-tools: Bash, Read, Write, Edit, Grep, Glob
  ---

  # Telegram Growth Intelligence

  An AI-powered growth system for Telegram channel owners. Collects real post metrics via Telethon (MTProto), serves them to a local React dashboard, and runs Claude-powered analysis across 4 pillars: Persona, Channel Intel, Weekly Analyst, and Subscriber Signals.

  ---

  ## First-Time Setup

  Before running any commands, check if the user has configured the project:

  ```bash
cat .env 2>/dev/null | grep CHANNEL_USERNAME
```

If no config found, walk the user through setup:

1. **Project path** — where did they clone the repo? (`git clone https://github.com/dittoanec/tg-growth`)
2. 2. **Channel username** — their Telegram channel handle (e.g. `mychannel`, without @)
   3. 3. **Telegram API credentials** — from https://my.telegram.org -> API development tools -> create app -> copy api_id and api_hash
      4. 4. **Claude API key** — from https://console.anthropic.com -> API Keys
         5. 5. **Telegram Bot Token** (optional) — from @BotFather on Telegram
           
            6. Then create their .env:
           
            7. ```bash
               cp .env.example .env
               # Fill in: CHANNEL_USERNAME, TG_API_ID, TG_API_HASH, CLAUDE_API_KEY, COLLECTOR_TOKEN, VITE_COLLECTOR_TOKEN
               ```

               Install dependencies:
               ```bash
               npm install \u0026\u0026 pip3 install telethon python-dotenv
               ```

               ---

               ## Commands

               Always cd to the project directory first.

               ### start / run
               ```bash
               lsof -i :5173 -i :3456 2>/dev/null | grep LISTEN
               python3 collect_data.py --serve \u0026
               npm run dev \u0026
               ```
               Report: Dashboard at http://localhost:5173, Collector at http://localhost:3456

               ### collect / refresh / snapshot
               ```bash
               curl -s -H "Authorization: Bearer $COLLECTOR_TOKEN" http://localhost:3456/collect-own
               # Or if collector not running:
               python3 collect_data.py
               ```
               Report: post count, member count, date range, avg views, max views.

               ### stop
               ```bash
               lsof -ti :5173 | xargs kill -9 2>/dev/null
               lsof -ti :3456 | xargs kill -9 2>/dev/null
               ```

               ### status
               ```bash
               lsof -i :5173 -i :3456 2>/dev/null | grep LISTEN
               python3 -c "import json; d=json.load(open('channel_data.json')); s=d['summary']; print(s['total_posts_collected'], s['member_count'], s['collected_at'][:10])"
               ```

               ### analyze <topic>
               Load channel_data.json and analyze. Topics: engagement, audience/persona, forwards/network, gaps, calendar, signals, reactions, drift.
               Always use real data. Never fabricate metrics.

               ### track <@channel>
               ```bash
               curl -s -H "Authorization: Bearer $COLLECTOR_TOKEN" "http://localhost:3456/collect?channel=channelname"
               ```

               ### Anything else
               Interpret intent and help. Use real data when available.

               ---

               ## How Data Collection Works

               Uses Telethon (MTProto) — not the Bot API — because the Bot API cannot read post history, view counts, forward counts, or reactions. Only MTProto pulls full channel history with all metrics.

               Authentication: TG_API_ID + TG_API_HASH from my.telegram.org + tg_growth_session.session file.
               First run: enter phone + OTP. After that the session file handles auth automatically.
               NEVER share or commit the .session file — it is full Telegram account access.

               ---

               ## Data Structure (channel_data.json)

               Five top-level keys: summary, posts, daily_stats, daily_member_changes, forward_chains.

               Each post: id, date, text, views, forwards, replies, reactions[], reaction_total, media_type, has_link, text_length.

               daily_member_changes only covers ~48h of admin log — collect frequently for complete history.

               ---

               ## Collector HTTP API (port 3456)

               Requires: Authorization: Bearer <COLLECTOR_TOKEN>

               GET /collect-own — re-collect user's channel (~30-60s)
               GET /collect?channel=name — collect a competitor channel (~15-30s)
               GET /status — list tracked channels and data freshness
               POST /api/claude — Claude API proxy (keeps CLAUDE_API_KEY server-side, never in browser)

               ---

               ## Dashboard (port 5173)

               Tabs: Overview | Content (Engagement Patterns, Gap Report, Calendar) | Audience (Persona, Reaction Decoder, Drift, Unified Profile) | Network (Forward Chains, Tracked Channels, Topic Shift Radar) | Settings

               Each card has 3 AI agent second opinions: Growth Strategist, Data Analyst, Audience Researcher.

               ---

               ## Security

               tg_growth_session.session = FULL TELEGRAM ACCOUNT ACCESS — never expose or commit.
               CLAUDE_API_KEY stays server-side via /api/claude proxy.
               Both .env and *.session are in .gitignore.

               ---

               ## Troubleshooting

               Port in use: lsof -ti :5173 | xargs kill -9
               Session expired: delete tg_growth_session.session, re-run python3 collect_data.py
               No data in dashboard: run python3 collect_data.py then cp channel_data.json public/
               pip3/Xcode issues on macOS: download CLT from developer.apple.com/download/all/
---
name: tg-growth
description: >
  Telegram Growth Intelligence — analyze, collect, and grow any Telegram channel using AI-powered persona analysis, competitor tracking, and weekly content strategy. Use this skill whenever the user mentions their Telegram channel, wants to analyze Telegram post performance, track competitors, understand their audience, generate content ideas, run the tg-growth dashboard, collect channel data, or grow a Telegram following. Also trigger when the user says "set up tg-growth", "install tg-growth", "help me get started", or "guide me through setup". Trigger on phrases like "my channel", "analyze my Telegram", "collect data", "run the dashboard", "who is my audience", "forward chains", "topic shift", "persona", or "weekly analyst".
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# Telegram Growth Intelligence

An AI-powered growth system for Telegram channel owners. Analyzes real post metrics across 3 features: Audience Persona, Content Performance, and Channel Network Analysis.

---

## Setup Wizard

When the user says anything like "set up", "get started", "install", "help me set up", or "guide me" — run this interactive wizard. Ask ONE question at a time. Wait for their answer before moving to the next step. Never dump all steps at once.

### Step 0: Check what's already done

Before asking anything, check silently:
```bash
ls ~/.claude/skills/tg-growth/SKILL.md 2>/dev/null && echo "skill_installed" || echo "no_skill"
```

The skill is already installed (they're talking to you), so skip to checking the project:

```bash
# Ask the user: "Do you already have the tg-growth project downloaded?"
# If yes → ask where it is and cd there
# If no → guide them to clone it (Step 1)
```

### Step 1: Clone the project (if not already done)

Tell them:
> "First, let's download the project. Open your Terminal and paste this:"

```bash
git clone https://github.com/dittoanec/tg-growth
cd tg-growth
```

Ask: "Done? Let me know when you're in the tg-growth folder."

### Step 2: Telegram API credentials

Tell them:
> "Now we need to connect to your Telegram account. This lets the tool read your channel's real data — views, reactions, who forwarded your posts. Here's how to get your credentials:"
>
> 1. Go to **my.telegram.org** in your browser
> 2. Log in with your Telegram phone number
> 3. Click **"API development tools"**
> 4. Fill in any app name (e.g. "my growth tool") and click **Create application**
> 5. You'll see **App api_id** (a number) and **App api_hash** (a long string) — copy both

Ask: "Got your api_id and api_hash? Paste them here and I'll set them up for you. (Don't worry — I won't store or share them.)"

When they paste → save to memory for the .env step.

### Step 3: Claude API key

Tell them:
> "Next, your Claude API key. This is what powers the analysis."
>
> 1. Go to **console.anthropic.com**
> 2. Click **API Keys** in the left menu → **Create Key**
> 3. Copy the key (starts with `sk-ant-...`)

Ask: "Got it? Paste it here."

### Step 4: Create the .env file

Now create the .env file automatically:

```bash
cd [their project path]
cp .env.example .env
```

Then write their values into it:
```bash
# Use sed or direct write to fill in CHANNEL_USERNAME, TG_API_ID, TG_API_HASH, CLAUDE_API_KEY
# Also set COLLECTOR_TOKEN and VITE_COLLECTOR_TOKEN to a random string
```

Ask: "What's your Telegram channel username? (without the @)"

When they answer, fill in CHANNEL_USERNAME too.

Tell them: "Setting up your config file now..."

### Step 5: Install dependencies

```bash
cd [their project path]
npm install && pip3 install telethon python-dotenv
```

Tell them: "Installing required tools — this takes 1–3 minutes. Let me know when it finishes."

If they get an Xcode error on Mac:
> "You need to install Mac developer tools first. Run this and click Install when a popup appears:"
> `xcode-select --install`
> "Once that finishes (~10 mins), run the install command again."

### Step 6: First Telegram login

Tell them:
> "Almost there! This next step connects to your Telegram account for the first time — like logging into a new device. Telegram will send you a verification code."

```bash
cd [their project path]
python3 collect_data.py
```

Tell them:
> "Enter your phone number with country code (e.g. +82 10 1234 5678), then enter the code Telegram sends you. This only happens once — after this it logs in automatically."
>
> "You can see this 'device' in your Telegram app under Settings → Devices, and revoke it any time."

Ask: "Did it finish successfully? You should see something like 'Saved X posts'."

### Step 7: Move data to dashboard

```bash
cp channel_data.json public/channel_data.json
```

### Step 8: Setup complete!

Tell them:
> "You're all set! Here's what you can do now:"
>
> - **"Analyze my audience"** — find out who your followers are and what they want
> - **"Analyze my content performance"** — see which posts worked best and why
> - **"Analyze my channel network"** — see which channels share your content
>
> To refresh your data weekly, just say **"collect fresh data"**.
>
> To open the visual dashboard, say **"start the dashboard"**.
>
> What would you like to analyze first?

---

## Commands

### `start` / `run` / `start the dashboard`
```bash
lsof -i :5173 -i :3456 2>/dev/null | grep LISTEN
python3 collect_data.py --serve &
npm run dev &
```
Tell them: Dashboard at http://localhost:5173

### `collect` / `refresh` / `collect fresh data`
```bash
python3 collect_data.py && cp channel_data.json public/channel_data.json
```

### `stop`
```bash
lsof -ti :5173 | xargs kill -9 2>/dev/null
lsof -ti :3456 | xargs kill -9 2>/dev/null
```

### `status`
```bash
lsof -i :5173 -i :3456 2>/dev/null | grep LISTEN
python3 -c "import json; d=json.load(open('channel_data.json')); s=d['summary']; print(s['total_posts_collected'], s['member_count'], s['collected_at'][:10])"
```

### `analyze audience` / `analyze my audience`
Load channel_data.json, summarize top posts by engagement patterns, build behavioral persona profile. Always use real data. Never fabricate metrics.

### `analyze content` / `analyze my content`
Load channel_data.json, rank posts by views and forwards, identify top-performing formats and topics, flag content gaps.

### `analyze network` / `analyze my channel network`
Load forward_chains from channel_data.json, identify amplifier channels, map which posts get shared most and by whom.

### `track <@channel>`
```bash
curl -s -H "Authorization: Bearer $COLLECTOR_TOKEN" "http://localhost:3456/collect?channel=channelname"
```

### Anything else
Interpret intent and help. Always use real data when available. Never fabricate metrics.

---

## How Data Collection Works

Uses Telethon (MTProto) — not the Bot API — because:
- Bot API cannot read channel post history
- Bot API cannot access view/forward counts or reactions
- Only MTProto pulls full channel history with all metrics

On first run: phone + OTP verification (one-time). After that, tg_growth_session.session handles auth automatically. NEVER share or commit the session file — it is full Telegram account access.

---

## Data Structure (channel_data.json)

Five top-level keys: summary, posts, daily_stats, daily_member_changes, forward_chains.

Each post: id, date, text, views, forwards, replies, reactions[], reaction_total, media_type, has_link, text_length.

daily_member_changes only covers ~48h of admin log — collect frequently for complete history.

---

## Troubleshooting

Port in use: `lsof -ti :5173 | xargs kill -9`
Session expired: delete tg_growth_session.session, re-run python3 collect_data.py
No data in dashboard: run python3 collect_data.py then cp channel_data.json public/
pip3/Xcode issues on Mac: run `xcode-select --install` first
---
name: tg-growth
description: >
  Telegram Growth Intelligence — analyze, collect, and grow any Telegram channel using AI-powered persona analysis, competitor tracking, and weekly content strategy. Use this skill whenever the user mentions their Telegram channel, wants to analyze Telegram post performance, track competitors, understand their audience, generate content ideas, run the tg-growth dashboard, collect channel data, or grow a Telegram following. Trigger on phrases like "my channel", "analyze my Telegram", "collect data", "run the dashboard", "who is my audience", "content calendar", "forward chains", "topic shift", "persona", or "weekly analyst".
  allowed-tools: Bash, Read, Write, Edit, Grep, Glob
  ---

  # Telegram Growth Intelligence

  An AI-powered growth system for Telegram channel owners. Collects real post metrics via Telethon (MTProto), serves them to a local React dashboard, and runs Claude-powered analysis across 4 pillars: Persona, Channel Intel, Weekly Analyst, and Subscriber Signals.

  ---

  ## First-Time Setup

  Before running any commands, check if the user has configured the project:

  ```bash
cat .env 2>/dev/null | grep CHANNEL_USERNAME
```

If no config found, walk the user through setup:

1. **Project path** — where did they clone the repo? (`git clone https://github.com/dittoanec/tg-growth`)
2. 2. **Channel username** — their Telegram channel handle (e.g. `mychannel`, without @)
   3. 3. **Telegram API credentials** — from https://my.telegram.org -> API development tools -> create app -> copy api_id and api_hash
      4. 4. **Claude API key** — from https://console.anthropic.com -> API Keys
         5. 5. **Telegram Bot Token** (optional) — from @BotFather on Telegram
           
            6. Then create their .env:
           
            7. ```bash
               cp .env.example .env
               # Fill in: CHANNEL_USERNAME, TG_API_ID, TG_API_HASH, CLAUDE_API_KEY, COLLECTOR_TOKEN, VITE_COLLECTOR_TOKEN
               ```

               Install dependencies:
               ```bash
               npm install && pip3 install telethon python-dotenv
               ```

               ---

               ## Commands

               Always cd to the project directory first.

               ### start / run
               ```bash
               lsof -i :5173 -i :3456 2>/dev/null | grep LISTEN
               python3 collect_data.py --serve &
               npm run dev &
               ```
               Report: Dashboard at http://localhost:5173, Collector at http://localhost:3456

               ### collect / refresh / snapshot
               ```bash
               curl -s -H "Authorization: Bearer $COLLECTOR_TOKEN" http://localhost:3456/collect-own
               # Or if collector not running:
               python3 collect_data.py
               ```
               Report: post count, member count, date range, avg views, max views.

               ### stop
               ```bash
               lsof -ti :5173 | xargs kill -9 2>/dev/null
               lsof -ti :3456 | xargs kill -9 2>/dev/null
               ```

               ### status
               ```bash
               lsof -i :5173 -i :3456 2>/dev/null | grep LISTEN
               python3 -c "import json; d=json.load(open('channel_data.json')); s=d['summary']; print(s['total_posts_collected'], s['member_count'], s['collected_at'][:10])"
               ```

               ### analyze <topic>
               Load channel_data.json and analyze. Topics: engagement, audience/persona, forwards/network, gaps, calendar, signals, reactions, drift.
               Always use real data. Never fabricate metrics.

               ### track <@channel>
               ```bash
               curl -s -H "Authorization: Bearer $COLLECTOR_TOKEN" "http://localhost:3456/collect?channel=channelname"
               ```

               ### Anything else
               Interpret intent and help. Use real data when available.

               ---

               ## How Data Collection Works

               Uses Telethon (MTProto) — not the Bot API — because the Bot API cannot read post history, view counts, forward counts, or reactions. Only MTProto pulls full channel history with all metrics.

               Authentication: TG_API_ID + TG_API_HASH from my.telegram.org + tg_growth_session.session file.
               First run: enter phone + OTP. After that the session file handles auth automatically.
               NEVER share or commit the .session file — it is full Telegram account access.

               ---

               ## Data Structure (channel_data.json)

               Five top-level keys: summary, posts, daily_stats, daily_member_changes, forward_chains.

               Each post: id, date, text, views, forwards, replies, reactions[], reaction_total, media_type, has_link, text_length.

               daily_member_changes only covers ~48h of admin log — collect frequently for complete history.

               ---

               ## Collector HTTP API (port 3456)

               Requires: Authorization: Bearer <COLLECTOR_TOKEN>

               GET /collect-own — re-collect user's channel (~30-60s)
               GET /collect?channel=name — collect a competitor channel (~15-30s)
               GET /status — list tracked channels and data freshness
               POST /api/claude — Claude API proxy (keeps CLAUDE_API_KEY server-side, never in browser)

               ---

               ## Dashboard (port 5173)

               Tabs: Overview | Content (Engagement Patterns, Gap Report, Calendar) | Audience (Persona, Reaction Decoder, Drift, Unified Profile) | Network (Forward Chains, Tracked Channels, Topic Shift Radar) | Settings

               Each card has 3 AI agent second opinions: Growth Strategist, Data Analyst, Audience Researcher.

               ---

               ## Security

               tg_growth_session.session = FULL TELEGRAM ACCOUNT ACCESS — never expose or commit.
               CLAUDE_API_KEY stays server-side via /api/claude proxy.
               Both .env and *.session are in .gitignore.

               ---

               ## Troubleshooting

               Port in use: lsof -ti :5173 | xargs kill -9
               Session expired: delete tg_growth_session.session, re-run python3 collect_data.py
               No data in dashboard: run python3 collect_data.py then cp channel_data.json public/
               pip3/Xcode issues on macOS: download CLT from developer.apple.com/download/all/
