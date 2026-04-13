# ✈️ Telegram Growth Intelligence

Understand your Telegram channel audience, see what content works, track other channels, and get a weekly growth plan — powered by AI. Everything runs on your own computer. No subscription, no cloud.

> ⏱️ Setup takes about 15–20 minutes the first time.

---

## What does this actually do?

Once set up, you can ask Claude things like:

- *"Who is my audience and what do they care about?"*
- *"Which of my posts performed best and why?"*
- *"Generate a content plan for this week"*
- *"Which channels are sharing my content?"*
- *"How has my audience changed over the last month?"*

Claude reads your real channel data — actual post views, reactions, forwards — and gives you specific, actionable answers. Not generic advice.

---

## Before you start — what you'll need

You don't need to be technical. But you will need:

- **A Mac or PC** with internet access
- **A Telegram account** (the one that owns your channel)
- **A Claude account** with a Pro or Max plan — [claude.ai](https://claude.ai)
- **~15 minutes** for first-time setup

That's it.

---

## Step 1: Get your Telegram API credentials

> This is the most unusual step. Telegram requires you to create an "app" on their developer site to let tools like this read your channel data. It takes 2 minutes and is completely free.

1. Go to [my.telegram.org](https://my.telegram.org) in your browser
2. Log in with your Telegram phone number
3. Click **"API development tools"**
4. Fill in any app name (e.g. "my growth tool") and click **Create application**
5. You'll see two values — copy them somewhere safe:
   - **App api_id** (a number like `12345678`)
   - **App api_hash** (a long string of letters and numbers)

---

## Step 2: Get your Claude API key

> This lets the tool send your channel data to Claude for analysis. You pay a small amount per use (~$5–15/month for typical usage).

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in (same email as your Claude account)
3. Click **"API Keys"** in the left menu → **"Create Key"**
4. Copy the key (starts with `sk-ant-...`) — save it somewhere safe, you won't see it again

---

## Step 3: Install the skill

> A "skill" is a small file that tells Claude how to help you with your Telegram channel. You only need to do this once.

Open your **Terminal** (Mac: press Cmd+Space, type "Terminal") and paste this:

```bash
mkdir -p ~/.claude/skills/tg-growth && curl -fsSL https://raw.githubusercontent.com/dittoanec/tg-growth/main/.claude/skills/tg-growth/SKILL.md -o ~/.claude/skills/tg-growth/SKILL.md
```

Press Enter. It runs in a second with no output — that means it worked.

---

## Step 4: Download the project

Still in Terminal, paste this:

```bash
git clone https://github.com/dittoanec/tg-growth && cd tg-growth && cp .env.example .env
```

This downloads the project and creates a settings file called `.env`.

---

## Step 5: Add your keys to the settings file

1. Open the `.env` file — it's in the `tg-growth` folder you just downloaded
   - On Mac: open Finder → Go → Home folder → find the `tg-growth` folder → right-click `.env` → Open With → TextEdit
2. Fill in your values:

```
CHANNEL_USERNAME=your_channel_username_without_@
TG_API_ID=paste your api_id here
TG_API_HASH=paste your api_hash here
CLAUDE_API_KEY=paste your Claude API key here
COLLECTOR_TOKEN=makeupsomething123
VITE_COLLECTOR_TOKEN=makeupsomething123
```

> `COLLECTOR_TOKEN` is just a password you make up yourself — it protects the tool from other apps on your computer accidentally talking to it. Use the same value for both lines.

3. Save the file

---

## Step 6: Install dependencies

> Dependencies are small programs the tool needs to run. This is a one-time step.

In Terminal (make sure you're still in the `tg-growth` folder):

```bash
npm install && pip3 install telethon python-dotenv
```

This takes 1–3 minutes. Wait for it to finish.

---

## Step 7: Connect to Telegram (one-time)

```bash
python3 collect_data.py
```

It will ask for your **Telegram phone number** (include the country code, e.g. `+1 555 123 4567`).

Then Telegram sends you a **verification code** — enter it in the Terminal.

This is a one-time login. After this, the tool remembers your session automatically.

Once it finishes, run:

```bash
cp channel_data.json public/channel_data.json
```

---

## You're set up! Here's how to use it

**Every time you want to use it:**

Open Claude at [claude.ai](https://claude.ai) and just ask:

- *"Analyze my Telegram channel"*
- *"Who is my audience?"*
- *"What should I post this week?"*

Claude will take it from there.

**To see the visual dashboard:**

```bash
cd tg-growth
npm run dev
```

Then open [localhost:5173](http://localhost:5173) in your browser.

**To refresh your data** (do this weekly for best results):

```bash
cd tg-growth
python3 collect_data.py && cp channel_data.json public/channel_data.json
```

---

## Frequently asked questions

**Is my data safe?**
Yes. Everything stays on your computer. Your Telegram credentials, API keys, and channel data never go to any external server (except to Claude and Telegram's own APIs when you ask a question).

**Will Telegram know I'm using this?**
The tool connects to Telegram using your own account, the same way you'd use the Telegram app. It's read-only — it doesn't post, message, or modify anything.

**What does it cost?**
The tool itself is free. Claude API usage is typically $5–15/month for regular use. Telegram API is free.

**My Terminal says "command not found" for npm or pip3**
On Mac, you may need to install developer tools first. Run this in Terminal:
```bash
xcode-select --install
```
A popup will appear — click Install and wait ~10 minutes. Then try again.

If that doesn't work, download the tools manually from [developer.apple.com/download/all/](https://developer.apple.com/download/all/) — search "Command Line Tools".

**Something else went wrong**
Common fixes:
- Port busy: `lsof -ti :5173 | xargs kill -9`
- Telegram session expired: delete `tg_growth_session.session` and re-run `python3 collect_data.py`
- Dashboard empty: make sure you ran `cp channel_data.json public/channel_data.json`
