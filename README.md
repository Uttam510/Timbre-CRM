# Timbre Signal

Find YouTube creators in your target subscriber band, score how well they fit
Timbre, draft outreach in your voice, and send it from your own Gmail. Built
with Next.js + Supabase, deploys free on Vercel.

```
Discover (YouTube Data API)  ->  Score (fit / reach / need / timing)  ->  Pipeline  ->  Send (Gmail)
```

---

## What you need (all free)

1. A **GitHub** account (to host the code)
2. A **Vercel** account (hosting)
3. A **Supabase** account (database)
4. A **Google Cloud** project (YouTube Data API key)
5. A **Gmail App Password** (sending)

---

## Setup, step by step

### 1. Database (Supabase)
1. Create a project at supabase.com.
2. Open SQL Editor, paste the contents of `supabase/schema.sql`, run it.
3. Go to Project Settings > API and copy the **Project URL** and the
   **service_role** key (the secret one, not anon).

### 2. YouTube key (Google Cloud)
1. Go to console.cloud.google.com, create a project.
2. APIs & Services > Library > enable **YouTube Data API v3**.
3. APIs & Services > Credentials > Create credentials > API key. Copy it.

### 3. Gmail sending
1. Turn on 2-Step Verification on your Google account.
2. Go to Google Account > Security > App passwords, create one for "Mail".
3. Copy the 16-character password (it has no spaces when you paste it).

### 4. Run locally (optional, to test)
1. Copy `.env.example` to `.env.local` and fill in every value.
2. `npm install`
3. `npm run dev`, open http://localhost:3000

### 5. Deploy to Vercel
1. Push this folder to a new GitHub repo.
2. On vercel.com, "Add New Project", import that repo.
3. Before deploying, add Environment Variables (the five from `.env.example`).
4. Deploy. You get a live URL.

---

## How each piece works

**Discover** calls the YouTube Data API, filters channels to your subscriber
band (the "not too big" filter), reads each channel's public description for a
business email and links, scores the fit, and saves new creators to Supabase.

**Score** is in `lib/score.js`. Four dimensions, 0-25 each, 0-100 total. The
Fit curve peaks for small-to-mid channels because those convert best for
Timbre. Edit the numbers there to tune it; the dashboard updates automatically.

**Send** uses Nodemailer with your Gmail App Password. It returns a real
message id and marks the lead Contacted with a timestamp, so the "Contacted"
counter is true. It appends a one-line opt-out so you stay compliant. Keep it
to a few dozen personal emails a day so Gmail does not flag you.

---

## What is honest about this

- It tracks **sent** for real (message id). It does not track opens (Gmail
  gives no reliable open data; Apple Mail blocks tracking pixels anyway).
- To track **replies** later, the upgrade is the Gmail API instead of SMTP,
  which lets you poll threads. Noted as a next step.
- It discovers creators through the official API and public links only. It
  does not scrape the captcha-gated About-page email.

---

## Tuning for your ICP

- Change the subscriber band in the Discover form (default 5k to 200k).
- Edit `lib/score.js` to reweight what matters.
- Edit `draftFor()` in `app/page.js` to change the outreach template voice.

---

## Staying out of spam

The app helps, but habits matter more than code. What it does for you:
- Sends plain text, one recipient at a time, with a From name.
- Adds a plain-text opt-out line and a real `List-Unsubscribe` header.
- Runs a pre-send check that flags trigger words, all-caps, extra links,
  too many exclamation marks, and length before you hit send.

What you should do:
- Keep volume low at first (10-20 a day) and ramp slowly.
- Personalise every email; identical bulk text is the biggest spam signal.
- Keep links to zero or one in a first email, no attachments, no images.
- Make sure the address is real; bounces hurt your reputation.
- @gmail.com is already authenticated by Google. If you later move to a
  custom domain, set up SPF, DKIM and DMARC before sending.

---

## Live discovery

The discover endpoint streams its progress, so the UI shows the search,
the subscriber filter, and each scored creator appearing in real time
rather than a spinner. It is real: every line is an actual step the
backend just ran.
