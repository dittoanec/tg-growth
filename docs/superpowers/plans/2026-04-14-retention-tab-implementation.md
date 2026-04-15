# Retention Tab + Scheduled Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Retention tab to the tg-growth dashboard that attributes join/leave events to specific posts, backed by a launchd agent that collects data every 12 hours.

**Architecture:** Pure-function attribution layer (`src/lib/attribution.js`, unit-tested) separates business logic from rendering. A new `RetentionTab.jsx` component consumes attribution output and renders four cards. A macOS launchd plist plus an install shell script keep `channel_data.json` fresh in the background. No changes to the Python collector or backend.

**Tech Stack:** React 18 + Vite (existing), Vitest (new, added in Task 1), macOS launchd (cron alternative), Python Telethon (existing).

**Spec:** `docs/superpowers/specs/2026-04-14-retention-tab-design.md`

---

## File Structure

### New files
| File | Purpose |
|---|---|
| `src/lib/attribution.js` | Pure function `attributeEvents(posts, memberChanges, windowHours)`. No React, no I/O. |
| `src/lib/attribution.test.js` | Vitest unit tests for `attributeEvents`. |
| `src/components/RetentionTab.jsx` | React component rendering the 4 retention cards. |
| `scripts/com.davidyseo.tggrowth.collector.plist.template` | launchd plist template with `__ABSOLUTE_PATH__` placeholders. |
| `scripts/install_scheduler.sh` | Substitutes absolute paths into the template, copies to `~/Library/LaunchAgents/`, loads via `launchctl`. Idempotent. |
| `scripts/uninstall_scheduler.sh` | Unloads and removes the plist. |
| `vitest.config.js` | Minimal Vitest config. |

### Modified files
| File | Change |
|---|---|
| `package.json` | Add `vitest` devDependency and `test` script. |
| `src/App.jsx:860` | Add `retention` entry to `TABS` array and render `<RetentionTab />`. |
| `.claude/skills/tg-growth/SKILL.md` | Document Retention tab, new "install scheduler" / "analyze retention" commands, update tab table. |

---

## Task 1: Set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

- [ ] **Step 1: Install vitest**

Run:
```bash
cd "/Users/david/Library/Mobile Documents/com~apple~CloudDocs/tg-growth"
npm install --save-dev vitest@^2
```
Expected: adds `vitest` to devDependencies, updates package-lock.json.

- [ ] **Step 2: Add test script to package.json**

Modify `package.json` — inside `"scripts"`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Create vitest config**

Create `vitest.config.js`:

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
  },
});
```

- [ ] **Step 4: Verify vitest runs (with no tests yet)**

Run: `npm test`
Expected: exits 0 with "No test files found" or similar. Not an error — just confirms vitest is wired up.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "Add vitest for unit testing"
```

---

## Task 2: Attribution function (TDD)

**Files:**
- Create: `src/lib/attribution.js`
- Create: `src/lib/attribution.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/lib/attribution.test.js`:

