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

function AICoach({ attribution }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
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
        <AICoach attribution={attribution} />
      </div>
    </div>
  );
}
