# Retention Tab + Scheduled Collection — Design Spec

**Date:** 2026-04-14
**Status:** Approved, ready for implementation plan

## Problem

The dashboard currently has no surface dedicated to subscriber retention. It captures `daily_member_changes` (joins/leaves/net) via the MTProto admin log, but:

- Telegram's admin log only keeps ~48h of events, so without scheduled collection the history has permanent gaps.
- The existing Subscriber Signal Analyzer (Overview tab) does coarse day-level anomaly detection but never correlates specific posts to specific gains/losses.
- Users asking "what content causes inflow/outflow?" have no answer today.

Competitors like TeleChurn solve a slice of this (churn-as-a-bot), but miss the AI-reasoning + content-attribution layer that makes insights actionable.

## Goal

Ship a Retention tab that answers three questions:

1. **Is my channel growing or bleeding?** (trend over time)
2. **Which posts drive people away?** (post → leaves attribution)
3. **Which posts bring people in?** (post → joins attribution)

Plus an AI retention coach that explains *why* and recommends actions.

Ship alongside a launchd scheduler that runs `collect_data.py` every 12h so the data actually accumulates.

## Non-goals

- Cohort retention view (need months of data to be meaningful — v1.1)
- Churn rate trendline (same — v1.1)
- Per-event timestamps (admin log gives us day-level data; we work with that)
- Exit surveys / reason-for-leaving prompts (TeleChurn has this in dev; out of scope)

## User flow

1. User installs `tg-growth` skill → says "set up tg-growth"
2. Skill now also installs a launchd agent that runs `collect_data.py` every 12h
3. Data accumulates silently in `channel_data.json`
4. User opens dashboard weekly → clicks Retention tab
5. Sees 4 cards: trend chart, top churn-triggering posts, top inflow-driving posts, AI retention coach
6. Acts on insights; iterates on content strategy

## Architecture

```
┌─────────────────────────────────────────────────┐
│  launchd agent (every 12h)                      │
│  com.davidyseo.tggrowth.collector.plist         │
│    → python3 collect_data.py                    │
│    → merges new admin log events into           │
│      channel_data.json["daily_member_changes"]  │
└─────────────────────────────────────────────────┘
                       ↓
              channel_data.json
           (accumulates over time)
                       ↓
┌─────────────────────────────────────────────────┐
│  Dashboard — Retention tab                      │
│                                                 │
│  src/lib/attribution.js                         │
│  attributeEvents(posts, memberChanges, 24)      │
│    → { attributedLeaves, attributedJoins,       │
│        ambientLeaves, ambientJoins, trend }     │
│                                                 │
│  src/components/RetentionTab.jsx                │
│  Renders 4 cards from attribution output        │
└─────────────────────────────────────────────────┘
```

## Components

### New files

| File | Purpose |
|---|---|
| `scripts/com.davidyseo.tggrowth.collector.plist` | launchd agent definition. Runs `collect_data.py` every 12h. Loaded via `launchctl load` into `~/Library/LaunchAgents/`. |
| `scripts/install_scheduler.sh` | Copies plist to LaunchAgents, substitutes absolute paths, loads agent. Idempotent — unloads first if already present. |
| `src/lib/attribution.js` | Pure function `attributeEvents(posts, memberChanges, windowHours=24)`. No React, no side effects. Unit-testable. |
| `src/lib/attribution.test.js` | Unit tests for `attributeEvents`. |
| `src/components/RetentionTab.jsx` | React component rendering the 4 cards. |

### Modified files

| File | Change |
|---|---|
| `src/App.jsx` | Register `<RetentionTab />` as a new tab between Audience and Network. |
| `.claude/skills/tg-growth/SKILL.md` | Document new Retention tab + scheduled collection. Add `install-scheduler` command. |

## Attribution algorithm

```
INPUT:
  posts: [{id, date (ISO), text, ...}]
  memberChanges: { "2026-04-12": {joins: N, leaves: N, net: N}, ... }
  windowHours: 24 (configurable)

OUTPUT:
  {
    attributedLeaves: [{postId, postDate, postText, leaves, post}],
    attributedJoins: [{postId, ..., joins}],
    ambientLeaves: number,  // leaves with no post in window
    ambientJoins: number,
    trend: [{date, joins, leaves, net}]  // sorted ascending
  }

ALGORITHM:
  for each day D in memberChanges:
    find posts where post.date is within windowHours before end-of-day D
    if posts exist:
      assign all leaves/joins for day D to the most recent such post
    else:
      add day D's leaves/joins to ambient buckets
```

