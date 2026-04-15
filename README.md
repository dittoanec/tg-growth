# ✈️ Telegram Growth Intelligence

AI-powered growth analytics for your Telegram channel. Understand your audience, see what content works, find out who's leaving and why, and track which channels amplify your posts — all running locally on your computer.

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

This tool has **5 focused features**, organized as tabs in a local dashboard. Each one answers a specific question about your channel:

### 📈 1. Overview — "How's my channel doing?"
At-a-glance summary of your channel's health.

**What you get:**
- Member count, post count, recent activity snapshot
- **Subscriber Signal Analyzer** — flags anomaly days (sudden view drops, leave spikes, growth bursts) and explains likely causes

**How to use it:** Open the dashboard, Overview tab — or say *"detect signals"* in Claude

---

### 👥 2. Audience Persona Analysis
Reads your last 200 posts and figures out who your audience actually is based on how they engage.

**What you get:**
- A profile of your typical follower (interests, content preferences, engagement style)
- Which post formats they respond to most (text, photo, video)
- Which topics get the most reactions vs. forwards
- How your audience has shifted over the past few months

**How to use it:** Say *"analyze my audience"* in Claude

---

### 📊 3. Content Performance Report
Looks at what you've already posted and ranks it by real metrics.

**What you get:**
- Your top 10 posts by views, with a breakdown of why they worked
- Your top 5 most-forwarded posts
- Patterns across your best content — topics, formats, timing
- Gaps — topics your audience wants but you haven't covered yet

**How to use it:** Say *"analyze my content performance"* in Claude

---

### 📉 4. Retention — "Who's leaving and why?"
The killer feature. Pinpoints the exact posts that triggered unsubscribes, and the ones that brought new people in.

**What you get:**
- Subscriber trend chart (joins, leaves, net change over time)
- Top 5 churn-triggering posts (drove people to leave)
- Top 5 inflow-driving posts (pulled new people in)
- 7-day and 30-day net change
- AI Retention Coach — actionable advice on what to do differently

**Important:** This feature needs a few days of data to be useful, because Telegram only keeps the last ~48 hours of join/leave events. The setup wizard installs a background scheduler that quietly collects this data every 12 hours so it accumulates over time.

**How to use it:** Say *"analyze retention"* in Claude, or open the Retention tab in the dashboard

---

### 🔍 5. Channel Network Analysis
Tracks which other Telegram channels are amplifying your content and what your competitors are posting.

**What you get:**
- A list of channels that have forwarded your posts
- How many members those channels have
- Which of your posts get forwarded most and by whom
- **Topic Shift Radar** — alerts you when tracked competitors change what they post about
- Track any channel by name to add it to your watchlist

**How to use it:** Say *"analyze my channel network"* or *"track @channelname"* in Claude

---

> ⚠️ **What this tool does NOT do:** It won't write posts for you, manage your channel, reply to messages, or post on your behalf. It only reads your channel data and gives you analysis.

---

## The dashboard

A local web dashboard runs in your browser at `http://localhost:5173` with all 5 features as tabs. Start it with:

> "start the dashboard"

Behind the scenes this launches a small local server (port 3456) that the dashboard talks to for data collection and Claude analysis.

---

## Background data collection

A scheduled agent (macOS launchd) runs `collect_data.py` every 12 hours so your join/leave history accumulates and the Retention tab has data to work with. The setup wizard installs this for you. You can also manage it manually:

```bash
bash scripts/install_scheduler.sh    # install
launchctl list | grep tggrowth        # check status
tail -f scheduler.log                 # watch log
bash scripts/uninstall_scheduler.sh  # remove
```

---

## How it works

Uses **Telethon (MTProto)** — not the Bot API — because the Bot API cannot read post history, view counts, or reactions. Only MTProto pulls full channel history with all metrics.

On first run, Telegram asks for your phone number + a verification code (like logging into a new device). After that it's automatic. You can see and revoke this "device" in your Telegram app under **Settings → Devices**.

Everything runs **on your own computer** — your data never leaves your machine except for the analysis prompts sent to Claude.

---

## What you'll need

- A Mac or PC with internet access (background scheduler is macOS-only)
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

**Retention tab says "not enough data"**
The scheduler needs 3+ days of running to accumulate join/leave history. Check it's installed: `launchctl list | grep tggrowth`
