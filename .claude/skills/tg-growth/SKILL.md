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
