---
name: tg-growth
description: Telegram Growth Intelligence — collect channel data via Telethon MTProto, start dashboard, run AI-powered analysis on @davidanecdotekr with real post metrics (views, forwards, reactions, media types)
allowed-tools: Bash Read Write Edit Grep Glob
---

# TG Growth Intelligence

You are managing a Telegram channel growth analytics system for @davidanecdotekr (channel name: "Anecdote"). The project lives at:

```
/Users/david/Library/Mobile Documents/com~apple~CloudDocs/tg-growth
```

Always `cd` to this directory before running any commands.

---

## How Data Collection Works

### Telethon (MTProto) — NOT the Bot API

The system uses **Telethon**, a Python library that connects to Telegram as the user's **personal account** (not a bot). This is necessary because:
- The Telegram Bot API **cannot** read channel post history
- The Bot API **cannot** access view counts, forward counts, or detailed reaction data
- Only the MTProto protocol (what Telethon uses) can pull full channel history with all metrics

### Authentication Chain

1. `TG_API_ID` and `TG_API_HASH` in `.env` — obtained from https://my.telegram.org (app credentials)
2. `tg_growth_session.session` — a SQLite file that stores the authenticated Telegram session (equivalent to being logged in). **This file IS the user's Telegram account access. Treat as TOP SECRET. Never copy, display, or transmit it.**
3. On first run, Telethon prompts for phone number + OTP. After that, the session file handles auth automatically.

### What `collect_data.py` Pulls

For each of the last 200 posts from @davidanecdotekr, Telethon's `client.get_messages()` returns a Message object. `extract_post()` converts each into:

```json
{
  "id": 4399,                          // Telegram message ID
  "date": "2026-01-30T07:00:57+00:00", // UTC ISO timestamp
  "text": "Full post text content...",   // The actual post text
  "views": 443,                         // Total view count
  "forwards": 2,                        // How many times forwarded to other channels
  "replies": 0,                         // Reply count (if discussion group linked)
  "reactions": [                        // Per-emoji breakdown
    {"emoji": "🔥", "count": 12},
    {"emoji": "👍", "count": 8}
  ],
  "reaction_total": 20,                // Sum of all reaction counts
  "media_type": "none|photo|video|audio|document|image",
  "has_link": false,                    // Whether text contains "http"
  "text_length": 342,                   // Character count of text
  "edit_date": null                     // ISO timestamp if post was edited
}
```

Media type detection: photo → "photo", video mime → "video", audio mime → "audio", image mime → "image", other document → "document", no media → "none".

### channel_data.json Structure

The full output file has 5 top-level keys:

```json
{
  "summary": {
    "channel": "davidanecdotekr",
    "title": "Anecdote",
    "description": "",
    "member_count": 4194,              // Live count at collection time
    "total_posts_collected": 197,
    "date_range": { "from": "ISO...", "to": "ISO..." },
    "collected_at": "ISO...",          // When this snapshot was taken
    "stats": {
      "avg_views": 1215,
      "max_views": 15192,
      "avg_forwards": 8.1,
      "max_forwards": 96,
      "posts_with_media": 85,
      "posts_with_links": 53,
      "avg_reactions": 2.9
    }
  },
  "posts": [ /* array of 197 post objects as described above */ ],
  "daily_stats": {
    "2026-01-30": {
      "posts": 8,
      "total_views": 5027,
      "total_reactions": 8,
      "total_forwards": 32,
      "avg_views": 628,
      "contents": [                    // Truncated post summaries for that day
        { "text": "first 200 chars...", "views": 443, "forwards": 2, "reactions": 0, "media_type": "none" }
      ]
    }
  },
  "daily_member_changes": {
    "2026-04-12": { "joins": 2, "leaves": 2, "net": 0 }
    // NOTE: Telegram admin log only keeps ~48h of join/leave events.
    // Each collection MERGES new events with previously saved history.
    // More frequent collection = more complete leave/join data over time.
  },
  "forward_chains": {
    "chains": [
      {
        "post_id": 4500,
        "post_text": "first 150 chars...",
        "post_views": 5000,
        "post_forwards": 45,
        "public_forwards_found": 12,
        "forwarders": [
          { "channel": "username", "title": "Channel Name", "members": 5000, "date": "ISO...", "views": 200 }
        ]
      }
    ],
    "amplifiers": {
      "channelname": { "count": 25, "name": "Display Name", "total_views": 48, "members": 41 }
    }
  }
}
```

Forward chains use Telegram's `GetMessagePublicForwardsRequest` — requires channel stats access (500+ members or admin). Shows which public channels forwarded each post.

### tracked_channels.json Structure

Same structure as channel_data.json but keyed by channel name:
```json
{
  "web3subin": {
    "summary": { /* same as above */ },
    "posts": [ /* same post objects */ ],
    "daily_stats": { /* same */ }
  }
}
```