```js
import { describe, it, expect } from "vitest";
import { attributeEvents } from "./attribution.js";

const mkPost = (id, dateStr, text = "") => ({
  id,
  date: dateStr,
  text: text || `post ${id}`,
  views: 100,
  forwards: 0,
  reactions: [],
  reaction_total: 0,
  media_type: "none",
});

describe("attributeEvents", () => {
  it("returns empty result for empty input", () => {
    const r = attributeEvents([], {}, 24);
    expect(r.attributedLeaves).toEqual([]);
    expect(r.attributedJoins).toEqual([]);
    expect(r.ambientLeaves).toBe(0);
    expect(r.ambientJoins).toBe(0);
    expect(r.trend).toEqual([]);
  });

  it("attributes same-day leaves to a post published that day", () => {
    const posts = [mkPost(1, "2026-04-10T10:00:00+00:00", "hot take")];
    const mc = { "2026-04-10": { joins: 2, leaves: 5, net: -3 } };
    const r = attributeEvents(posts, mc, 24);

    expect(r.attributedLeaves).toHaveLength(1);
    expect(r.attributedLeaves[0].postId).toBe(1);
    expect(r.attributedLeaves[0].leaves).toBe(5);
    expect(r.attributedJoins[0].joins).toBe(2);
    expect(r.ambientLeaves).toBe(0);
  });

  it("puts leaves in ambient bucket when no post is in window", () => {
    const posts = [mkPost(1, "2026-04-01T10:00:00+00:00")];
    const mc = { "2026-04-10": { joins: 0, leaves: 4, net: -4 } };
    const r = attributeEvents(posts, mc, 24);

    expect(r.attributedLeaves).toEqual([]);
    expect(r.ambientLeaves).toBe(4);
  });

  it("gives credit to the most recent post when multiple exist in window", () => {
    const posts = [
      mkPost(1, "2026-04-10T09:00:00+00:00", "morning"),
      mkPost(2, "2026-04-10T22:00:00+00:00", "evening"),
    ];
    const mc = { "2026-04-10": { joins: 0, leaves: 3, net: -3 } };
    const r = attributeEvents(posts, mc, 24);

    expect(r.attributedLeaves).toHaveLength(1);
    expect(r.attributedLeaves[0].postId).toBe(2);
    expect(r.attributedLeaves[0].leaves).toBe(3);
  });

  it("treats previous-day posts as in-window for a 24h window", () => {
    const posts = [mkPost(1, "2026-04-09T23:00:00+00:00", "late night")];
    const mc = { "2026-04-10": { joins: 1, leaves: 2, net: -1 } };
    const r = attributeEvents(posts, mc, 24);

    expect(r.attributedLeaves[0].postId).toBe(1);
    expect(r.attributedLeaves[0].leaves).toBe(2);
  });

  it("sorts trend ascending by date", () => {
    const mc = {
      "2026-04-12": { joins: 1, leaves: 1, net: 0 },
      "2026-04-10": { joins: 2, leaves: 0, net: 2 },
      "2026-04-11": { joins: 0, leaves: 3, net: -3 },
    };
    const r = attributeEvents([], mc, 24);
    expect(r.trend.map(d => d.date)).toEqual(["2026-04-10", "2026-04-11", "2026-04-12"]);
  });

  it("aggregates leaves/joins per post across days", () => {
    const posts = [mkPost(1, "2026-04-10T10:00:00+00:00")];
    const mc = {
      "2026-04-10": { joins: 1, leaves: 2, net: -1 },
      "2026-04-11": { joins: 0, leaves: 3, net: -3 },
    };
    const r = attributeEvents(posts, mc, 24);

    const p1 = r.attributedLeaves.find(x => x.postId === 1);
    expect(p1.leaves).toBe(5);
  });

  it("sorts attributedLeaves descending by leaves", () => {
    const posts = [
      mkPost(1, "2026-04-10T10:00:00+00:00"),
      mkPost(2, "2026-04-11T10:00:00+00:00"),
    ];
    const mc = {
      "2026-04-10": { joins: 0, leaves: 1, net: -1 },
      "2026-04-11": { joins: 0, leaves: 7, net: -7 },
    };
    const r = attributeEvents(posts, mc, 24);
    expect(r.attributedLeaves[0].postId).toBe(2);
    expect(r.attributedLeaves[0].leaves).toBe(7);
    expect(r.attributedLeaves[1].postId).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test`
Expected: FAIL — `attributeEvents` not found / module missing.

- [ ] **Step 3: Implement attribution**

Create `src/lib/attribution.js`:

