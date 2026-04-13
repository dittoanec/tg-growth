# ✈️ Telegram Growth Intelligence


Understand your Telegram channel audience, see what content works, track other channels, and get a growth plan — powered by AI. Everything runs on your own computer. No subscription, no cloud.


> ⏱️ Setup takes about 15–20 minutes the first time.


---


## What does this actually do?


This tool has **3 specific features**. It's not a general assistant — each feature does one focused thing:


---


### 👥 1. Audience Persona Analysis
Reads your last 200 posts and figures out who your audience actually is based on how they engage.


**What you get:**
- A profile of your typical follower (interests, content preferences, engagement style)
- Which post formats they respond to most (text, photo, video)
- Which topics get the most reactions vs. forwards
- How your audience has shifted over the past few months


**How to use it:** Say *"analyze my audience"* in Claude after setup


---


### 📊 2. Content Performance Report
Looks at what you've already posted and ranks it by real metrics.


**What you get:**
- Your top 10 posts by views, with a breakdown of why they worked
- Your top 5 most-forwarded posts (the ones people shared to other channels)
- Patterns across your best content — common topics, formats, posting times
- Gaps — topics your audience wants but you haven't covered yet


**How to use it:** Say *"analyze my content performance"* in Claude



---


### 🔍 3. Channel Network Analysis
Tracks which other Telegram channels are amplifying your content.


**What you get:**
- A list of channels that have forwarded your posts
- How many members those channels have (your potential reach)
- Which of your posts get forwarded most and by whom# ✈️ Telegram Growth Intelligence

Understand your Telegram channel audience, see what content works, track other channels, and get a weekly growth plan — powered by AI. Everything runs on your own computer. No subscription, no cloud.

> ⏱️ Setup takes about 15–20 minutes the first time.

---

## What does this actually do?

This tool has **4 specific features**. It's not a general assistant — each feature does one focused thing:

> ⚠️ **What this tool does NOT do:** It won't write posts for you, manage your channel, reply to messages, or post on your behalf. It only reads your channel data and gives you analysis and plans.

---

## Before you start — what you'll need

You don't need to be technical. But you will need:

- **A Mac or PC** with internet access
- **A Telegram account** (the one that owns your channel)
- **A Claude account** with a Pro or Max plan — [claude.ai](https://claude.ai)
- **~15 minutes** for first-time setup

---

## Step 1: Get your Telegram API credentials

> This is the most unusual step. Telegram requires you to create an "app" on their developer site to let tools like this read your channel data. It takes 2 minutes and is completely free.

1. Go to [my.telegram.org](https://my.telegram.org) in your browser
2. Log in with your Telegram phone number
3. Click **"API development tools"**
4. Fill in any app name (e.g. "my growth tool") and click **Create application**
5. Copy these two values somewhere safe:
   - **App api_id** (a number like `12345678`)
   - **App api_hash** (a long string of letters and numbers)

---

## Step 2: Get your Claude API key

> This lets the tool send your channel data to Claude for analysis. You pay a small amount per use (~$5–15/month for typical usage).

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in with your Claude account
3. Click **"API Keys"** → **"Create Key"**
4. Copy the key (starts with `sk-ant-...`) — save it, you won't see it again

---

## Step 3: Install the skill

> A "skill" is a small file that teaches Claude how to use this tool. You only install it once.

Open your **Terminal** (Mac: press Cmd+Space, type "Terminal", press Enter) and paste this exactly:

```bash
mkdir -p ~/.claude/skills/tg-growth \u0026\u0026 curl -fsSL https://raw.githubusercontent.com/dittoanec/tg-growth/main/.claude/skills/tg-growth/SKILL.md -o ~/.claude/skills/tg-growth/SKILL.md
```

Press Enter. No output = it worked.

---

## Step 4: Download the project

Still in Terminal, paste this:

```bash
git clone https://github.com/dittoanec/tg-growth \u0026\u0026 cd tg-growth \u0026\u0026 cp .env.example .env
```

---

## Step 5: Add your keys to the settings file

1. Open the `tg-growth` folder on your computer
2. Find the file called `.env` (it may be hidden — on Mac press Cmd+Shift+. to show hidden files)
3. Open it with any text editor (TextEdit on Mac, Notepad on Windows)
4. Fill in your values:

```
CHANNEL_USERNAME=your_channel_username_without_@
TG_API_ID=paste your api_id here
TG_API_HASH=paste your api_hash here
CLAUDE_API_KEY=paste your Claude API key here
COLLECTOR_TOKEN=makeupsomething123
VITE_COLLECTOR_TOKEN=makeupsomething123
```

> `COLLECTOR_TOKEN` is just a password you make up — use the same value for both lines.

5. Save the file

---

## Step 6: Install dependencies

> One-time step. This downloads the small programs the tool needs to run.

In Terminal (inside the `tg-growth` folder):

```bash
npm install \u0026\u0026 pip3 install telethon python-dotenv
```

Wait 1–3 minutes for it to finish.

---

## Step 7: Connect to Telegram (one-time)

> **Why is this needed?** This tool reads your real channel data — actual view counts, reactions, and forwards — directly from Telegram. The standard Telegram Bot API doesn't give access to this data, so the tool connects as *you* instead, the same way Telegram Desktop or Telegram Web does. Telegram needs to verify it's really you the first time, just like when you log into a new device.

> **What actually happens:** A file called `tg_growth_session.session` gets saved on your computer. This file acts like a saved login — so every time you run the tool after this, it connects silently without asking for a code again. You can see this "device" in your Telegram app under **Settings → Devices**, and you can revoke it any time from there.

Run this in Terminal:

```bash
python3 collect_data.py
```

It will ask for your **Telegram phone number** — enter it with country code (e.g. `+82 10 1234 5678`).

Telegram sends you a **verification code** — enter it in the Terminal. This is the same code Telegram sends when you log in on a new device.

This only happens once. Every run after this is automatic.

When it finishes, run:

```bash
cp channel_data.json public/channel_data.json
```

---

## You're set up! Here's how to use it

Open Claude at [claude.ai](https://claude.ai) and say one of these:

- *"Analyze my audience"*
- *"Analyze my content performance"*
- *"Generate a content calendar"*
- *"Analyze my channel network"*

**To refresh your data** (do this weekly):

```bash
cd tg-growth
python3 collect_data.py \u0026\u0026 cp channel_data.json public/channel_data.json
```

**To see the visual dashboard** (optional):

```bash
cd tg-growth \u0026\u0026 npm run dev
```

Then open [localhost:5173](http://localhost:5173) in your browser.

---

## Frequently asked questions

**Is my data safe?**
Yes. Everything stays on your computer. Your Telegram credentials and channel data never go to any external server (except to Claude and Telegram's own APIs when you run an analysis).

**Will Telegram know I'm using this?**
The tool connects to Telegram using your own account, read-only. It doesn't post, message, or modify anything.

**What does it cost?**
The tool itself is free. Claude API usage is typically $5–15/month for regular use. Telegram API is free.

**My Terminal says "command not found" for npm or pip3**
On Mac, run this first:
```bash
xcode-select --install
```
A popup appears — click Install and wait ~10 minutes. Then try again.

**Something else went wrong**
- Port busy: `lsof -ti :5173 | xargs kill -9`
- Telegram session expired: delete `tg_growth_session.session` and re-run `python3 collect_data.py`
- Dashboard empty: make sure you ran `cp channel_data.json public/channel_data.json`
# ✈️ Telegram Growth Intelligence


Understand your Telegram channel audience, see what content works, track other channels, and get a growth plan — powered by AI. Everything runs on your own computer. No subscription, no cloud.


> ⏱️ Setup takes about 15–20 minutes the first time.


---


## What does this actually do?


This tool has **3 specific features**. It's not a general assistant — each feature does one focused thing:


---


### 👥 1. Audience Persona Analysis
Reads your last 200 posts and figures out who your audience actually is based on how they engage.


**What you get:**
- A profile of your typical follower (interests, content preferences, engagement style)
- Which post formats they respond to most (text, photo, video)
- Which topics get the most reactions vs. forwards
- How your audience has shifted over the past few months


**How to use it:** Say *"analyze my audience"* in Claude after setup


---


### 📊 2. Content Performance Report
Looks at what you've already posted and ranks it by real metrics.


**What you get:**
- Your top 10 posts by views, with a breakdown of why they worked
- Your top 5 most-forwarded posts (the ones people shared to other channels)
- Patterns across your best content — common topics, formats, posting times
- Gaps — topics your audience wants but you haven't covered yet


**How to use it:** Say *"analyze my content performance"* in Claude



---


### 🔍 3. Channel Network Analysis
Tracks which other Telegram channels are amplifying your content.


**What you get:**
- A list of channels that have forwarded your posts
- How many members those channels have (your potential reach)
- Which of your posts get forwarded most and by whom# ✈️ Telegram Growth Intelligence

Understand your Telegram channel audience, see what content works, track other channels, and get a weekly growth plan — powered by AI. Everything runs on your own computer. No subscription, no cloud.

> ⏱️ Setup takes about 15–20 minutes the first time.

---

## What does this actually do?

This tool has **4 specific features**. It's not a general assistant — each feature does one focused thing:

> ⚠️ **What this tool does NOT do:** It won't write posts for you, manage your channel, reply to messages, or post on your behalf. It only reads your channel data and gives you analysis and plans.

---

## Before you start — what you'll need

You don't need to be technical. But you will need:

- **A Mac or PC** with internet access
- **A Telegram account** (the one that owns your channel)
- **A Claude account** with a Pro or Max plan — [claude.ai](https://claude.ai)
- **~15 minutes** for first-time setup

---

## Step 1: Get your Telegram API credentials

> This is the most unusual step. Telegram requires you to create an "app" on their developer site to let tools like this read your channel data. It takes 2 minutes and is completely free.

1. Go to [my.telegram.org](https://my.telegram.org) in your browser
2. Log in with your Telegram phone number
3. Click **"API development tools"**
4. Fill in any app name (e.g. "my growth tool") and click **Create application**
5. Copy these two values somewhere safe:
   - **App api_id** (a number like `12345678`)
   - **App api_hash** (a long string of letters and numbers)

---

## Step 2: Get your Claude API key

> This lets the tool send your channel data to Claude for analysis. You pay a small amount per use (~$5–15/month for typical usage).

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in with your Claude account
3. Click **"API Keys"** → **"Create Key"**
4. Copy the key (starts with `sk-ant-...`) — save it, you won't see it again

---

## Step 3: Install the skill

> A "skill" is a small file that teaches Claude how to use this tool. You only install it once.

Open your **Terminal** (Mac: press Cmd+Space, type "Terminal", press Enter) and paste this exactly:

```bash
mkdir -p ~/.claude/skills/tg-growth && curl -fsSL https://raw.githubusercontent.com/dittoanec/tg-growth/main/.claude/skills/tg-growth/SKILL.md -o ~/.claude/skills/tg-growth/SKILL.md
```

Press Enter. No output = it worked.

---

## Step 4: Download the project

Still in Terminal, paste this:

```bash
git clone https://github.com/dittoanec/tg-growth && cd tg-growth && cp .env.example .env
```

---

## Step 5: Add your keys to the settings file

1. Open the `tg-growth` folder on your computer
2. Find the file called `.env` (it may be hidden — on Mac press Cmd+Shift+. to show hidden files)
3. Open it with any text editor (TextEdit on Mac, Notepad on Windows)
4. Fill in your values:

```
CHANNEL_USERNAME=your_channel_username_without_@
TG_API_ID=paste your api_id here
TG_API_HASH=paste your api_hash here
CLAUDE_API_KEY=paste your Claude API key here
COLLECTOR_TOKEN=makeupsomething123
VITE_COLLECTOR_TOKEN=makeupsomething123
```

> `COLLECTOR_TOKEN` is just a password you make up — use the same value for both lines.

5. Save the file

---

## Step 6: Install dependencies

> One-time step. This downloads the small programs the tool needs to run.

In Terminal (inside the `tg-growth` folder):

```bash
npm install && pip3 install telethon python-dotenv
```

Wait 1–3 minutes for it to finish.

---

## Step 7: Connect to Telegram (one-time login)

```bash
python3 collect_data.py
```

It will ask for your **Telegram phone number** — enter it with country code (e.g. `+82 10 1234 5678`).

Telegram will send you a **verification code** — enter it in the Terminal.

This only happens once. After this, the tool logs in automatically.

When it finishes, run:

```bash
cp channel_data.json public/channel_data.json
```

---

## You're set up! Here's how to use it

Open Claude at [claude.ai](https://claude.ai) and say one of these:

- *"Analyze my audience"*
- *"Analyze my content performance"*
- *"Generate a content calendar"*
- *"Analyze my channel network"*

**To refresh your data** (do this weekly):

```bash
cd tg-growth
python3 collect_data.py && cp channel_data.json public/channel_data.json
```

**To see the visual dashboard** (optional):

```bash
cd tg-growth && npm run dev
```

Then open [localhost:5173](http://localhost:5173) in your browser.

---

## Frequently asked questions

**Is my data safe?**
Yes. Everything stays on your computer. Your Telegram credentials and channel data never go to any external server (except to Claude and Telegram's own APIs when you run an analysis).

**Will Telegram know I'm using this?**
The tool connects to Telegram using your own account, read-only. It doesn't post, message, or modify anything.

**What does it cost?**
The tool itself is free. Claude API usage is typically $5–15/month for regular use. Telegram API is free.

**My Terminal says "command not found" for npm or pip3**
On Mac, run this first:
```bash
xcode-select --install
```
A popup appears — click Install and wait ~10 minutes. Then try again.

**Something else went wrong**
- Port busy: `lsof -ti :5173 | xargs kill -9`
- Telegram session expired: delete `tg_growth_session.session` and re-run `python3 collect_data.py`
- Dashboard empty: make sure you ran `cp channel_data.json public/channel_data.json`
