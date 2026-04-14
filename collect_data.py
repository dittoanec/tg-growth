#!/usr/bin/env python3
"""
Telegram Channel Data Collector
Pulls your channel's post history with full metrics (views, forwards, reactions).
Also collects tracked competitor channels and forward chain data.

Usage:
  pip install telethon
  python collect_data.py

First run: you'll need to enter your phone number to authenticate.
After that, the session is saved and reused automatically.

Why not Bot API? The Bot API can't pull channel post history.
Telethon uses the full Telegram MTProto API which CAN.
"""

import json, os, sys, asyncio, urllib.parse, urllib.request
from datetime import datetime, timezone
from collections import defaultdict
from telethon import TelegramClient
from telethon.tl.functions.messages import GetHistoryRequest
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument

# ─── Load .env if present ───
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

# ─── CONFIG ───
API_ID = os.environ.get("TG_API_ID", "")
API_HASH = os.environ.get("TG_API_HASH", "")
CHANNEL = os.environ.get("CHANNEL_USERNAME") or os.environ.get("TG_CHANNEL", "")
COLLECTOR_TOKEN = os.environ.get("COLLECTOR_TOKEN", "")
CLAUDE_API_KEY = os.environ.get("CLAUDE_API_KEY", "") or os.environ.get("VITE_CLAUDE_API_KEY", "")
OUTPUT_FILE = "channel_data.json"
TRACKED_FILE = "tracked_channels.json"
POST_LIMIT = 200
ALLOWED_ORIGIN = "http://localhost:5173"

# ─── Shared helpers ───

def extract_post(msg):
    """Extract a structured post dict from a Telethon message."""
    media_type = "none"
    if isinstance(msg.media, MessageMediaPhoto):
        media_type = "photo"
    elif isinstance(msg.media, MessageMediaDocument):
        doc = msg.media.document
        if doc:
            mime = doc.mime_type or ""
            if "video" in mime: media_type = "video"
            elif "audio" in mime: media_type = "audio"
            elif "image" in mime: media_type = "image"
            else: media_type = "document"

    reactions = []
    if msg.reactions:
        for r in msg.reactions.results:
            emoji = getattr(r.reaction, 'emoticon', None) or str(r.reaction)
            reactions.append({"emoji": emoji, "count": r.count})

    return {
        "id": msg.id,
        "date": msg.date.isoformat(),
        "text": msg.message or "",
        "views": msg.views or 0,
        "forwards": msg.forwards or 0,
        "replies": msg.replies.replies if msg.replies else 0,
        "reactions": reactions,
        "reaction_total": sum(r["count"] for r in reactions),
        "media_type": media_type,
        "has_link": "http" in (msg.message or ""),
        "text_length": len(msg.message or ""),
        "edit_date": msg.edit_date.isoformat() if msg.edit_date else None,
    }


def compute_daily_stats(posts):
    """Group posts by date and compute daily aggregates."""
    daily_stats = defaultdict(lambda: {"posts": 0, "total_views": 0, "total_reactions": 0, "total_forwards": 0, "avg_views": 0, "contents": []})
    for p in posts:
        day = p["date"][:10]
        daily_stats[day]["posts"] += 1
        daily_stats[day]["total_views"] += p["views"]
        daily_stats[day]["total_reactions"] += p["reaction_total"]
        daily_stats[day]["total_forwards"] += p["forwards"]
        daily_stats[day]["contents"].append({
            "text": p["text"][:200],
            "views": p["views"],
            "forwards": p["forwards"],
            "reactions": p["reaction_total"],
            "media_type": p["media_type"],
        })
    for day in daily_stats:
        s = daily_stats[day]
        s["avg_views"] = round(s["total_views"] / s["posts"]) if s["posts"] > 0 else 0
    return dict(daily_stats)


def compute_summary_stats(posts):
    """Compute aggregate stats for a list of posts."""
    if not posts:
        return {}
    views = [p["views"] for p in posts if p["views"] > 0]
    forwards = [p["forwards"] for p in posts if p["forwards"] > 0]
    return {
        "avg_views": round(sum(views) / len(views)) if views else 0,
        "max_views": max(views) if views else 0,
        "avg_forwards": round(sum(forwards) / len(forwards), 1) if forwards else 0,
        "max_forwards": max(forwards) if forwards else 0,
        "posts_with_media": sum(1 for p in posts if p["media_type"] != "none"),
        "posts_with_links": sum(1 for p in posts if p["has_link"]),
        "avg_reactions": round(sum(p["reaction_total"] for p in posts) / len(posts), 1),
    }