```js
/**
 * Attribute join/leave events to the posts that most likely caused them.
 *
 * memberChanges is day-bucketed (admin log gives day-level totals), so a 24h
 * window effectively means "same-day or previous-day posts." The most recent
 * post within the window gets full credit; ties are broken by timestamp.
 *
 * @param {Array} posts  - channel posts: { id, date (ISO), text, ... }
 * @param {Object} memberChanges - { "YYYY-MM-DD": { joins, leaves, net } }
 * @param {number} windowHours - window size in hours (default 24)
 * @returns {{
 *   attributedLeaves: Array<{postId, postDate, postText, leaves, post}>,
 *   attributedJoins:  Array<{postId, postDate, postText, joins, post}>,
 *   ambientLeaves: number,
 *   ambientJoins: number,
 *   trend: Array<{date, joins, leaves, net}>
 * }}
 */
export function attributeEvents(posts, memberChanges, windowHours = 24) {
  const windowMs = windowHours * 3600 * 1000;
  const postsByTime = [...(posts || [])]
    .filter(p => p && p.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const perPost = new Map(); // postId -> { post, joins, leaves }
  let ambientLeaves = 0;
  let ambientJoins = 0;
  const trend = [];

  const days = Object.keys(memberChanges || {}).sort();

  for (const day of days) {
    const { joins = 0, leaves = 0, net = 0 } = memberChanges[day] || {};
    trend.push({ date: day, joins, leaves, net });

    if (joins === 0 && leaves === 0) continue;

    // End-of-day is our reference point for "most recent post within window"
    const endOfDay = new Date(`${day}T23:59:59+00:00`).getTime();
    const windowStart = endOfDay - windowMs;

    // Find most recent post whose date is within [windowStart, endOfDay]
    let bestPost = null;
    for (let i = postsByTime.length - 1; i >= 0; i--) {
      const t = new Date(postsByTime[i].date).getTime();
      if (t > endOfDay) continue;
      if (t < windowStart) break;
      bestPost = postsByTime[i];
      break;
    }

    if (bestPost) {
      const entry = perPost.get(bestPost.id) || { post: bestPost, joins: 0, leaves: 0 };
      entry.joins += joins;
      entry.leaves += leaves;
      perPost.set(bestPost.id, entry);
    } else {
      ambientJoins += joins;
      ambientLeaves += leaves;
    }
  }

  const toEntry = (kind) => (e) => ({
    postId: e.post.id,
    postDate: e.post.date,
    postText: (e.post.text || "").slice(0, 200),
    [kind]: e[kind],
    post: e.post,
  });

  const attributedLeaves = [...perPost.values()]
    .filter(e => e.leaves > 0)
    .sort((a, b) => b.leaves - a.leaves)
    .map(toEntry("leaves"));

  const attributedJoins = [...perPost.values()]
    .filter(e => e.joins > 0)
    .sort((a, b) => b.joins - a.joins)
    .map(toEntry("joins"));

  return { attributedLeaves, attributedJoins, ambientLeaves, ambientJoins, trend };
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm test`
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attribution.js src/lib/attribution.test.js
git commit -m "Add attributeEvents — correlate posts to join/leave events"
```

---

## Task 3: RetentionTab component

**Files:**
- Create: `src/components/RetentionTab.jsx`

- [ ] **Step 1: Create component with all 4 cards**

Create `src/components/RetentionTab.jsx`:

```jsx
import { useMemo, useState } from "react";
import { attributeEvents } from "../lib/attribution.js";

const COLLECTOR_URL = "http://localhost:3456";
const COLLECTOR_TOKEN = import.meta.env.VITE_COLLECTOR_TOKEN || "";

function authHeaders() {
  return {
    "Content-Type": "application/json",
    ...(COLLECTOR_TOKEN ? { Authorization: `Bearer ${COLLECTOR_TOKEN}` } : {}),
  };
}

const card = {
  background: "#0d0d16",
  border: "1px solid #1a1a2a",
  borderRadius: 10,
  padding: 16,
  marginBottom: 14,
};
const cardTitle = {
  fontSize: 13,
  fontWeight: 600,
  color: "#e2e2ed",
  marginBottom: 4,
};
const cardSub = { fontSize: 11, color: "#5a5a70", marginBottom: 12 };

