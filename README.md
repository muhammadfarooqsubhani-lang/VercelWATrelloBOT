# 🤖 WhatsApp → Trello Bot

Receives WhatsApp messages via [Green API](https://green-api.com) webhooks and automatically creates Trello cards. Runs on **Vercel** (free tier).

## Project Structure

```
whatsapp-trello-bot/
├── api/
│   ├── webhook.js    ← Main handler (receives WhatsApp messages, creates Trello cards)
│   ├── health.js     ← Health check endpoint
│   └── index.js      ← Root status page
├── vercel.json       ← Route configuration
├── package.json      ← Dependencies
├── .env.example      ← Environment variable template
├── .gitignore        ← Excludes node_modules
└── README.md         ← This file
```

## Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Description |
|---|---|
| `TRELLO_API_KEY` | From [power-ups.trello.com](https://power-ups.trello.com) |
| `TRELLO_TOKEN` | Authorize via Trello OAuth |
| `TRELLO_LIST_ID` | Target list ID for new cards |
| `GREEN_API_INSTANCE_ID` | From [green-api.com](https://green-api.com) |
| `GREEN_API_TOKEN` | Green API instance token |

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhook` | Green API webhook receiver |
| `GET` | `/health` | Health check |
| `GET` | `/` | Status page |

## How It Works

```
WhatsApp Message
       ↓
Green API → POST /webhook
       ↓
Parse sender + message
       ↓
Create Trello Card
       ↓
Reply to sender: "✅ Your request has been received..."
```