async def collect_channel(client, channel_name, limit=200):
    """Collect posts from a single channel. Returns (entity, posts) or raises."""
    channel = await client.get_entity(channel_name)
    print(f"  📡 {channel.title} (@{channel_name})")

    messages = await client.get_messages(channel, limit=limit)
    posts = []
    for msg in messages:
        if msg.message is None and msg.media is None:
            continue
        posts.append(extract_post(msg))

    posts.sort(key=lambda p: p["date"])
    print(f"  📥 {len(posts)} posts collected")
    return channel, posts


# ─── Forward chain tracking ───

async def collect_forward_chains(client, channel_name, posts, top_n=20):
    """
    For the top N most-forwarded posts, find which public channels forwarded them.
    Uses GetBroadcastStats or searches for forwarded messages.
    """
    from telethon.tl.functions.stats import GetMessagePublicForwardsRequest
    from telethon.errors import ChatAdminRequiredError, RPCError

    channel = await client.get_entity(channel_name)

    # Sort by forwards, take top N that actually have forwards
    forwarded_posts = sorted(
        [p for p in posts if p["forwards"] > 0],
        key=lambda p: p["forwards"],
        reverse=True
    )[:top_n]

    if not forwarded_posts:
        print("  ⚠️  No forwarded posts found")
        return {"chains": [], "amplifiers": {}}

    chains = []
    amplifier_counts = defaultdict(lambda: {"count": 0, "name": "", "total_views": 0, "members": 0})

    for post in forwarded_posts:
        try:
            result = await client(GetMessagePublicForwardsRequest(
                channel=channel,
                msg_id=post["id"],
                offset="",
                limit=100
            ))

            # Build chat lookup from result.chats
            chat_map = {}
            for c in (result.chats or []):
                chat_map[c.id] = c

            forwarders = []
            for fwd in (result.forwards or []):
                msg = fwd.message if hasattr(fwd, 'message') else fwd
                if hasattr(msg, 'peer_id') and hasattr(msg.peer_id, 'channel_id'):
                    ch_id = msg.peer_id.channel_id
                    ch_info = chat_map.get(ch_id)
                    if ch_info:
                        username = getattr(ch_info, 'username', None) or str(ch_id)
                        title = getattr(ch_info, 'title', username)
                        members = getattr(ch_info, 'participants_count', 0) or 0
                        forwarders.append({
                            "channel": username,
                            "title": title,
                            "members": members,
                            "date": msg.date.isoformat() if msg.date else None,
                            "views": msg.views or 0,
                        })
                        amplifier_counts[username]["count"] += 1
                        amplifier_counts[username]["name"] = title
                        amplifier_counts[username]["total_views"] += msg.views or 0
                        amplifier_counts[username]["members"] = max(amplifier_counts[username]["members"], members)

            if forwarders:
                chains.append({
                    "post_id": post["id"],
                    "post_text": post["text"][:150],
                    "post_views": post["views"],
                    "post_forwards": post["forwards"],
                    "public_forwards_found": result.count or len(forwarders),
                    "forwarders": forwarders,
                })

        except ChatAdminRequiredError:
            print(f"  ⚠️  Need admin/stats access for forward tracking (post {post['id']})")
            break
        except RPCError as e:
            if "BROADCAST_PUBLIC_VOTERS_FORBIDDEN" in str(e) or "STATS" in str(e):
                print(f"  ⚠️  Stats API not available (channel may need 500+ members or admin access)")
                break
            print(f"  ⚠️  RPC error for post {post['id']}: {e}")
            continue

        await asyncio.sleep(0.5)  # rate limit

    # Sort amplifiers by frequency
    amplifiers = dict(sorted(amplifier_counts.items(), key=lambda x: x[1]["count"], reverse=True))

    print(f"  🔗 Found {len(chains)} forward chains, {len(amplifiers)} unique amplifier channels")
    return {"chains": chains, "amplifiers": amplifiers}


# ─── Main ───