function TrendChart({ trend }) {
  const [range, setRange] = useState("30d");
  const filtered = useMemo(() => {
    if (range === "all") return trend;
    const n = range === "7d" ? 7 : 30;
    return trend.slice(-n);
  }, [trend, range]);

  if (filtered.length === 0) {
    return <div style={{ fontSize: 12, color: "#5a5a70" }}>No data yet.</div>;
  }

  const max = Math.max(1, ...filtered.map(d => Math.max(d.joins, d.leaves, Math.abs(d.net))));
  const W = 600;
  const H = 160;
  const pad = 24;
  const plotW = W - pad * 2;
  const plotH = H - pad * 2;
  const x = (i) => pad + (filtered.length === 1 ? plotW / 2 : (i / (filtered.length - 1)) * plotW);
  const y = (v) => pad + plotH / 2 - (v / max) * (plotH / 2);

  const line = (accessor, color, dashed = false) => {
    const d = filtered.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(accessor(p))}`).join(" ");
    return <path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray={dashed ? "4 3" : "0"} />;
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {["7d", "30d", "all"].map(r => (
          <button key={r} onClick={() => setRange(r)} style={{
            fontSize: 10, padding: "3px 8px", borderRadius: 4,
            background: range === r ? "#0d9488" : "transparent",
            border: "1px solid #1a1a2a", color: range === r ? "#fff" : "#5a5a70",
            cursor: "pointer", fontWeight: 600,
          }}>{r}</button>
        ))}
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: "100%" }}>
        <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#1a1a2a" />
        {line(d => d.joins, "#34d399")}
        {line(d => d.leaves, "#f87171")}
        {line(d => d.net, "#60a5fa", true)}
      </svg>
      <div style={{ display: "flex", gap: 14, fontSize: 10, color: "#5a5a70", marginTop: 6 }}>
        <span><span style={{ color: "#34d399" }}>●</span> joins</span>
        <span><span style={{ color: "#f87171" }}>●</span> leaves</span>
        <span><span style={{ color: "#60a5fa" }}>●</span> net</span>
        <span style={{ marginLeft: "auto" }}>
          {filtered[0]?.date} → {filtered[filtered.length - 1]?.date}
        </span>
      </div>
    </div>
  );
}

function PostList({ entries, metric, color, ambient, emptyText }) {
  if (entries.length === 0) {
    return <div style={{ fontSize: 12, color: "#5a5a70" }}>{emptyText}</div>;
  }
  return (
    <div>
      {entries.slice(0, 10).map(e => (
        <div key={e.postId} style={{
          display: "flex", gap: 10, padding: "8px 0",
          borderBottom: "1px solid #1a1a2a", fontSize: 12,
        }}>
          <div style={{
            minWidth: 42, textAlign: "right",
            fontWeight: 700, color, fontFamily: "monospace",
          }}>{e[metric]}</div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{
              color: "#c0c0d0", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis",
            }}>{e.postText || "(no text)"}</div>
            <div style={{ fontSize: 10, color: "#5a5a70" }}>
              {e.postDate?.slice(0, 10)} • {e.post?.views?.toLocaleString() || 0} views
            </div>
          </div>
        </div>
      ))}
      {ambient > 0 && (
        <div style={{ fontSize: 11, color: "#5a5a70", marginTop: 10, fontStyle: "italic" }}>
          + {ambient} {metric} not attributed to any post (ambient churn)
        </div>
      )}
    </div>
  );
}

function AICoach({ result, memberChanges, attribution }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState(result || "");
  const [err, setErr] = useState(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const last7 = attribution.trend.slice(-7);
      const last30 = attribution.trend.slice(-30);
      const sum = (arr, k) => arr.reduce((s, d) => s + d[k], 0);
      const top5Leaves = attribution.attributedLeaves.slice(0, 5);
      const top5Joins = attribution.attributedJoins.slice(0, 5);

      const summary = `RETENTION DATA (${attribution.trend.length} days tracked)

LAST 7 DAYS: joins=${sum(last7, "joins")}, leaves=${sum(last7, "leaves")}, net=${sum(last7, "net")}
LAST 30 DAYS: joins=${sum(last30, "joins")}, leaves=${sum(last30, "leaves")}, net=${sum(last30, "net")}

TOP 5 POSTS DRIVING LEAVES (within 24h):
${top5Leaves.map(e => `- [${e.leaves} leaves] "${e.postText.slice(0, 120)}"`).join("\n") || "(none yet)"}

TOP 5 POSTS DRIVING JOINS (within 24h):
${top5Joins.map(e => `- [${e.joins} joins] "${e.postText.slice(0, 120)}"`).join("\n") || "(none yet)"}

AMBIENT CHURN (not tied to any post): ${attribution.ambientLeaves} leaves, ${attribution.ambientJoins} joins.`;

      const r = await fetch(`${COLLECTOR_URL}/api/claude`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          system: "You are a Telegram retention analyst. Analyze the data and output tagged sections. Use tags: TREND:, PATTERN:, CAUSE:, RECOMMENDATION:, WARNING:. Be specific — reference actual post text when explaining patterns. 6-10 bullets total.",
          user: summary,
          max_tokens: 1200,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Claude request failed");
      setText(d.text);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  return (
    <div>
      {!text && !loading && (
        <button onClick={run} style={{
          padding: "8px 14px", borderRadius: 6, border: "1px solid #0d9488",
          background: "#0d948822", color: "#0891b2", fontWeight: 600,
          fontSize: 12, cursor: "pointer",
        }}>Get weekly retention insights</button>
      )}
      {loading && <div style={{ fontSize: 12, color: "#5a5a70" }}>Analyzing…</div>}
      {err && <div style={{ fontSize: 12, color: "#f87171" }}>Error: {err} <button onClick={run} style={{ marginLeft: 8, fontSize: 11 }}>retry</button></div>}
      {text && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#c0c0d0", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>{text}</pre>}
      {text && (
        <button onClick={run} style={{
          marginTop: 10, fontSize: 10, padding: "3px 8px",
          borderRadius: 4, background: "transparent",
          border: "1px solid #1a1a2a", color: "#5a5a70", cursor: "pointer",
        }}>Re-analyze</button>
      )}
    </div>
  );
}

export default function RetentionTab({ channelData }) {
  const memberChanges = channelData?.daily_member_changes || {};
  const posts = channelData?.posts || [];

  const attribution = useMemo(
    () => attributeEvents(posts, memberChanges, 24),
    [posts, memberChanges],
  );

  const dayCount = Object.keys(memberChanges).length;

  if (!channelData) {
    return (
      <div style={card}>
        <div style={cardTitle}>No channel data loaded</div>
        <div style={cardSub}>Run collection first: say "refresh" or click the Refresh button.</div>
      </div>
    );
  }

  if (dayCount < 3) {
    return (
      <div style={card}>
        <div style={cardTitle}>Retention data needs more time</div>
        <div style={cardSub}>
          Only {dayCount} day{dayCount === 1 ? "" : "s"} of join/leave events collected so far.
          Telegram's admin log only keeps the last ~48h, so install the scheduled collector
          (runs every 12h) to build continuous history. Come back after a week for meaningful trends.
        </div>
        <div style={{ fontSize: 11, color: "#5a5a70", marginTop: 8 }}>
          Install: run <code style={{ background: "#1a1a2a", padding: "2px 5px", borderRadius: 3 }}>bash scripts/install_scheduler.sh</code> in the project root.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>📈 Subscriber trend</div>
        <div style={cardSub}>Daily joins, leaves, and net change.</div>
        <TrendChart trend={attribution.trend} />
      </div>

      <div style={card}>
        <div style={cardTitle}>📉 Top churn-triggering posts</div>
        <div style={cardSub}>Posts ranked by leaves attributed within 24h.</div>
        <PostList
          entries={attribution.attributedLeaves}
          metric="leaves"
          color="#f87171"
          ambient={attribution.ambientLeaves}
          emptyText="No posts attributed to leaves yet."
        />
      </div>

      <div style={card}>
        <div style={cardTitle}>📈 Top inflow-driving posts</div>
        <div style={cardSub}>Posts ranked by joins attributed within 24h.</div>
        <PostList
          entries={attribution.attributedJoins}
          metric="joins"
          color="#34d399"
          ambient={attribution.ambientJoins}
          emptyText="No posts attributed to joins yet."
        />
      </div>

      <div style={card}>
        <div style={cardTitle}>🧠 AI retention coach</div>
        <div style={cardSub}>Claude analyzes your retention data and recommends actions.</div>
        <AICoach attribution={attribution} memberChanges={memberChanges} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit (component not yet wired up)**

```bash
git add src/components/RetentionTab.jsx
git commit -m "Add RetentionTab component with trend chart, post lists, AI coach"
```

---

## Task 4: Register Retention tab in App.jsx

**Files:**
- Modify: `src/App.jsx:860-866` and `src/App.jsx:970-977`

- [ ] **Step 1: Import RetentionTab**

Add to the top of `src/App.jsx` (after the existing `import { useState, useEffect } from "react";` line):

```jsx
import RetentionTab from "./components/RetentionTab.jsx";
```

- [ ] **Step 2: Add tab entry**

Modify the `TABS` array (currently at `src/App.jsx:860-866`). Insert the Retention entry between Audience and Network:

```jsx
const TABS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "content", label: "Content", icon: "📝" },
  { id: "audience", label: "Audience", icon: "👥" },
  { id: "retention", label: "Retention", icon: "🔄" },
  { id: "network", label: "Network", icon: "🔗" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];
