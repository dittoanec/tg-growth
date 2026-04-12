import { useState, useEffect } from "react";

// ─── Config ───
const TG_TOKEN = import.meta.env.VITE_TG_BOT_TOKEN || "";
const SLACK_WEBHOOK = import.meta.env.VITE_SLACK_WEBHOOK || "";
const COLLECTOR_URL = "http://localhost:3456";
const COLLECTOR_TOKEN = import.meta.env.VITE_COLLECTOR_TOKEN || "";

function collectorHeaders(extra = {}) {
  return { "Content-Type": "application/json", ...(COLLECTOR_TOKEN ? { Authorization: `Bearer ${COLLECTOR_TOKEN}` } : {}), ...extra };
}

// ─── Storage ───
const store = {
  get: (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

// ─── Telegram Bot API ───
async function tgApi(method, params = {}) {
  const token = store.get("tg-config", {}).botToken || TG_TOKEN;
  if (!token) throw new Error("No bot token configured");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || "Telegram API error");
  return d.result;
}

async function getChannelInfo(u) { return tgApi("getChat", { chat_id: `@${u}` }); }
async function getMemberCount(u) { return tgApi("getChatMemberCount", { chat_id: `@${u}` }); }

// ─── Channel Data ───
let _channelData = null;
async function loadChannelData() {
  if (_channelData) return _channelData;
  try { const r = await fetch("/channel_data.json"); if (r.ok) { _channelData = await r.json(); return _channelData; } } catch {}
  return null;
}

let _trackedData = null;
async function loadTrackedData(force = false) {
  if (_trackedData && !force) return _trackedData;
  try { const r = await fetch("/tracked_channels.json?" + Date.now()); if (r.ok) { _trackedData = await r.json(); return _trackedData; } } catch {}
  return null;
}

async function collectChannelOnDemand(name) {
  name = name.replace("@", "").replace("https://t.me/", "").replace("t.me/", "").trim();
  const r = await fetch(`${COLLECTOR_URL}/collect?channel=${encodeURIComponent(name)}`, { headers: collectorHeaders() });
  if (!r.ok) { const err = await r.json().catch(() => ({ error: "Collector not running" })); throw new Error(err.error || "Collection failed"); }
  _trackedData = null;
  return r.json();
}

async function collectOwnChannel() {
  const r = await fetch(`${COLLECTOR_URL}/collect-own`, { headers: collectorHeaders() });
  if (!r.ok) { const err = await r.json().catch(() => ({ error: "Collector not running. Start: python3 collect_data.py --serve" })); throw new Error(err.error || "Collection failed"); }
  _channelData = null;
  return r.json();
}

// ─── Data Summarizers ───
function summarizeForLLM(data) {
  if (!data) return null;
  const s = data.summary, posts = data.posts.slice(-50);
  const topViews = [...data.posts].sort((a, b) => b.views - a.views).slice(0, 10);
  const topFwd = [...data.posts].sort((a, b) => b.forwards - a.forwards).slice(0, 5);
  const formats = {}, reactionMap = {}, hourDist = {};
  posts.forEach(p => { formats[p.media_type || "text"] = (formats[p.media_type || "text"] || 0) + 1; });
  posts.forEach(p => p.reactions?.forEach(r => { reactionMap[r.emoji] = (reactionMap[r.emoji] || 0) + r.count; }));
  posts.forEach(p => { const h = new Date(p.date).getHours(); hourDist[h] = (hourDist[h] || 0) + 1; });
  return `REAL CHANNEL DATA (from Telegram API):
Channel: ${s.title} (@${s.channel}) | Members: ${s.member_count} | Posts: ${s.total_posts_collected}
Date range: ${s.date_range.from?.slice(0,10)} to ${s.date_range.to?.slice(0,10)}
${s.stats ? `Avg views: ${s.stats.avg_views} | Max views: ${s.stats.max_views} | Avg forwards: ${s.stats.avg_forwards} | Max forwards: ${s.stats.max_forwards} | Avg reactions: ${s.stats.avg_reactions} | Posts with media: ${s.stats.posts_with_media}/${s.total_posts_collected}` : ""}
FORMAT DISTRIBUTION: ${JSON.stringify(formats)}
REACTION BREAKDOWN: ${JSON.stringify(reactionMap)}
POSTING HOURS (KST): ${JSON.stringify(hourDist)}

TOP 10 BY VIEWS:
${topViews.map((p, i) => `${i+1}. [${p.views}v, ${p.forwards}fwd, ${p.reaction_total}r, ${p.media_type}] ${p.text.slice(0, 120)}...`).join("\n")}

TOP 5 BY FORWARDS:
${topFwd.map((p, i) => `${i+1}. [${p.forwards}fwd, ${p.views}v] ${p.text.slice(0, 120)}...`).join("\n")}

LAST 10 POSTS:
${posts.slice(-10).reverse().map((p, i) => `${i+1}. [${new Date(p.date).toISOString().slice(0,10)} | ${p.views}v | ${p.forwards}fwd | ${p.reaction_total}r | ${p.media_type}] ${p.text.slice(0, 150)}...`).join("\n")}`;
}

function summarizeTrackedChannel(chData) {
  if (!chData || chData.error) return null;
  const s = chData.summary, posts = chData.posts.slice(-30);
  const topViews = [...chData.posts].sort((a, b) => b.views - a.views).slice(0, 5);
  const topFwd = [...chData.posts].sort((a, b) => b.forwards - a.forwards).slice(0, 3);
  const formats = {}, hourDist = {};
  posts.forEach(p => { formats[p.media_type || "text"] = (formats[p.media_type || "text"] || 0) + 1; });
  posts.forEach(p => { const h = new Date(p.date).getHours(); hourDist[h] = (hourDist[h] || 0) + 1; });
  return `COMPETITOR: ${s.title} (@${s.channel}) | Members: ${s.member_count} | Posts: ${s.total_posts_collected}
${s.stats ? `Avg views: ${s.stats.avg_views} | Max: ${s.stats.max_views} | Avg fwd: ${s.stats.avg_forwards} | Avg reactions: ${s.stats.avg_reactions}` : ""}
Formats: ${JSON.stringify(formats)} | Hours: ${JSON.stringify(hourDist)}
Top: ${topViews.map((p, i) => `\n  ${i+1}. [${p.views}v, ${p.forwards}fwd] ${p.text.slice(0, 100)}`).join("")}
Most fwd: ${topFwd.map((p, i) => `\n  ${i+1}. [${p.forwards}fwd] ${p.text.slice(0, 100)}`).join("")}
Recent: ${posts.slice(-5).reverse().map((p, i) => `\n  ${i+1}. [${p.date.slice(0,10)} | ${p.views}v] ${p.text.slice(0, 80)}`).join("")}`;
}

function summarizeForwardChains(data) {
  if (!data?.forward_chains) return null;
  const fc = data.forward_chains;
  if (!fc.chains?.length && !Object.keys(fc.amplifiers || {}).length) return null;
  const amps = Object.entries(fc.amplifiers || {}).slice(0, 15).map(([u, i]) => `  @${u} — "${i.name}" (${i.count}x, ${i.total_views} views)`).join("\n");
  const chains = (fc.chains || []).slice(0, 10).map(c =>
    `  Post #${c.post_id} [${c.post_views}v, ${c.post_forwards}fwd]: "${c.post_text.slice(0, 80)}..."\n    -> ${c.forwarders.map(f => `@${f.channel}(${f.members}m)`).join(", ")}`
  ).join("\n");
  return `FORWARD CHAIN DATA:\nAMPLIFIERS:\n${amps || "  None"}\nCHAINS:\n${chains || "  None"}`;
}

// ─── Claude API ───
async function callClaude(system, user, maxTokens = 2000) {
  const r = await fetch(`${COLLECTOR_URL}/api/claude`, { method: "POST", headers: collectorHeaders(), body: JSON.stringify({ system, user, max_tokens: maxTokens }) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || "Claude proxy error");
  return d.text || "No response";
}

// ─── Slack ───
async function sendSlack(text) {
  const url = store.get("tg-config", {}).slackWebhook || SLACK_WEBHOOK;
  if (!url) return;
  await fetch(url, { method: "POST", body: JSON.stringify({ text }) });
}

// ─── Agents ───
const AGENTS = [
  { id: "strategist", name: "Growth Strategist", color: "#f59e0b", avatar: "📈",
    system: "You are a Telegram growth strategist who has scaled channels past 50K+. Use tags: TOP PERFORMER:, PATTERN:, WEAK SPOT:, OPPORTUNITY:, SUGGESTION:, GAP:, RISK:. Be brutally honest." },
  { id: "analyst", name: "Data Analyst", color: "#3b82f6", avatar: "📊",
    system: "You are a data analyst specializing in social media metrics. Use tags: METRIC:, TREND:, OUTLIER:, CORRELATION:, BENCHMARK:, ANOMALY:. Always cite specific numbers." },
  { id: "persona", name: "Audience Researcher", color: "#8b5cf6", avatar: "🎯",
    system: "You are an audience researcher building behavioral personas from engagement data. Use tags: PERSONA:, BEHAVIOR:, DEMAND:, SENTIMENT:, MOTIVATION:, SEGMENT:." },
];

// ═══════════════════════════════════════════════
// ─── UI Components ───
// ═══════════════════════════════════════════════

const tagColors = { "TOP PERFORMER": "#34d399", PATTERN: "#34d399", GOOD: "#34d399", STRONG: "#34d399", METRIC: "#60a5fa", TREND: "#60a5fa", BENCHMARK: "#60a5fa", CORRELATION: "#60a5fa",
  PERSONA: "#a78bfa", BEHAVIOR: "#a78bfa", DEMAND: "#fbbf24", SENTIMENT: "#a78bfa", MOTIVATION: "#a78bfa", SEGMENT: "#a78bfa",
  "WEAK SPOT": "#f87171", GAP: "#f87171", RISK: "#f87171", ANOMALY: "#f87171", DROP: "#f87171", "CONTENT GAP": "#f87171", "TOPIC GAP": "#f87171", "FORMAT GAP": "#f87171",
  OPPORTUNITY: "#fbbf24", SUGGESTION: "#60a5fa", OUTLIER: "#fbbf24",
  "AMPLIFIER PATTERN": "#34d399", "FORWARD TRIGGER": "#34d399", "DEAD CONTENT": "#f87171", "VIRAL ELEMENT": "#fbbf24", ACTION: "#60a5fa",
  EMERGING: "#34d399", DECLINING: "#f87171", SHIFT: "#fbbf24", SATURATION: "#f87171", "CROSS-CHANNEL": "#a78bfa",
  SIGNAL: "#fbbf24", INSIGHT: "#60a5fa",
  "ANOMALY DAY": "#f87171", CAUSE: "#fbbf24", "CONTENT ISSUE": "#f87171", "HEALTHY CHURN": "#34d399", "GROWTH SPIKE": "#34d399", RECOMMENDATION: "#60a5fa", WARNING: "#f87171",
  "SHIFT DETECTED": "#fbbf24", STABLE: "#34d399", "EMERGING INTEREST": "#34d399", "DECLINING INTEREST": "#f87171",
  "CONTENT GAP": "#f87171", "ENGAGEMENT DRIFT": "#fbbf24", "COMPETITOR SHIFT": "#a78bfa",
  OVERLAP: "#a78bfa", "THEIR AUDIENCE LOVES": "#34d399", "FORWARD OPPORTUNITY": "#fbbf24", "CONTENT BRIDGE": "#60a5fa", SYNERGY: "#34d399",
  RECURRING: "#a78bfa", "CONTENT REQUEST": "#fbbf24",
};

function ResultBlock({ text }) {
  if (!text) return null;
  return (
    <div style={{ background: "#0a0a12", borderRadius: 8, padding: 16, fontSize: 13, color: "#b0b0c0", lineHeight: 1.7, whiteSpace: "pre-wrap", overflow: "auto", border: "1px solid #1a1a2a" }}>
      {text.split("\n").map((line, i) => {
        const m = line.match(/^[-•*]\s*\*?\*?([A-Z][A-Z /]+):?\*?\*?\s*/);
        if (m) {
          const tag = m[1].trim(), rest = line.slice(m[0].length);
          const tc = Object.entries(tagColors).find(([k]) => tag.includes(k))?.[1] || "#fbbf24";
          return <div key={i} style={{ display: "flex", gap: 8, margin: "6px 0" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: tc, background: tc + "18", padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap", marginTop: 2, fontFamily: "monospace" }}>{tag}</span>
            <span>{rest}</span>
          </div>;
        }
        if (line.startsWith("##") || line.match(/^\*\*[^*]+\*\*$/)) return <div key={i} style={{ fontWeight: 600, color: "#e2e2ed", margin: "10px 0 4px" }}>{line.replace(/[#*]/g, "").trim()}</div>;
        if (!line.trim()) return <div key={i} style={{ height: 4 }} />;
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

function MetricBox({ label, value, sub, color }) {
  return (
    <div style={{ background: "#0d0d16", borderRadius: 8, padding: "10px 12px", border: "1px solid #1a1a2a", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "#5a5a70", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: color || "#e2e2ed", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#5a5a70", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Two-Panel Layout ───

function TwoPanel({ cards, selected, onSelect, customRight }) {
  const card = cards.find(c => c.key === selected);
  return (
    <div style={{ display: "flex", gap: 16, minHeight: "calc(100vh - 200px)" }}>
      {/* Left: card list */}
      <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
        {cards.map(c => (
          <button key={c.key} onClick={() => onSelect(c.key)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, border: selected === c.key ? `1px solid ${c.accent || "#0d9488"}44` : "1px solid #1a1a2a",
            background: selected === c.key ? (c.accent || "#0d9488") + "10" : "#111119", cursor: "pointer", textAlign: "left", width: "100%", position: "relative", overflow: "hidden",
          }}>
            {c.accent && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: selected === c.key ? c.accent : "transparent" }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: selected === c.key ? "#e2e2ed" : "#8a8a9a" }}>{c.title}</div>
              <div style={{ fontSize: 11, color: "#4a4a5a", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subtitle}</div>
            </div>
            {c.result && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />}
          </button>
        ))}
      </div>

      {/* Right: result panel */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {card ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e2e2ed", margin: 0 }}>{card.title}</h2>
                <p style={{ fontSize: 12, color: "#5a5a70", margin: "4px 0 0" }}>{card.subtitle}</p>
              </div>
              {card.run && (
                <button onClick={card.run} disabled={card.loading} style={{
                  fontSize: 12, fontWeight: 600, padding: "8px 20px", borderRadius: 8,
                  background: card.loading ? "#1a1a2e" : `linear-gradient(135deg, ${card.accent || "#0d9488"}, ${card.accent ? card.accent + "cc" : "#0891b2"})`,
                  border: "none", color: "#fff", cursor: card.loading ? "wait" : "pointer", opacity: card.loading ? 0.6 : 1,
                }}>
                  {card.loading ? "Analyzing..." : (card.actionLabel || "Run Analysis")}
                </button>
              )}
            </div>

            {/* Custom content or result */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {customRight && selected === customRight.key ? customRight.render : (
                <>
                  {!card.result && !card.loading && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#3a3a50", fontSize: 13 }}>
                      Click "Run Analysis" to start
                    </div>
                  )}
                  {card.loading && !card.result && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#5a5a70", fontSize: 13 }}>
                      Analyzing...
                    </div>
                  )}
                  {card.result && <ResultBlock text={card.result} />}
                  {card.result && <AgentTabs context={card.result} title={card.title} />}
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#3a3a50", fontSize: 13 }}>
            Select an analysis from the left
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Agent Tabs (collapsed by default) ───

function AgentTabs({ context, title }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  const runAgent = async (agent) => {
    setLoading(p => ({ ...p, [agent.id]: true }));
    try {
      const data = await loadChannelData();
      const rawData = summarizeForLLM(data);
      const prompt = rawData
        ? `RAW CHANNEL DATA:\n${rawData}\n\n---\n\nPREVIOUS ANALYSIS (${title}):\n${context}\n\nUsing BOTH the raw data and the previous analysis, provide 5-7 specific, actionable bullet points. Reference actual posts and numbers.`
        : `Context: ${title}\n\n${context}\n\nProvide 5-7 specific, actionable bullet points.`;
      const result = await callClaude(agent.system, prompt);
      setResults(p => ({ ...p, [agent.id]: result }));
    } catch (e) { setResults(p => ({ ...p, [agent.id]: `Error: ${e.message}` })); }
    setLoading(p => ({ ...p, [agent.id]: false }));
  };

  if (!context) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={() => setOpen(!open)} style={{
        fontSize: 11, fontWeight: 600, color: "#5a5a70", background: "none", border: "1px solid #1a1a2a", borderRadius: 6, padding: "4px 12px", cursor: "pointer",
      }}>
        {open ? "Hide" : "Get"} second opinions {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {AGENTS.map(a => (
            <div key={a.id}>
              <button onClick={() => runAgent(a)} disabled={loading[a.id]} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8,
                background: results[a.id] ? a.color + "15" : "transparent", border: `1px solid ${results[a.id] ? a.color + "44" : "#1e1e2e"}`,
                color: a.color, fontSize: 12, cursor: "pointer", opacity: loading[a.id] ? 0.5 : 1,
              }}>
                <span>{a.avatar}</span> {loading[a.id] ? "Analyzing..." : a.name}
              </button>
              {results[a.id] && <div style={{ marginTop: 6 }}><ResultBlock text={results[a.id]} /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// ─── Tab Components ───
// ═══════════════════════════════════════════════

// ─── Overview Tab ───
function OverviewTab({ config, channelData }) {
  const [selected, setSelected] = useState("signal");
  const [signalResult, setSignalResult] = useState(store.get("tg-signal", null));
  const [loading, setLoading] = useState({});

  const runSignalAnalysis = async () => {
    setLoading(p => ({ ...p, signal: true }));
    try {
      const data = await loadChannelData();
      const persona = store.get("tg-persona-profile", null);

      if (!data || !data.daily_stats) {
        const r = await callClaude(
          "You are a Telegram subscriber behavior analyst. Detect anomaly patterns. Use tags: ANOMALY DAY:, CAUSE:, CONTENT ISSUE:, HEALTHY CHURN:, GROWTH SPIKE:, PATTERN:, RECOMMENDATION:, WARNING:",
          `Analyze subscriber signals for @${config.channelName} (${config.niche}, ${config.followerCount} members).\n${persona ? "Persona:\n" + persona.slice(0, 600) : ""}\nSince we don't have daily subscriber data yet, analyze content patterns that typically cause mutes/leaves in ${config.niche} channels. 6-8 bullets.`
        );
        setSignalResult("⚠️ NO REAL POST DATA — results are generic estimates. Click Refresh to collect real data.\n\n" + r);
      } else {
        const dailyStats = data.daily_stats, memberChanges = data.daily_member_changes || {};
        const days = Object.keys(dailyStats).sort();
        const avgViews = days.reduce((s, d) => s + dailyStats[d].avg_views, 0) / days.length;
        const avgReactions = days.reduce((s, d) => s + dailyStats[d].total_reactions, 0) / days.length;
        const anomalies = [];
        for (const day of days) {
          const s = dailyStats[day], mc = memberChanges[day] || { joins: 0, leaves: 0, net: 0 };
          const vr = avgViews > 0 ? s.avg_views / avgViews : 1, rr = avgReactions > 0 ? s.total_reactions / avgReactions : 1;
          let sig = null;
          if (mc.leaves > 5 || mc.net < -3) sig = "HIGH_LEAVE";
          else if (vr < 0.6) sig = "VIEW_DROP";
          else if (rr < 0.4) sig = "REACTION_DROP";
          else if (mc.joins > 10 || mc.net > 5) sig = "GROWTH_SPIKE";
          else if (vr > 2.0) sig = "VIEW_SPIKE";
          if (sig) anomalies.push({ day, sig, views: s.avg_views, reactions: s.total_reactions, forwards: s.total_forwards, posts: s.posts, joins: mc.joins, leaves: mc.leaves, net: mc.net,
            content: s.contents.map(c => `[${c.media_type}|${c.views}v|${c.reactions}r] ${c.text.slice(0, 100)}`).join("\n") });
        }
        const anomalyText = anomalies.length > 0
          ? anomalies.map(a => `\n--- ${a.day} [${a.sig}] ---\nViews: ${a.views} (avg: ${Math.round(avgViews)}) | Reactions: ${a.reactions} | Joins: ${a.joins} | Leaves: ${a.leaves} | Net: ${a.net}\nPosts (${a.posts}):\n${a.content}`).join("\n")
          : "\nNo strong anomalies detected. Analyze subtle patterns instead.";
        const r = await callClaude(
          "You are a Telegram subscriber behavior analyst. Analyze anomaly days and explain WHY. Use tags: ANOMALY DAY:, CAUSE:, CONTENT ISSUE:, HEALTHY CHURN:, GROWTH SPIKE:, PATTERN:, RECOMMENDATION:, WARNING:",
          `REAL DATA for @${config.channelName} (${config.niche}):\nAverages: ${Math.round(avgViews)} views/post, ${Math.round(avgReactions)} reactions/day | Days: ${days.length} | Anomalies: ${anomalies.length}\n${anomalyText}\n${persona ? "\nPersona:\n" + persona.slice(0, 400) : ""}\n\nDiagnose each anomaly day. 6-8 bullets.`
        );
        setSignalResult(r);
      }
      store.set("tg-signal", signalResult);
      sendSlack(`📉 Signal Analysis\n${signalResult?.slice(0, 500) || "done"}...`);
    } catch (e) { setSignalResult(`Error: ${e.message}`); }
    setLoading(p => ({ ...p, signal: false }));
  };

  const cards = [
    { key: "signal", title: "Subscriber Signal Analyzer", subtitle: "Detect anomaly days — view drops, leave spikes, growth bursts", accent: "#ef4444", run: runSignalAnalysis, actionLabel: "Detect Signals", loading: loading.signal, result: signalResult },
  ];

  return <TwoPanel cards={cards} selected={selected} onSelect={setSelected} />;
}

// ─── Content Tab ───
function ContentTab({ config, channelData }) {
  const [selected, setSelected] = useState("eng");
  const [results, setResults] = useState({ eng: store.get("tg-eng", null), gap: store.get("tg-gap", null), cal: store.get("tg-cal", null) });
  const [loading, setLoading] = useState({});

  const runWithData = async (key, system, prompt, storeKey) => {
    setLoading(p => ({ ...p, [key]: true }));
    try {
      const data = await loadChannelData();
      const realData = summarizeForLLM(data);
      const hasReal = !!realData;
      const extra = realData ? `\n\n${realData}\n\nIMPORTANT: Use the REAL DATA above. Do NOT guess.\n\n` : "";
      const result = await callClaude(system, extra + prompt);
      const warn = hasReal ? "" : "⚠️ NO REAL POST DATA — results are generic estimates. Click Refresh to collect real data.\n\n";
      setResults(p => ({ ...p, [key]: warn + result }));
      if (storeKey) store.set(storeKey, warn + result);
    } catch (e) { setResults(p => ({ ...p, [key]: `Error: ${e.message}` })); }
    setLoading(p => ({ ...p, [key]: false }));
  };

  const runEng = () => runWithData("eng",
    "You are a Telegram engagement analyst. Extract patterns from channel data. Use tags: TOP PERFORMER:, PATTERN:, WEAK SPOT:, SUGGESTION:. Only analyze data provided — do not invent examples.",
    `Analyze engagement patterns for @${config.channelName || "channel"} (${config.niche}, ${config.followerCount} members). What formats, topics, and timing drive the best engagement? 5-7 specific bullets with multipliers and benchmarks.`,
    "tg-eng"
  );

  const runGap = async () => {
    setLoading(p => ({ ...p, gap: true }));
    try {
      const data = await loadChannelData();
      const realData = summarizeForLLM(data);
      const persona = store.get("tg-persona-profile", null);
      const r = await callClaude("You are a Telegram growth analyst. Use tags: CONTENT GAP:, TOPIC GAP:, FORMAT GAP:, ENGAGEMENT DRIFT:, SUGGESTION:.",
        `Weekly gap report for @${config.channelName} (${config.niche}).\n${realData ? `\n${realData}\n\nUse REAL DATA. Compare actual posts vs persona to find gaps.\n` : ""}\n${persona ? "Persona:\n" + persona.slice(0, 800) : "No persona yet."}\n6-8 bullets.`);
      const warn = realData ? "" : "⚠️ NO REAL POST DATA — generic estimates.\n\n";
      setResults(p => ({ ...p, gap: warn + r })); store.set("tg-gap", warn + r);
      sendSlack(`🧠 Gap Report\n${r.slice(0, 500)}...`);
    } catch (e) { setResults(p => ({ ...p, gap: `Error: ${e.message}` })); }
    setLoading(p => ({ ...p, gap: false }));
  };

  const genCalendar = async () => {
    setLoading(p => ({ ...p, cal: true }));
    try {
      const data = await loadChannelData();
      const realData = summarizeForLLM(data);
      const persona = store.get("tg-persona-profile", null);
      const r = await callClaude("Generate a 7-day Telegram content calendar. Each day: topic, format, posting time (KST), target metric, content hook.",
        `Calendar for @${config.channelName} (${config.niche}).\n${realData ? `\n${realData}\n\nBase topics on what actually performs well. Use best posting hours from data.\n` : ""}\n${persona ? "Persona:\n" + persona.slice(0, 400) : ""}\n${results.gap ? "Gaps:\n" + results.gap.slice(0, 400) : ""}\n7 days, specific topics, KST times.`);
      const warn = realData ? "" : "⚠️ NO REAL DATA — generic calendar.\n\n";
      setResults(p => ({ ...p, cal: warn + r })); store.set("tg-cal", warn + r);
      sendSlack(`📅 Calendar\n${r.slice(0, 500)}...`);
    } catch (e) { setResults(p => ({ ...p, cal: `Error: ${e.message}` })); }
    setLoading(p => ({ ...p, cal: false }));
  };

  const cards = [
    { key: "eng", title: "Engagement Patterns", subtitle: "What formats, topics, and timing drive engagement", accent: "#0d9488", run: runEng, actionLabel: "Mine Patterns", loading: loading.eng, result: results.eng },
    { key: "gap", title: "Content Gap Report", subtitle: "Compare posts vs audience wants", accent: "#f87171", run: runGap, actionLabel: "Run Gap Analysis", loading: loading.gap, result: results.gap },
    { key: "cal", title: "Content Calendar", subtitle: "Auto-generated 7-day plan", accent: "#60a5fa", run: genCalendar, actionLabel: "Generate", loading: loading.cal, result: results.cal },
  ];

  return <TwoPanel cards={cards} selected={selected} onSelect={setSelected} />;
}

// ─── Audience Tab ───
function AudienceTab({ config, channelData }) {
  const [selected, setSelected] = useState("persona");
  const [results, setResults] = useState({ persona: null, reactions: null, drift: null, profile: store.get("tg-persona-profile", null) });
  const [loading, setLoading] = useState({});

  const runWithData = async (key, system, prompt, storeKey) => {
    setLoading(p => ({ ...p, [key]: true }));
    try {
      const data = await loadChannelData();
      const realData = summarizeForLLM(data);
      const hasReal = !!realData;
      const extra = realData ? `\n\n${realData}\n\nIMPORTANT: Use the REAL DATA above.\n\n` : "";
      const result = await callClaude(system, extra + prompt);
      const warn = hasReal ? "" : "⚠️ NO REAL POST DATA — generic estimates.\n\n";
      setResults(p => ({ ...p, [key]: warn + result }));
      if (storeKey) store.set(storeKey, warn + result);
    } catch (e) { setResults(p => ({ ...p, [key]: `Error: ${e.message}` })); }
    setLoading(p => ({ ...p, [key]: false }));
  };

  const runPersona = () => runWithData("persona",
    "You are a Telegram audience researcher. Build a behavioral persona from engagement patterns. Use tags: PERSONA:, DEMAND:, SENTIMENT:, RECURRING:, CONTENT REQUEST:. IMPORTANT: Only analyze patterns visible in the data. Do NOT invent comment data.",
    `Build a follower persona for @${config.channelName || "channel"} (${config.niche}) based on engagement data.\n1. Which topics get highest views? (what audience seeks)\n2. Which posts get most reactions? (emotional triggers)\n3. Which get forwarded? (public identity)\n4. Which get ignored? (what they don't care about)\n5-7 insights grounded in actual performance data.`
  );

  const runReactions = async () => {
    setLoading(p => ({ ...p, reactions: true }));
    try {
      const data = await loadChannelData();
      let detail = "";
      if (data?.posts) {
        const byR = [...data.posts].sort((a, b) => b.reaction_total - a.reaction_total).slice(0, 15);
        detail = `\n\nTOP 15 MOST-REACTED POSTS:\n` + byR.map((p, i) => `${i+1}. [${p.reaction_total} total: ${p.reactions.map(r => `${r.emoji}${r.count}`).join(" ")} | ${p.views}v | ${p.media_type}]\n   "${p.text.slice(0, 150)}"`).join("\n");
        const low = [...data.posts].filter(p => p.views > 0).sort((a, b) => (a.reaction_total/a.views) - (b.reaction_total/b.views)).slice(0, 10);
        detail += `\n\nLOWEST REACTION RATE (high views, low reactions):\n` + low.map((p, i) => `${i+1}. [${p.reaction_total}r / ${p.views}v = ${(p.reaction_total/p.views*100).toFixed(1)}% | ${p.media_type}]\n   "${p.text.slice(0, 120)}"`).join("\n");
      }
      const realData = summarizeForLLM(data);
      const extra = realData ? `\n\n${realData}${detail}\n\nUse REAL DATA. Only reference actual reactions.\n\n` : "";
      const result = await callClaude(
        "You are a Telegram reaction analyst. Map reaction emoji clusters to content using ACTUAL per-post data. Use tags: SIGNAL:, PATTERN:, SHIFT:, INSIGHT:. Do not invent examples.",
        extra + `Decode reactions for @${config.channelName} (${config.niche}).\n1. Which emojis dominate and on what content?\n2. Posts with diverse vs single-emoji reactions?\n3. High-view + low-reaction meaning?\n4. Sentiment mismatches?\n5-6 insights with actual post references.`
      );
      const warn = realData ? "" : "⚠️ NO REAL DATA.\n\n";
      setResults(p => ({ ...p, reactions: warn + result }));
    } catch (e) { setResults(p => ({ ...p, reactions: `Error: ${e.message}` })); }
    setLoading(p => ({ ...p, reactions: false }));
  };

  const runDrift = async () => {
    setLoading(p => ({ ...p, drift: true }));
    try {
      const data = await loadChannelData();
      const realData = summarizeForLLM(data);
      const persona = store.get("tg-persona-profile", null);
      const r = await callClaude("You detect audience persona drift. Use tags: SHIFT DETECTED:, STABLE:, EMERGING INTEREST:, DECLINING INTEREST:, RECOMMENDATION:",
        `Drift detection for @${config.channelName} (${config.niche}).\n${realData ? `\n${realData}\n\nCompare older vs newer posts to detect actual drift.\n` : ""}\n${persona ? "Persona:\n" + persona.slice(0, 600) : ""}\n5-6 bullets.`);
      const warn = realData ? "" : "⚠️ NO REAL DATA.\n\n";
      setResults(p => ({ ...p, drift: warn + r }));
    } catch (e) { setResults(p => ({ ...p, drift: `Error: ${e.message}` })); }
    setLoading(p => ({ ...p, drift: false }));
  };

  const buildProfile = async () => {
    const inputs = [results.persona, results.reactions, results.drift].filter(Boolean).join("\n---\n");
    if (!inputs) { setResults(p => ({ ...p, profile: "⚠️ Run at least one analysis above first before building a unified profile." })); return; }
    setLoading(p => ({ ...p, profile: true }));
    try {
      const data = await loadChannelData();
      const realData = summarizeForLLM(data);
      const extra = realData ? `\n\n${realData}\n\n` : "";
      const r = await callClaude(
        "Synthesize into a unified persona profile. Format: ## Persona Summary, ## Content Preferences, ## Engagement Triggers, ## Unmet Demands, ## Strategic Recommendations. Only include data-supported insights.",
        extra + inputs
      );
      setResults(p => ({ ...p, profile: r }));
      store.set("tg-persona-profile", r);
      sendSlack(`👥 Persona updated\n${r.slice(0, 500)}...`);
    } catch (e) { setResults(p => ({ ...p, profile: `Error: ${e.message}` })); }
    setLoading(p => ({ ...p, profile: false }));
  };

  const cards = [
    { key: "persona", title: "Audience Persona", subtitle: "Infer who your audience is from engagement patterns", accent: "#8b5cf6", run: runPersona, actionLabel: "Extract Persona", loading: loading.persona, result: results.persona },
    { key: "reactions", title: "Reaction Decoder", subtitle: "Map emoji patterns to content types", accent: "#f59e0b", run: runReactions, actionLabel: "Decode", loading: loading.reactions, result: results.reactions },
    { key: "drift", title: "Persona Drift", subtitle: "Is your audience evolving?", accent: "#fbbf24", run: runDrift, actionLabel: "Detect Drift", loading: loading.drift, result: results.drift },
    { key: "profile", title: "Unified Profile", subtitle: "Synthesize all analyses into one profile", accent: "#ec4899", run: buildProfile, actionLabel: "Build Profile", loading: loading.profile, result: results.profile },
  ];

  return <TwoPanel cards={cards} selected={selected} onSelect={setSelected} />;
}

// ─── Network Tab ───
function NetworkTab({ config, channelData }) {
  const [selected, setSelected] = useState("forwards");
  const [forwardResult, setForwardResult] = useState(store.get("tg-forwards", null));
  const [shiftResult, setShiftResult] = useState(store.get("tg-shifts", null));
  const [tracked, setTracked] = useState(store.get("tg-tracked", []));
  const [input, setInput] = useState("");
  const [analyses, setAnalyses] = useState({});
  const [loading, setLoading] = useState({});

  const addChannel = () => {
    if (!input.trim()) return;
    const name = input.replace("https://t.me/", "").replace("t.me/", "").replace("@", "").trim();
    const updated = [...tracked, { name, addedAt: new Date().toISOString() }];
    setTracked(updated); store.set("tg-tracked", updated); setInput("");
  };
  const removeChannel = (i) => { const u = tracked.filter((_, idx) => idx !== i); setTracked(u); store.set("tg-tracked", u); };

  const analyzeChannel = async (name) => {
    setLoading(p => ({ ...p, [name]: true }));
    try {
      const data = await loadChannelData();
      const realData = summarizeForLLM(data);
      let trackedAll = await loadTrackedData();
      let compData = trackedAll?.[name] ? summarizeTrackedChannel(trackedAll[name]) : null;
      if (!compData) {
        setAnalyses(p => ({ ...p, [name]: `⏳ Collecting @${name}...` }));
        try { await collectChannelOnDemand(name); trackedAll = await loadTrackedData(true); compData = trackedAll?.[name] ? summarizeTrackedChannel(trackedAll[name]) : null; }
        catch (e) { setAnalyses(p => ({ ...p, [name]: `⚠️ Could not collect @${name}: ${e.message}` })); setLoading(p => ({ ...p, [name]: false })); return; }
        if (!compData) { setAnalyses(p => ({ ...p, [name]: `⚠️ No data found for @${name}` })); setLoading(p => ({ ...p, [name]: false })); return; }
      }
      const comp = trackedAll[name], compPosts = comp.posts || [];
      const compTopViews = [...compPosts].sort((a, b) => b.views - a.views).slice(0, 10);
      const compTopFwd = [...compPosts].sort((a, b) => b.forwards - a.forwards).slice(0, 5);
      const compFormats = {}, compHours = {};
      compPosts.forEach(p => { compFormats[p.media_type] = (compFormats[p.media_type] || 0) + 1; });
      compPosts.forEach(p => { const h = new Date(p.date).getHours(); compHours[h] = (compHours[h] || 0) + 1; });
      const r = await callClaude(
        "You are a Telegram channel synergy analyst. Use tags: OVERLAP:, THEIR AUDIENCE LOVES:, FORWARD OPPORTUNITY:, CONTENT BRIDGE:, SYNERGY:, GAP:",
        `SYNERGY ANALYSIS:\n═══ MY CHANNEL ═══\n${realData}\n\n═══ @${name} ═══\n${compData}\nTHEIR TOP 10: ${compTopViews.map((p, i) => `\n${i+1}. [${p.views}v, ${p.forwards}fwd] ${p.text.slice(0, 150)}`).join("")}\nTHEIR FORMATS: ${JSON.stringify(compFormats)}\nTHEIR HOURS: ${JSON.stringify(compHours)}\n\n6-8 bullets. Reference actual posts.`
      );
      setAnalyses(p => ({ ...p, [name]: r }));
    } catch (e) { setAnalyses(p => ({ ...p, [name]: `Error: ${e.message}` })); }
    setLoading(p => ({ ...p, [name]: false }));
  };

  const runForwards = async () => {
    setLoading(p => ({ ...p, fwd: true }));
    try {
      const data = await loadChannelData();
      if (!data) { setForwardResult("Error: No data. Run collect_data.py first."); setLoading(p => ({ ...p, fwd: false })); return; }
      const chainData = summarizeForwardChains(data);
      const all = data.posts || [], withFwd = [...all].filter(p => p.forwards > 0).sort((a, b) => b.forwards - a.forwards);
      const top20 = withFwd.slice(0, 20), bot20 = withFwd.slice(-20);
      const topFmt = {}, botFmt = {};
      top20.forEach(p => { topFmt[p.media_type] = (topFmt[p.media_type] || 0) + 1; });
      bot20.forEach(p => { botFmt[p.media_type] = (botFmt[p.media_type] || 0) + 1; });
      const r = await callClaude(
        "You are a Telegram forward/distribution analyst. Use tags: AMPLIFIER PATTERN:, FORWARD TRIGGER:, DEAD CONTENT:, OPPORTUNITY:, ACTION:, VIRAL ELEMENT:. Reference actual posts.",
        `FORWARD ANALYSIS for @${data.summary.channel}:\nTotal: ${all.length} posts | With forwards: ${withFwd.length} | Total forwards: ${withFwd.reduce((s, p) => s + p.forwards, 0)}\n\nTOP 20 FORWARDED:\n${top20.map((p, i) => `${i+1}. [${p.forwards}fwd | ${p.views}v | ${p.media_type} | ${p.text_length}ch]\n   "${p.text.slice(0, 200)}"`).join("\n")}\n\nBOTTOM 20:\n${bot20.map((p, i) => `${i+1}. [${p.forwards}fwd | ${p.views}v | ${p.media_type}] "${p.text.slice(0, 120)}"`).join("\n")}\n\nTop formats: ${JSON.stringify(topFmt)} | Bottom: ${JSON.stringify(botFmt)}\n${chainData || ""}\n\n6-8 bullets citing actual posts.`
      );
      setForwardResult(r); store.set("tg-forwards", r);
    } catch (e) { setForwardResult(`Error: ${e.message}`); }
    setLoading(p => ({ ...p, fwd: false }));
  };

  const runShift = async () => {
    setLoading(p => ({ ...p, shift: true }));
    try {
      const data = await loadChannelData();
      if (!data) { setShiftResult("Error: No data."); setLoading(p => ({ ...p, shift: false })); return; }
      const trackedAll = await loadTrackedData();
      const posts = data.posts || [], mid = Math.floor(posts.length / 2);
      const older = posts.slice(0, mid), newer = posts.slice(mid);
      const topicSummary = (arr, label) => {
        const fmt = {}; arr.forEach(p => { fmt[p.media_type] = (fmt[p.media_type] || 0) + 1; });
        const top = [...arr].sort((a, b) => b.views - a.views).slice(0, 5);
        return `${label} (${arr[0]?.date?.slice(0,10)} → ${arr[arr.length-1]?.date?.slice(0,10)}, ${arr.length} posts):\n  Avg views: ${Math.round(arr.reduce((s, p) => s + p.views, 0) / arr.length)} | Formats: ${JSON.stringify(fmt)}\n  Top:\n${top.map((p, i) => `    ${i+1}. [${p.views}v] ${p.text.slice(0, 120)}`).join("\n")}\n  Recent:\n${arr.slice(-10).map(p => `    - ${p.text.slice(0, 80)}`).join("\n")}`;
      };
      let compSection = "";
      if (trackedAll) {
        for (const ch of tracked) {
          const cd = trackedAll[ch.name]; if (!cd || cd.error || !cd.posts?.length) continue;
          const cp = cd.posts, cm = Math.floor(cp.length / 2);
          compSection += `\n\n═══ @${ch.name} ═══\n${topicSummary(cp.slice(cm), "RECENT")}`;
        }
      }
      const r = await callClaude(
        "You are a topic shift analyst. Use tags: EMERGING:, DECLINING:, SHIFT:, SATURATION:, OPPORTUNITY:, CROSS-CHANNEL:. Cite actual posts.",
        `TOPIC SHIFT for @${data.summary.channel} (${config.niche}):\n═══ OLDER ═══\n${topicSummary(older, "OLDER")}\n═══ RECENT ═══\n${topicSummary(newer, "RECENT")}${compSection}\n\n6-8 bullets.`
      );
      setShiftResult(r); store.set("tg-shifts", r);
      sendSlack(`🔍 Topic Shift\n${r.slice(0, 500)}...`);
    } catch (e) { setShiftResult(`Error: ${e.message}`); }
    setLoading(p => ({ ...p, shift: false }));
  };

  const trackedContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addChannel()}
          placeholder="@channel or t.me/channel" style={{ flex: 1, background: "#0a0a12", border: "1px solid #1e1e2e", borderRadius: 8, padding: "8px 12px", color: "#e2e2ed", fontSize: 13, outline: "none" }} />
        <button onClick={addChannel} style={{ padding: "8px 16px", borderRadius: 8, background: "#0d9488", border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Add</button>
      </div>
      {tracked.map((ch, i) => (
        <div key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#0a0a12", borderRadius: 8, border: "1px solid #1a1a2a" }}>
            <span style={{ fontSize: 13, color: "#0891b2", fontFamily: "monospace", fontWeight: 500 }}>@{ch.name}</span>
            <span style={{ fontSize: 11, color: "#3a3a50", marginLeft: "auto" }}>{new Date(ch.addedAt).toLocaleDateString()}</span>
            <button onClick={() => analyzeChannel(ch.name)} disabled={loading[ch.name]} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#60a5fa", cursor: "pointer" }}>
              {loading[ch.name] ? "..." : "Analyze"}
            </button>
            <button onClick={() => removeChannel(i)} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "transparent", border: "1px solid #2a1a1a", color: "#f87171", cursor: "pointer" }}>✕</button>
          </div>
          {analyses[ch.name] && <div style={{ marginTop: 8 }}><ResultBlock text={analyses[ch.name]} /></div>}
        </div>
      ))}
      {!tracked.length && <p style={{ fontSize: 12, color: "#5a5a70", textAlign: "center", padding: 20 }}>No channels tracked yet.</p>}
    </div>
  );

  const cards = [
    { key: "forwards", title: "Forward Chains", subtitle: "Who amplifies your content and why", accent: "#0d9488", run: runForwards, actionLabel: "Analyze Forwards", loading: loading.fwd, result: forwardResult },
    { key: "tracked", title: "Tracked Channels", subtitle: "Add and analyze similar channels", accent: "#8b5cf6", result: tracked.length > 0 ? "configured" : null },
    { key: "shift", title: "Topic Shift Radar", subtitle: "What's emerging and declining in your niche", accent: "#f59e0b", run: runShift, actionLabel: "Run Radar", loading: loading.shift, result: shiftResult },
  ];

  return <TwoPanel cards={cards} selected={selected} onSelect={setSelected} customRight={selected === "tracked" ? { key: "tracked", render: trackedContent } : null} />;
}

// ─── Settings Tab ───
function SettingsTab({ config, setConfig, save }) {
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const doSave = () => { save(); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const testBot = async () => { try { const i = await getChannelInfo(config.channelName); const c = await getMemberCount(config.channelName); setTestResult(`✅ ${i.title} | ${c} members`); } catch (e) { setTestResult(`❌ ${e.message}`); } };
  const testClaude = async () => { try { const r = await callClaude("Reply with exactly: Connection OK", "Test"); setTestResult(`✅ Claude: ${r.slice(0, 50)}`); } catch (e) { setTestResult(`❌ Claude: ${e.message}`); } };

  const Field = ({ label, field, placeholder, type }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: "#5a5a70", marginBottom: 6, fontWeight: 500 }}>{label}</label>
      <input type={type || "text"} value={config[field] || ""} onChange={e => setConfig(p => ({ ...p, [field]: e.target.value }))}
        placeholder={placeholder} style={{ width: "100%", background: "#0a0a12", border: "1px solid #1e1e2e", borderRadius: 8, padding: "10px 14px", color: "#e2e2ed", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "#111119", border: "1px solid #1e1e2e", borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#e2e2ed", margin: "0 0 14px" }}>Channel</h3>
        <Field label="Channel username (without @)" field="channelName" placeholder="mychannel" />
        <Field label="Niche" field="niche" placeholder="crypto, DeFi, personal growth..." />
        <Field label="Approx members (fallback)" field="followerCount" placeholder="5000" />
      </div>
      <div style={{ background: "#111119", border: "1px solid #1e1e2e", borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#e2e2ed", margin: "0 0 14px" }}>API Keys</h3>
        <Field label="Telegram Bot Token" field="botToken" placeholder="123456:ABC-DEF..." type="password" />
        <div style={{ fontSize: 11, color: "#5a5a70", marginTop: -8 }}>
          Claude API key is configured server-side in <code style={{ color: "#60a5fa" }}>.env</code> → <code style={{ color: "#60a5fa" }}>CLAUDE_API_KEY</code>
        </div>
      </div>
      <div style={{ background: "#111119", border: "1px solid #1e1e2e", borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#e2e2ed", margin: "0 0 14px" }}>Slack</h3>
        <Field label="Incoming Webhook URL" field="slackWebhook" placeholder="https://hooks.slack.com/services/..." type="password" />
      </div>
      {testResult && <div style={{ padding: "10px 14px", background: "#0a0a12", borderRadius: 8, fontSize: 13, color: testResult.startsWith("✅") ? "#34d399" : "#f87171", border: "1px solid #1a1a2a" }}>{testResult}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={doSave} style={{ flex: 1, padding: "12px", borderRadius: 10, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", background: saved ? "#065f46" : "linear-gradient(135deg, #0d9488, #0891b2)", color: "#fff" }}>
          {saved ? "✓ Saved" : "Save Configuration"}
        </button>
        <button onClick={testBot} style={{ padding: "12px 16px", borderRadius: 10, fontSize: 12, border: "1px solid #1e1e2e", background: "#111119", color: "#0891b2", cursor: "pointer" }}>Test Bot</button>
        <button onClick={testClaude} style={{ padding: "12px 16px", borderRadius: 10, fontSize: 12, border: "1px solid #1e1e2e", background: "#111119", color: "#a78bfa", cursor: "pointer" }}>Test Claude</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ─── App Shell ───
// ═══════════════════════════════════════════════

const TABS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "content", label: "Content", icon: "📝" },
  { id: "audience", label: "Audience", icon: "👥" },
  { id: "network", label: "Network", icon: "🔗" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export default function App() {
  const [tab, setTab] = useState("overview");
  const [config, setConfig] = useState({ channelName: "", niche: "", followerCount: "", botToken: "", slackWebhook: "" });
  const [channelData, setChannelData] = useState(null);
  const [channelInfo, setChannelInfo] = useState(null);
  const [memberCount, setMemberCount] = useState(null);
  const [collectorUp, setCollectorUp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);

  useEffect(() => { setConfig(store.get("tg-config", config)); }, []);
  useEffect(() => { loadChannelData().then(setChannelData); }, []);
  useEffect(() => {
    fetch(`${COLLECTOR_URL}/status`, { headers: collectorHeaders() }).then(r => { if (r.ok) setCollectorUp(true); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!config.channelName) return;
    getChannelInfo(config.channelName).then(setChannelInfo).catch(() => {});
    getMemberCount(config.channelName).then(setMemberCount).catch(() => {});
  }, [config.channelName, config.botToken]);

  const save = () => store.set("tg-config", config);

  const refreshData = async () => {
    setRefreshing(true); setRefreshMsg(null);
    try {
      const result = await collectOwnChannel();
      setRefreshMsg(`Collected ${result.post_count} posts`);
      _channelData = null;
      const fresh = await loadChannelData();
      setChannelData(fresh);
    } catch (e) { setRefreshMsg(`Error: ${e.message}`); }
    setRefreshing(false);
    setTimeout(() => setRefreshMsg(null), 5000);
  };

  const stats = channelData?.summary?.stats;
  const fwdRate = stats && stats.avg_views > 0 ? ((stats.avg_forwards / stats.avg_views) * 100).toFixed(1) : null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans', -apple-system, sans-serif", background: "#08080e", color: "#e2e2ed" }}>
      {/* Sidebar */}
      <div style={{ width: 200, background: "#0a0a12", borderRight: "1px solid #1a1a2a", padding: "20px 10px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px", marginBottom: 24 }}>
          <span style={{ fontSize: 20 }}>✈️</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>TG Growth</div>
            <div style={{ fontSize: 9, color: "#0891b2", fontWeight: 600, letterSpacing: "0.08em" }}>LOCAL v2.0</div>
          </div>
        </div>

        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px", borderRadius: 8,
            background: tab === t.id ? "#0d948818" : "transparent", border: tab === t.id ? "1px solid #0d948833" : "1px solid transparent",
            color: tab === t.id ? "#0891b2" : "#5a5a70", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left", marginBottom: 2,
          }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
          </button>
        ))}

        <div style={{ marginTop: "auto", padding: "10px 8px", borderTop: "1px solid #1a1a2a", fontSize: 11, color: "#3a3a50" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: config.botToken ? "#34d399" : "#f87171" }} />
            Bot {config.botToken ? "ok" : "missing"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: collectorUp ? "#34d399" : "#f87171" }} />
            Collector {collectorUp ? "running" : "offline"}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: "16px 24px", overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Global Summary Strip */}
        {tab !== "settings" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <MetricBox label="Channel" value={channelInfo?.title || config.channelName || "—"} color="#0891b2" sub={channelInfo ? "connected" : "set in settings"} />
            <MetricBox label="Members" value={memberCount?.toLocaleString() || config.followerCount || "—"} sub="live" />
            <MetricBox label="Avg Views" value={stats?.avg_views?.toLocaleString() || "—"} color="#34d399" sub={stats ? `max ${stats.max_views?.toLocaleString()}` : ""} />
            <MetricBox label="Fwd Rate" value={fwdRate ? `${fwdRate}%` : "—"} color="#fbbf24" sub={stats ? `avg ${stats.avg_forwards}/post` : ""} />
            <MetricBox label="Reactions" value={stats?.avg_reactions || "—"} color="#a78bfa" sub="avg/post" />
            <div style={{ background: "#0d0d16", borderRadius: 8, padding: "10px 12px", border: "1px solid #1a1a2a", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 10, color: "#5a5a70", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Data</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: channelData ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                {channelData ? `${channelData.summary.total_posts_collected} posts` : "None"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <span style={{ fontSize: 10, color: "#5a5a70" }}>{channelData?.summary.collected_at?.slice(0, 10) || ""}</span>
                <button onClick={refreshData} disabled={refreshing} style={{
                  fontSize: 9, padding: "2px 8px", borderRadius: 4, border: "1px solid #1e1e2e",
                  background: refreshing ? "#1a1a2e" : "#0d9488", color: "#fff", cursor: refreshing ? "wait" : "pointer", fontWeight: 600,
                }}>
                  {refreshing ? "..." : "Refresh"}
                </button>
              </div>
            </div>
            {refreshMsg && <div style={{ display: "flex", alignItems: "center", padding: "0 12px", fontSize: 11, color: refreshMsg.startsWith("Error") ? "#f87171" : "#34d399" }}>{refreshMsg}</div>}
          </div>
        )}

        {/* Tab Content */}
        <div style={{ flex: 1 }}>
          {tab === "overview" && <OverviewTab config={config} channelData={channelData} />}
          {tab === "content" && <ContentTab config={config} channelData={channelData} />}
          {tab === "audience" && <AudienceTab config={config} channelData={channelData} />}
          {tab === "network" && <NetworkTab config={config} channelData={channelData} />}
          {tab === "settings" && <SettingsTab config={config} setConfig={setConfig} save={save} />}
        </div>
      </div>
    </div>
  );
}
