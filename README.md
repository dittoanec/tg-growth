# ✈️ Telegram Growth Intelligence

AI-powered growth analytics for your Telegram channel. Understand your audience, see what content works, and track which channels amplify your posts — all running locally on your computer.

---

## Getting started (2 steps)

**Step 1: Install the skill**

Open your Terminal and paste this:

```bash
mkdir -p ~/.claude/skills/tg-growth && curl -fsSL https://raw.githubusercontent.com/dittoanec/tg-growth/main/.claude/skills/tg-growth/SKILL.md -o ~/.claude/skills/tg-growth/SKILL.md
```

**Step 2: Let Claude guide you**

Open [claude.ai](https://claude.ai) and say:

> "Set up tg-growth"

Claude will walk you through the entire setup one step at a time — getting your API keys, downloading the project, connecting your Telegram account, and collecting your first data. No need to read a manual.

---

## What it does

This tool has **3 specific features**. It's not a general assistant — each feature does one focused thing:

### 👥 1. Audience Persona Analysis
Reads your last 200 posts and figures out who your audience actually is based on how they engage.

**What you get:**
- A profile of your typical follower (interests, content preferences, engagement style)
- Which post formats they respond to most (text, photo, video)
- Which topics get the most reactions vs. forwards
- How your audience has shifted over the past few months

**How to use it:** Say *"analyze my audience"* in Claude

---

### 📊 2. Content Performance Report
Looks at what you've already posted and ranks it by real metrics.

**What you get:**
- Your top 10 posts by views, with a breakdown of why they worked
- Your top 5 most-forwarded posts
- Patterns across your best content — topics, formats, timing
- Gaps — topics your audience wants but you haven't covered yet

**How to use it:** Say *"analyze my content performance"* in Claude

---

### 🔍 3. Channel Network Analysis
Tracks which other Telegram channels are amplifying your content.

**What you get:**
- A list of channels that have forwarded your posts
- How many members those channels have
- Which of your posts get forwarded most and by whom
- Topic trends across channels in your niche

**How to use it:** Say *"analyze my channel network"* in Claude

---

> ⚠️ **What this tool does NOT do:** It won't write posts for you, manage your channel, reply to messages, or post on your behalf. It only reads your channel data and gives you analysis.

---

## How it works

Uses **Telethon (MTProto)** — not the Bot API — because the Bot API cannot read post history, view counts, or reactions. Only MTProto pulls full channel history with all metrics.

On first run, Telegram asks for your phone number + a verification code (like logging into a new device). After that it's automatic. You can see and revoke this "device" in your Telegram app under **Settings → Devices**.

---

## What you'll need

- A Mac or PC with internet access
- A Telegram account (the one that owns your channel)
- A Claude account with a Pro or Max plan — [claude.ai](https://claude.ai)
- ~15 minutes for first-time setup (Claude will guide you through all of it)

---

## Troubleshooting

**pip3 asks for Xcode on macOS**
Run `xcode-select --install` in Terminal first — a popup will appear, click Install and wait ~10 minutes.

**Port already in use**
```bash
lsof -ti :5173 | xargs kill -9
lsof -ti :3456 | xargs kill -9
```

**Telegram session expired**
Delete `tg_growth_session.session` and re-run `python3 collect_data.py`

**Dashboard shows no data**
```bash
python3 collect_data.py
cp channel_data.json public/channel_data.json
```