```

- [ ] **Step 3: Render the tab**

Modify the tab content block (currently at `src/App.jsx:972-976`). Add the retention render line between audience and network:

```jsx
{tab === "overview" && <OverviewTab config={config} channelData={channelData} />}
{tab === "content" && <ContentTab config={config} channelData={channelData} />}
{tab === "audience" && <AudienceTab config={config} channelData={channelData} />}
{tab === "retention" && <RetentionTab channelData={channelData} />}
{tab === "network" && <NetworkTab config={config} channelData={channelData} />}
{tab === "settings" && <SettingsTab config={config} setConfig={setConfig} save={save} />}
```

- [ ] **Step 4: Verify dashboard loads**

Run:
```bash
# dev server should already be running; if not:
npm run dev
```
Open http://localhost:5173 → click "Retention" tab in sidebar → should see either the 4 cards (if ≥3 days of data) or the "needs more time" empty state.

Expected: no console errors, tab renders.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "Wire up Retention tab in App sidebar"
```

---

## Task 5: launchd scheduler — plist template + install script

**Files:**
- Create: `scripts/com.davidyseo.tggrowth.collector.plist.template`
- Create: `scripts/install_scheduler.sh`
- Create: `scripts/uninstall_scheduler.sh`

- [ ] **Step 1: Create plist template**