Tracked channels are listed in `tracked_list.json` (simple array of usernames).

---

## Collector HTTP API (port 3456)

`python3 collect_data.py --serve` starts a local HTTP server. **All requests require auth header:**
```
Authorization: Bearer <COLLECTOR_TOKEN from .env>
```

CORS is locked to `http://localhost:5173` only.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/collect-own` | Re-collect @davidanecdotekr — pulls 200 posts, forward chains, admin log. Saves to channel_data.json + public/channel_data.json. Takes ~30-60s. Returns summary JSON. |
| GET | `/collect?channel=name` | Collect a competitor channel on demand. Saves to tracked_channels.json + public/tracked_channels.json. Takes ~15-30s. |
| GET | `/status` | List available tracked channels. |
| POST | `/api/claude` | Claude API proxy. Body: `{"system": "...", "user": "...", "max_tokens": 2000}`. Returns `{"ok": true, "text": "..."}`. The CLAUDE_API_KEY stays server-side in .env — never exposed to the browser. |

### Why the Proxy Exists

The Claude API key used to be embedded in the frontend JavaScript (visible to anyone inspecting the page). Now all Claude calls route through `/api/claude` on the collector backend, keeping the key server-side.

---

## Dashboard (port 5173)

React + Vite single-page app (`src/App.jsx`). Uses two-panel layout:

### Tab Structure

| Tab | Purpose | Analysis Cards |
|-----|---------|---------------|
| **Overview** | "How's my channel doing?" | Subscriber Signal Analyzer (anomaly detection on daily views/reactions/leaves) |
| **Content** | "What should I post?" | Engagement Patterns, Content Gap Report, Content Calendar |
| **Audience** | "Who's my audience?" | Audience Persona, Reaction Decoder, Persona Drift, Unified Profile |
| **Network** | "What are others doing?" | Forward Chains, Tracked Channels, Topic Shift Radar |
| **Settings** | Configuration | Bot token, channel name, niche, Slack webhook |

### How the Dashboard Uses Data

1. On page load, fetches `/channel_data.json` (static file from `public/`)
2. `summarizeForLLM(data)` condenses 197 posts into a text summary:
   - Top 10 posts by views (with actual text, view count, forwards, reactions, media type)
   - Top 5 by forwards
   - Last 10 posts (most recent)
   - Format distribution (how many photo/video/text posts)
   - Reaction breakdown (emoji → count across all posts)
   - Posting hour distribution (KST)
3. This summary is prepended to every Claude prompt so analysis is based on **real data**
4. If no data file exists, a `⚠️ NO REAL POST DATA` warning is shown — Claude generates generic estimates clearly labeled as such

### Agent Second Opinions

Each analysis result has a "Get second opinions" toggle with 3 agents:
- Growth Strategist — actionable growth recommendations
- Data Analyst — quantitative patterns and benchmarks
- Audience Researcher — behavioral persona insights

Agents receive BOTH the raw channel data AND the prior analysis, so they analyze actual numbers.

---

## Security Model

| Item | Location | Risk |
|------|----------|------|
| `TG_API_ID` / `TG_API_HASH` | .env | App credentials — not account access alone |
| `tg_growth_session.session` | project root | **FULL TELEGRAM ACCOUNT ACCESS** — never expose |
| `CLAUDE_API_KEY` | .env (server-side only) | API billing — never sent to browser |
| `COLLECTOR_TOKEN` | .env + VITE_COLLECTOR_TOKEN | Auth for collector API — prevents unauthorized calls |
| Bot token | localStorage in browser | Limited to Bot API capabilities |

The `.env` file is in `.gitignore`. The session file is in `.gitignore`. Both sync to iCloud (known trade-off).

---

## Commands

Based on `$ARGUMENTS`:

### "start" or "run" or empty
Start the full system:
1. Check ports 5173 and 3456 — skip what's already running
2. Start `python3 collect_data.py --serve` in background
3. Start `npm run dev` in background
4. Wait for both to be ready, report URLs

### "collect" or "refresh" or "snapshot"
Fresh data collection:
1. If collector API is up (port 3456), call `/collect-own` with auth header
2. Otherwise run `python3 collect_data.py` directly
3. Ensure `public/channel_data.json` is updated
4. Report: post count, member count, date range, avg views, max views

### "stop"
Kill processes on ports 5173 and 3456.

### "status"
Report: ports in use, data file age, summary stats from channel_data.json.

### "analyze <topic>"
Load channel_data.json, build summarizeForLLM-style summary, run analysis.
Topics: engagement, forwards, audience, gaps, calendar, signals, reactions, drift.
Always use real data — never hallucinate metrics.

### "track <channel>"
Add to tracked_list.json, collect via API if running.

### Anything else
Interpret intent and help. Always use real data when available. Never fabricate channel metrics.