async def main():
    if not API_ID or not API_HASH:
        print("\n⚠️  You need Telegram API credentials (one-time setup):")
        print("   1. Go to https://my.telegram.org")
        print("   2. Log in with your phone number")
        print("   3. Click 'API Development Tools'")
        print("   4. Create an app (any name/description)")
        print("   5. Copy the 'api_id' and 'api_hash'")
        print(f"\n   Then run:")
        print(f"   TG_API_ID=12345 TG_API_HASH=abc123 python {sys.argv[0]}")
        return

    client = TelegramClient("tg_growth_session", int(API_ID), API_HASH)
    await client.start()
    print(f"✅ Connected to Telegram as {(await client.get_me()).first_name}")

    # ─── 1. Collect own channel ───
    print(f"\n{'='*50}")
    print(f"📡 Collecting YOUR channel: @{CHANNEL}")
    print(f"{'='*50}")

    channel, posts = await collect_channel(client, CHANNEL, POST_LIMIT)
    daily_stats = compute_daily_stats(posts)

    # Admin log for member changes
    admin_log_events = []
    try:
        from telethon.tl.functions.channels import GetAdminLogRequest
        from telethon.tl.types import ChannelAdminLogEventsFilter
        events_filter = ChannelAdminLogEventsFilter(join=True, leave=True)
        result = await client(GetAdminLogRequest(
            channel=channel, q="", min_id=0, max_id=0, limit=200,
            events_filter=events_filter, admins=[]
        ))
        for event in result.events:
            action_type = type(event.action).__name__
            if "Join" in action_type:
                admin_log_events.append({"date": event.date.isoformat(), "action": "join"})
            elif "Leave" in action_type:
                admin_log_events.append({"date": event.date.isoformat(), "action": "leave"})
        print(f"  📊 {len(admin_log_events)} join/leave events from admin log")
    except Exception as e:
        print(f"  ⚠️  Admin log not available: {e}")

    # Merge with previously saved member changes (admin log only keeps ~48h)
    daily_member_changes = defaultdict(lambda: {"joins": 0, "leaves": 0, "net": 0})
    try:
        if os.path.exists(OUTPUT_FILE):
            with open(OUTPUT_FILE, "r") as f:
                old_data = json.load(f)
            for day, v in old_data.get("daily_member_changes", {}).items():
                daily_member_changes[day] = v
            print(f"  📂 Loaded {len(daily_member_changes)} days of historical member data")
    except Exception:
        pass

    # Add fresh events (overwrite days we have new data for)
    fresh_days = defaultdict(lambda: {"joins": 0, "leaves": 0, "net": 0})
    for ev in admin_log_events:
        day = ev["date"][:10]
        if ev["action"] == "join":
            fresh_days[day]["joins"] += 1
        else:
            fresh_days[day]["leaves"] += 1
        fresh_days[day]["net"] = fresh_days[day]["joins"] - fresh_days[day]["leaves"]
    daily_member_changes.update(fresh_days)

    member_count = (await client.get_participants(channel, limit=0)).total
    summary = {
        "channel": CHANNEL,
        "title": channel.title,
        "description": getattr(channel, 'about', '') or '',
        "member_count": member_count,
        "total_posts_collected": len(posts),
        "date_range": {
            "from": posts[0]["date"] if posts else None,
            "to": posts[-1]["date"] if posts else None,
        },
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    if posts:
        summary["stats"] = compute_summary_stats(posts)

    # ─── 2. Forward chain tracking ───
    print(f"\n{'='*50}")
    print(f"🔗 Tracking forward chains for @{CHANNEL}")
    print(f"{'='*50}")

    forward_chains = await collect_forward_chains(client, CHANNEL, posts)

    # ─── 3. Save own channel data ───
    output = {
        "summary": summary,
        "posts": posts,
        "daily_stats": daily_stats,
        "daily_member_changes": dict(daily_member_changes),
        "forward_chains": forward_chains,
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Saved {len(posts)} posts to {OUTPUT_FILE}")

    # ─── 4. Collect tracked channels ───
    tracked_channels = {}

    # Load tracked list from dashboard's localStorage export or a config file
    tracked_config_file = "tracked_list.json"
    tracked_names = []

    if os.path.exists(tracked_config_file):
        with open(tracked_config_file, "r") as f:
            tracked_names = json.load(f)
        print(f"\n📋 Loaded {len(tracked_names)} tracked channels from {tracked_config_file}")
    else:
        # Check command line args
        if len(sys.argv) > 1 and sys.argv[1] == "--tracked":
            tracked_names = sys.argv[2:]
        if not tracked_names:
            print(f"\n💡 To track competitor channels, create {tracked_config_file}:")
            print(f'   echo \'["channel1", "channel2"]\' > {tracked_config_file}')
            print(f"   Or run: python {sys.argv[0]} --tracked channel1 channel2")

    for name in tracked_names:
        name = name.replace("@", "").replace("https://t.me/", "").strip()
        if not name or name == CHANNEL:
            continue

        print(f"\n{'='*50}")
        print(f"🔍 Collecting competitor: @{name}")
        print(f"{'='*50}")

        try:
            ch_entity, ch_posts = await collect_channel(client, name, POST_LIMIT)
            ch_member_count = 0
            try:
                ch_member_count = (await client.get_participants(ch_entity, limit=0)).total
            except:
                ch_member_count = getattr(ch_entity, 'participants_count', 0) or 0

            ch_summary = {
                "channel": name,
                "title": ch_entity.title,
                "description": getattr(ch_entity, 'about', '') or '',
                "member_count": ch_member_count,
                "total_posts_collected": len(ch_posts),
                "date_range": {
                    "from": ch_posts[0]["date"] if ch_posts else None,
                    "to": ch_posts[-1]["date"] if ch_posts else None,
                },
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
            if ch_posts:
                ch_summary["stats"] = compute_summary_stats(ch_posts)

            tracked_channels[name] = {
                "summary": ch_summary,
                "posts": ch_posts,
                "daily_stats": compute_daily_stats(ch_posts),
            }
            print(f"  ✅ {len(ch_posts)} posts | {ch_member_count} members")

        except Exception as e:
            print(f"  ❌ Failed to collect @{name}: {e}")
            tracked_channels[name] = {"error": str(e)}

        await asyncio.sleep(1)  # rate limit between channels

    # Save tracked channels data
    if tracked_channels:
        with open(TRACKED_FILE, "w", encoding="utf-8") as f:
            json.dump(tracked_channels, f, ensure_ascii=False, indent=2)
        print(f"\n✅ Saved {len(tracked_channels)} tracked channels to {TRACKED_FILE}")

    # ─── Summary ───
    print(f"\n{'='*50}")
    print(f"📊 COLLECTION COMPLETE")
    print(f"{'='*50}")
    print(f"   Your channel: {member_count} members, {len(posts)} posts")
    print(f"   Forward chains: {len(forward_chains.get('chains', []))} traced, {len(forward_chains.get('amplifiers', {}))} amplifiers")
    print(f"   Tracked channels: {len(tracked_channels)}")
    if posts:
        print(f"   Date range: {posts[0]['date'][:10]} → {posts[-1]['date'][:10]}")
        print(f"   Avg views: {summary['stats']['avg_views']}")
    print(f"\n📂 Copy {OUTPUT_FILE} and {TRACKED_FILE} to your tg-growth/public/ folder")
    print(f"   Then restart the dashboard (npm run dev)")

    await client.disconnect()

async def collect_single_channel(channel_name):
    """Collect a single channel on demand. Returns the channel data dict."""
    client = TelegramClient("tg_growth_session", int(API_ID), API_HASH)
    await client.start()

    name = channel_name.replace("@", "").replace("https://t.me/", "").replace("t.me/", "").strip()
    ch_entity, ch_posts = await collect_channel(client, name, POST_LIMIT)

    ch_member_count = 0
    try:
        ch_member_count = (await client.get_participants(ch_entity, limit=0)).total
    except:
        ch_member_count = getattr(ch_entity, 'participants_count', 0) or 0

    ch_data = {
        "summary": {
            "channel": name,
            "title": ch_entity.title,
            "description": getattr(ch_entity, 'about', '') or '',
            "member_count": ch_member_count,
            "total_posts_collected": len(ch_posts),
            "date_range": {
                "from": ch_posts[0]["date"] if ch_posts else None,
                "to": ch_posts[-1]["date"] if ch_posts else None,
            },
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "stats": compute_summary_stats(ch_posts) if ch_posts else {},
        },
        "posts": ch_posts,
        "daily_stats": compute_daily_stats(ch_posts),
    }

    # Merge into tracked_channels.json
    existing = {}
    public_path = os.path.join("public", TRACKED_FILE)
    for path in [TRACKED_FILE, public_path]:
        if os.path.exists(path):
            with open(path, "r") as f:
                existing = json.load(f)
            break

    existing[name] = ch_data
    for path in [TRACKED_FILE, public_path]:
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)

    # Also update tracked_list.json
    tracked_list = []
    if os.path.exists("tracked_list.json"):
        with open("tracked_list.json", "r") as f:
            tracked_list = json.load(f)
    if name not in tracked_list:
        tracked_list.append(name)
        with open("tracked_list.json", "w") as f:
            json.dump(tracked_list, f, ensure_ascii=False, indent=2)

    await client.disconnect()
    return ch_data


# ─── HTTP API for on-demand collection ───

async def serve():
    """Run a local HTTP server that the dashboard can call to collect channels."""
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import threading

    loop = asyncio.get_event_loop()

    class Handler(BaseHTTPRequestHandler):
        def _check_auth(self):
            if not COLLECTOR_TOKEN:
                return True
            token = self.headers.get("Authorization", "").replace("Bearer ", "")
            if token == COLLECTOR_TOKEN:
                return True
            self._json_response(401, {"error": "Unauthorized — invalid or missing token"})
            return False

        def _cors_headers(self):
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

        def do_OPTIONS(self):
            self.send_response(200)
            self._cors_headers()
            self.end_headers()

        def do_POST(self):
            if not self._check_auth():
                return
            parsed = urllib.parse.urlparse(self.path)

            if parsed.path == "/api/claude":
                content_len = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(content_len)) if content_len else {}
                system = body.get("system", "")
                user = body.get("user", "")
                max_tokens = body.get("max_tokens", 2000)

                if not CLAUDE_API_KEY:
                    self._json_response(500, {"error": "No CLAUDE_API_KEY configured on the server. Add it to .env"})
                    return

                try:
                    req_data = json.dumps({
                        "model": "claude-sonnet-4-20250514",
                        "max_tokens": max_tokens,
                        "system": system,
                        "messages": [{"role": "user", "content": user}],
                    }).encode()
                    req = urllib.request.Request(
                        "https://api.anthropic.com/v1/messages",
                        data=req_data,
                        headers={
                            "Content-Type": "application/json",
                            "x-api-key": CLAUDE_API_KEY,
                            "anthropic-version": "2023-06-01",
                        },
                    )
                    with urllib.request.urlopen(req, timeout=120) as resp:
                        result = json.loads(resp.read())
                    text = "\n".join(c.get("text", "") for c in result.get("content", []))
                    self._json_response(200, {"ok": True, "text": text})
                except Exception as e:
                    self._json_response(500, {"error": f"Claude API error: {e}"})
            else:
                self._json_response(404, {"error": "POST not supported for this endpoint"})

        def do_GET(self):
            if not self._check_auth():
                return
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)

            if parsed.path == "/collect":
                channel = params.get("channel", [None])[0]
                if not channel:
                    self._json_response(400, {"error": "Missing ?channel= parameter"})
                    return
                name = channel.replace("@", "").replace("https://t.me/", "").replace("t.me/", "").strip()
                print(f"\n📡 On-demand collection requested: @{name}")
                try:
                    future = asyncio.run_coroutine_threadsafe(collect_single_channel(name), loop)
                    ch_data = future.result(timeout=120)
                    # Return summary (not full posts — too large)
                    self._json_response(200, {
                        "ok": True,
                        "channel": name,
                        "summary": ch_data["summary"],
                        "post_count": len(ch_data["posts"]),
                    })
                except Exception as e:
                    print(f"  ❌ Error: {e}")
                    self._json_response(500, {"error": str(e)})

            elif parsed.path == "/collect-own":
                print(f"\n📡 Re-collecting own channel: @{CHANNEL}")
                try:
                    future = asyncio.run_coroutine_threadsafe(self._collect_own(loop), loop)
                    result = future.result(timeout=180)
                    self._json_response(200, result)
                except Exception as e:
                    print(f"  ❌ Error: {e}")
                    self._json_response(500, {"error": str(e)})

            elif parsed.path == "/status":
                # Check what data is available
                tracked = {}
                public_path = os.path.join("public", TRACKED_FILE)
                for path in [public_path, TRACKED_FILE]:
                    if os.path.exists(path):
                        with open(path, "r") as f:
                            tracked = json.load(f)
                        break
                self._json_response(200, {
                    "ok": True,
                    "channels": {k: v.get("summary", {}).get("title", k) for k, v in tracked.items() if not isinstance(v, str)},
                })
            else:
                self._json_response(404, {"error": "Not found. Use /collect?channel=name or /status"})

        async def _collect_own(self, loop):
            client = TelegramClient("tg_growth_session", int(API_ID), API_HASH)
            await client.start()

            channel, posts = await collect_channel(client, CHANNEL, POST_LIMIT)
            daily_stats = compute_daily_stats(posts)
            member_count = 0
            try:
                member_count = (await client.get_participants(channel, limit=0)).total
            except:
                member_count = getattr(channel, 'participants_count', 0) or 0

            # Pull admin log for join/leave events
            admin_log_events = []
            try:
                from telethon.tl.functions.channels import GetAdminLogRequest
                from telethon.tl.types import ChannelAdminLogEventsFilter
                events_filter = ChannelAdminLogEventsFilter(join=True, leave=True)
                result = await client(GetAdminLogRequest(
                    channel=channel, q="", min_id=0, max_id=0, limit=200,
                    events_filter=events_filter, admins=[]
                ))
                for event in result.events:
                    action_type = type(event.action).__name__
                    if "Join" in action_type:
                        admin_log_events.append({"date": event.date.isoformat(), "action": "join"})
                    elif "Leave" in action_type:
                        admin_log_events.append({"date": event.date.isoformat(), "action": "leave"})
                print(f"  📊 {len(admin_log_events)} join/leave events from admin log")
            except Exception as e:
                print(f"  ⚠️  Admin log not available: {e}")

            # Merge with historical data
            daily_member_changes = defaultdict(lambda: {"joins": 0, "leaves": 0, "net": 0})
            try:
                if os.path.exists(OUTPUT_FILE):
                    with open(OUTPUT_FILE, "r") as f:
                        old_data = json.load(f)
                    for day, v in old_data.get("daily_member_changes", {}).items():
                        daily_member_changes[day] = v
            except Exception:
                pass

            fresh_days = defaultdict(lambda: {"joins": 0, "leaves": 0, "net": 0})
            for ev in admin_log_events:
                day = ev["date"][:10]
                if ev["action"] == "join":
                    fresh_days[day]["joins"] += 1
                else:
                    fresh_days[day]["leaves"] += 1
                fresh_days[day]["net"] = fresh_days[day]["joins"] - fresh_days[day]["leaves"]
            daily_member_changes.update(fresh_days)

            summary = {
                "channel": CHANNEL,
                "title": channel.title,
                "description": getattr(channel, 'about', '') or '',
                "member_count": member_count,
                "total_posts_collected": len(posts),
                "date_range": {
                    "from": posts[0]["date"] if posts else None,
                    "to": posts[-1]["date"] if posts else None,
                },
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
            if posts:
                summary["stats"] = compute_summary_stats(posts)

            forward_chains = await collect_forward_chains(client, CHANNEL, posts)

            output = {
                "summary": summary,
                "posts": posts,
                "daily_stats": daily_stats,
                "daily_member_changes": dict(daily_member_changes),
                "forward_chains": forward_chains,
            }

            # Save to both root and public/
            for path in [OUTPUT_FILE, os.path.join("public", OUTPUT_FILE)]:
                os.makedirs(os.path.dirname(path) if os.path.dirname(path) else ".", exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(output, f, ensure_ascii=False, indent=2)

            print(f"  ✅ Saved {len(posts)} posts to {OUTPUT_FILE} + public/{OUTPUT_FILE}")
            await client.disconnect()

            return {
                "ok": True,
                "channel": CHANNEL,
                "summary": summary,
                "post_count": len(posts),
            }

        def _json_response(self, code, data):
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self._cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

        def log_message(self, format, *args):
            print(f"  API: {args[0]}")

    port = int(os.environ.get("COLLECTOR_PORT", "3456"))
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"\n🚀 Collector API running at http://localhost:{port}")
    print(f"   Endpoints:")
    print(f"     GET /collect-own            — re-collect your own channel (@{CHANNEL})")
    print(f"     GET /collect?channel=name   — collect a competitor channel on demand")
    print(f"     GET /status                 — list available channels")
    print(f"\n   Dashboard will auto-connect to this.\n")

    # Run HTTP server in a thread so asyncio loop stays available
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    # Keep asyncio loop alive
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Shutting down collector API")
        server.shutdown()


if __name__ == "__main__":
    if "--serve" in sys.argv:
        asyncio.run(serve())
    else:
        asyncio.run(main())