Create `scripts/com.davidyseo.tggrowth.collector.plist.template`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.davidyseo.tggrowth.collector</string>

    <key>ProgramArguments</key>
    <array>
        <string>__PYTHON__</string>
        <string>__PROJECT_DIR__/collect_data.py</string>
    </array>

    <key>WorkingDirectory</key>
    <string>__PROJECT_DIR__</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>StartInterval</key>
    <integer>43200</integer>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>__PROJECT_DIR__/scheduler.log</string>

    <key>StandardErrorPath</key>
    <string>__PROJECT_DIR__/scheduler.log</string>
</dict>
</plist>
```

(`StartInterval` of 43200 seconds = 12 hours. `RunAtLoad` fires once immediately so you see output the first time you install.)

- [ ] **Step 2: Create install script**

Create `scripts/install_scheduler.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="com.davidyseo.tggrowth.collector"
TEMPLATE="$SCRIPT_DIR/${LABEL}.plist.template"
TARGET="$HOME/Library/LaunchAgents/${LABEL}.plist"
PYTHON="$(command -v python3 || true)"

if [[ -z "$PYTHON" ]]; then
    echo "ERROR: python3 not found in PATH" >&2
    exit 1
fi

if [[ ! -f "$TEMPLATE" ]]; then
    echo "ERROR: template not found at $TEMPLATE" >&2
    exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