**Limitation noted in UI:** `daily_member_changes` is day-bucketed, so a 24h window is effectively "same-day or previous-day posts." The UI surfaces this as "Post X (Apr 12) → 5 leaves on Apr 12-13" rather than claiming hour-precision.

**Tiebreaker when multiple posts in window:** most-recent post gets full credit. (Alternative considered: split proportionally — rejected as harder to explain and gives fractional counts.)

## UI: 4 cards on Retention tab

### Card 1: Trend chart
Line chart, x = date, three lines: joins (green), leaves (red), net (blue dashed). Default view: last 30 days. Toggles for 7d / 30d / all-time.

### Card 2: Top churn-triggering posts
Ranked list of posts with most attributed leaves. Shows post snippet (first 150 chars), date, leaves count, and views. Limit 10. Includes "Ambient churn: N leaves not attributed to any post" footer.

### Card 3: Top inflow-driving posts
Same shape as Card 2 but for joins.

### Card 4: AI retention coach
Button: "Get weekly retention insights." On click, posts summary to `/api/claude`:
- Trend summary (net growth past 7/30 days)
- Top 5 churn-triggering posts (text snippets + leave counts)
- Top 5 inflow-driving posts
- Request: identify patterns, explain causes, recommend 3 actions

Result renders as tagged sections like other analysis cards (`PATTERN:`, `CAUSE:`, `RECOMMENDATION:`).

## Empty states

| Condition | Render |
|---|---|
| `channel_data.json` missing | Redirect to setup instructions |
| `memberChanges` empty or <3 days | "Retention data needs at least a few days to show trends. Come back after your scheduled collector has been running for a week." |
| Scheduler not installed | Yellow banner: "Scheduled collection is not installed. Run `install-scheduler` to enable automatic updates." |

## Error handling

| Failure mode | Behavior |
|---|---|
| Missing `daily_member_changes` key | Treat as empty object, show empty state |
| Collection run fails (network, auth) | launchd retries on next 12h cycle; dashboard shows "Last collected X hours ago" so user can spot staleness |
| Claude API failure on AI coach | Per-card retry button, doesn't block other cards rendering |
| Launchd plist malformed | `install_scheduler.sh` validates with `plutil -lint` before loading |

## Testing

### Unit tests (`src/lib/attribution.test.js`)
- Empty input → empty output
- Single post + single day of leaves → attributed correctly
- Post outside window → leaves go to ambient
- Multiple posts same day + leaves → most-recent post gets credit
- Multiple days with mixed coverage
- Trend array sorted ascending

### Integration
- Load current `channel_data.json` (197 posts, ~2 days churn) → render Retention tab → verify cards show something sensible
- Empty state rendering

### Scheduler
- Run `install_scheduler.sh` → verify plist loads (`launchctl list | grep tggrowth`)
- Trigger manually (`launchctl kickstart`) → verify `collect_data.py` runs and updates `channel_data.json`

## Skill integration

`SKILL.md` gets new command triggers:

- **"install scheduler" / "schedule collection"** → runs `install_scheduler.sh`
- **"retention" / "churn" / "who's leaving"** → opens dashboard on Retention tab, or runs analyze flow if dashboard not open
- **"analyze retention"** → loads channel_data.json, runs attribution, sends to Claude for insights (works even without the dashboard open)

Update the "Analysis Cards" table in SKILL.md to include the new **Retention** tab with its 4 cards.

## Security & privacy

No new secrets. No new external services. launchd plist runs `collect_data.py` locally with existing `.env` credentials. `channel_data.json` remains gitignored. No change to security posture.

## Rollout

Single PR. No feature flag — it's additive (new tab, new script, existing analysis untouched).

## Open questions

None. All design decisions locked in:
- Scope: full vision (C)
- Cadence: scheduled 12h collection + weekly user review (B)
- Attribution rule: 24h window, day-bucketed, most-recent-post tiebreaker (B)
- Cards: 4 — trend, top churn posts, top inflow posts, AI coach (B)