# Unload existing agent (ignore failure if not loaded)
launchctl unload "$TARGET" 2>/dev/null || true

# Substitute absolute paths into the template
sed \
    -e "s|__PYTHON__|${PYTHON}|g" \
    -e "s|__PROJECT_DIR__|${PROJECT_DIR}|g" \
    "$TEMPLATE" > "$TARGET"

# Validate plist syntax before loading
if ! plutil -lint "$TARGET" > /dev/null; then
    echo "ERROR: generated plist is malformed" >&2
    exit 1
fi

launchctl load "$TARGET"

echo "✓ Scheduler installed: $LABEL"
echo "  Plist: $TARGET"
echo "  Log:   $PROJECT_DIR/scheduler.log"
echo "  Runs every 12h. First run is happening now."
echo ""
echo "Manage:"
echo "  launchctl list | grep tggrowth        # check status"
echo "  tail -f '$PROJECT_DIR/scheduler.log'  # watch output"
echo "  bash scripts/uninstall_scheduler.sh   # remove"
```

Make it executable:
```bash
chmod +x scripts/install_scheduler.sh
```

- [ ] **Step 3: Create uninstall script**

Create `scripts/uninstall_scheduler.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

LABEL="com.davidyseo.tggrowth.collector"
TARGET="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ -f "$TARGET" ]]; then
    launchctl unload "$TARGET" 2>/dev/null || true
    rm -f "$TARGET"
    echo "✓ Scheduler removed: $LABEL"
else
    echo "Scheduler not installed."
fi
```

Make it executable:
```bash
chmod +x scripts/uninstall_scheduler.sh
```

- [ ] **Step 4: Verify install works**

Run:
```bash
cd "/Users/david/Library/Mobile Documents/com~apple~CloudDocs/tg-growth"
bash scripts/install_scheduler.sh
launchctl list | grep tggrowth
```

Expected:
- Install prints "✓ Scheduler installed"
- `launchctl list` output includes a line with `com.davidyseo.tggrowth.collector`
- `scheduler.log` file appears within ~60s with Python output

- [ ] **Step 5: Commit**

```bash
git add scripts/com.davidyseo.tggrowth.collector.plist.template scripts/install_scheduler.sh scripts/uninstall_scheduler.sh
git commit -m "Add launchd scheduler for 12h automatic collection"
```

---

## Task 6: Update SKILL.md

**Files:**
- Modify: `.claude/skills/tg-growth/SKILL.md`

- [ ] **Step 1: Update Tab Structure table**

Find the "Tab Structure" table in `.claude/skills/tg-growth/SKILL.md`. Add a new row for Retention between Audience and Network:

```markdown
| **Retention** | "Who's leaving and why?" | Subscriber Trend, Top Churn-Triggering Posts, Top Inflow-Driving Posts, AI Retention Coach |
```

- [ ] **Step 2: Add scheduled collection section**

In `.claude/skills/tg-growth/SKILL.md`, before the "Commands" section, add this new section:

```markdown
## Scheduled Collection (launchd)

The Retention tab needs continuous join/leave history because Telegram's admin log only retains the last ~48 hours of member events. A launchd agent runs `collect_data.py` every 12 hours to accumulate this history into `channel_data.json`.

**Install:** `bash scripts/install_scheduler.sh` — copies a plist to `~/Library/LaunchAgents/`, substitutes absolute paths, loads via launchctl.

**Check status:** `launchctl list | grep tggrowth`

**Watch log:** `tail -f scheduler.log`

**Uninstall:** `bash scripts/uninstall_scheduler.sh`

The agent runs at project path, uses existing `.env` credentials, and does not require the user to be logged in (runs in user session, survives laptop sleep via launchd catch-up).
```

- [ ] **Step 3: Add new command entries**

In the Commands section of SKILL.md, add these entries:

```markdown
### "install scheduler" or "schedule collection"
Run `bash scripts/install_scheduler.sh` from the project root. Confirm output shows "✓ Scheduler installed" and that `launchctl list | grep tggrowth` returns a match.

### "uninstall scheduler" or "stop scheduled collection"
Run `bash scripts/uninstall_scheduler.sh`.

### "retention" or "churn" or "who's leaving"
If the dashboard is running, tell the user to click the Retention tab. If not, start it first (via the "start" command) then direct them there.

### "analyze retention"
Load `channel_data.json`, run attribution (posts vs `daily_member_changes`, 24h window), and report: top 5 churn-triggering posts, top 5 inflow-driving posts, ambient churn counts, 7-day and 30-day net change. Use real data only — if fewer than 3 days of member changes are recorded, tell the user the scheduled collector needs more time.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/tg-growth/SKILL.md
git commit -m "Document Retention tab and scheduled collection in SKILL.md"
```

---

## Task 7: Manual end-to-end verification

**Files:** none modified — verification only

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: all attribution tests pass (8 tests).

- [ ] **Step 2: Verify dashboard loads without errors**

Open http://localhost:5173 → open browser devtools console → click each tab including the new Retention tab.
Expected: no console errors on any tab.

- [ ] **Step 3: Verify Retention tab empty state**

Since the current `channel_data.json` has only ~2 days of `daily_member_changes`, the Retention tab should show the "needs more time" empty state.
Expected: empty state with correct day count and install instruction rendered.

- [ ] **Step 4: Verify scheduler installed and ran at least once**

Run:
```bash
launchctl list | grep tggrowth
tail -5 scheduler.log
```
Expected: scheduler listed; log shows recent Python output (the RunAtLoad first run).

- [ ] **Step 5: Inject synthetic data to verify non-empty render path (optional but recommended)**

This proves the full render path works without waiting a week for real data.

Run this one-liner to inject synthetic member changes, then reload the dashboard:

```bash
python3 -c "
import json
p = 'public/channel_data.json'
d = json.load(open(p))
d['daily_member_changes'] = {
    '2026-04-07': {'joins': 3, 'leaves': 1, 'net': 2},
    '2026-04-08': {'joins': 2, 'leaves': 4, 'net': -2},
    '2026-04-09': {'joins': 5, 'leaves': 2, 'net': 3},
    '2026-04-10': {'joins': 1, 'leaves': 8, 'net': -7},
    '2026-04-11': {'joins': 4, 'leaves': 2, 'net': 2},
}
json.dump(d, open(p, 'w'), indent=2)
print('injected 5 days of synthetic data')
"
```

Reload dashboard → Retention tab should now show trend chart + post lists + AI coach button. Click the AI coach button → verify Claude response renders.

**Cleanup:** run `cp channel_data.json public/channel_data.json` to restore real data (or just run collection again: `curl -H "Authorization: Bearer $COLLECTOR_TOKEN" http://localhost:3456/collect-own`).

- [ ] **Step 6: Final commit (only if verification revealed fixes)**

If any bugs surfaced during verification, fix and commit. If clean, skip.

---

## Notes for implementer

- The collector HTTP server must be running (port 3456) for the AI coach card to work. If dev environment has it stopped, start it before testing: `python3 collect_data.py --serve &`.
- The dashboard auto-reloads on file changes because Vite is in dev mode. After editing `.jsx` files you do NOT need to restart.
- `channel_data.json` is gitignored — never commit it.
- The launchd plist template uses absolute paths baked in by `install_scheduler.sh`. Don't hand-edit the installed plist; rerun the install script if the project moves.
- The `RunAtLoad` key causes the scheduler to fire immediately on install — this is intentional for testing. If the first run fails (bad credentials, collector port conflict), check `scheduler.log`.
