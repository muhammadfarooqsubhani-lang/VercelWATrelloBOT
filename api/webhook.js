// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /webhook — Green API webhook receiver (Vercel Serverless)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const axios = require('axios');

// ── Config from Vercel environment variables ─────────

const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID;
const GREEN_API_INSTANCE_ID = process.env.GREEN_API_INSTANCE_ID;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;

const TRELLO_BASE = 'https://api.trello.com/1';
const GREEN_BASE = `https://api.green-api.com/waInstance${GREEN_API_INSTANCE_ID}`;

// Log env var status on cold start (values redacted for safety)
console.log('🔧  ENV CHECK:', {
  TRELLO_API_KEY: TRELLO_API_KEY ? `✅ set (${TRELLO_API_KEY.length} chars)` : '❌ MISSING',
  TRELLO_TOKEN: TRELLO_TOKEN ? `✅ set (${TRELLO_TOKEN.length} chars)` : '❌ MISSING',
  TRELLO_LIST_ID: TRELLO_LIST_ID ? `✅ set (${TRELLO_LIST_ID.length} chars) → ${TRELLO_LIST_ID}` : '❌ MISSING',
  GREEN_API_INSTANCE_ID: GREEN_API_INSTANCE_ID ? `✅ set` : '❌ MISSING',
  GREEN_API_TOKEN: GREEN_API_TOKEN ? `✅ set (${GREEN_API_TOKEN.length} chars)` : '❌ MISSING',
});

// ── Helpers ──────────────────────────────────────────

/**
 * Create a Trello card on the configured list.
 * Returns the card object or null on failure.
 */
async function createTrelloCard(title, description) {
  try {
    console.log(`🔄  Creating Trello card on list: ${TRELLO_LIST_ID}`);
    const { data } = await axios.post(`${TRELLO_BASE}/cards`, null, {
      params: {
        key: TRELLO_API_KEY,
        token: TRELLO_TOKEN,
        idList: TRELLO_LIST_ID,
        name: title,
        desc: description,
      },
      timeout: 10000,
    });
    return data;
  } catch (err) {
    console.error(`❌  Trello error: ${err.message}`);
    if (err.response) {
      console.error(`❌  Trello response status: ${err.response.status}`);
      console.error(`❌  Trello response data: ${JSON.stringify(err.response.data)}`);
    }
    return null;
  }
}

/**
 * Send a reply back to the sender via Green API.
 */
async function sendWhatsAppReply(chatId, message) {
  const url = `${GREEN_BASE}/sendMessage/${GREEN_API_TOKEN}`;
  console.log(`🔄  Sending WhatsApp reply to: ${chatId}`);
  try {
    const { data } = await axios.post(url, { chatId, message }, { timeout: 10000 });
    console.log(`✅  WhatsApp reply sent:`, JSON.stringify(data));
  } catch (err) {
    console.error(`❌  Green API reply error: ${err.message}`);
    if (err.response) {
      console.error(`❌  Green API response status: ${err.response.status}`);
      console.error(`❌  Green API response data: ${JSON.stringify(err.response.data)}`);
    }
  }
}

/**
 * Parse the incoming Green API webhook payload.
 * Handles both nested ({ body: { ... } }) and flat ({ typeWebhook: ... }) structures.
 */
function parsePayload(payload) {
  try {
    const body = payload.body || payload;

    const webhookType = body.typeWebhook || '';
    if (webhookType !== 'incomingMessageReceived') {
      return null;
    }

    const senderData = body.senderData || {};
    const msgData = body.messageData || {};
    const msgType = msgData.typeMessage || '';

    let text;
    if (msgType === 'textMessage') {
      text = (msgData.textMessageData || {}).textMessage || '';
    } else if (msgType === 'extendedTextMessage') {
      text = (msgData.extendedTextMessageData || {}).text || '';
    } else {
      text = `[${msgType.toUpperCase()}] — non-text message received`;
    }

    const sender = (senderData.sender || '').replace('@c.us', '');
    const senderName = senderData.senderName || sender;
    const chatId = senderData.sender || '';

    const ts = body.timestamp
      ? new Date(body.timestamp * 1000)
      : new Date();
    const timestamp = ts.toISOString().replace('T', ' ').slice(0, 19);

    return { sender, chatId, senderName, message: text.trim(), timestamp, type: msgType };
  } catch (err) {
    console.warn(`⚠️  Parse error: ${err.message}`);
    return null;
  }
}

function buildTitle(d) {
  const short = d.message.length > 50
    ? d.message.slice(0, 47) + '…'
    : d.message;
  return `${d.senderName}: ${short}`;
}

function buildDescription(d) {
  return [
    `**📱 From:** ${d.senderName} (+${d.sender})`,
    `**🕐 Received:** ${d.timestamp}`,
    `**📋 Type:** ${d.type}`,
    '',
    '---',
    '',
    `**Message:**\n${d.message}`,
  ].join('\n');
}

// ── Serverless handler ───────────────────────────────

module.exports = async (req, res) => {
  // ── GET: Green API webhook verification ──
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'WhatsApp → Trello webhook is active',
    });
  }

  // Only allow POST beyond this point
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Log the full raw payload
  const raw = JSON.stringify(req.body);
  console.log(`📨  RAW PAYLOAD:\n${raw}`);

  const msg = parsePayload(req.body || {});

  if (!msg) {
    const wt =
      (req.body && req.body.typeWebhook) ||
      (req.body && req.body.body && req.body.body.typeWebhook) ||
      'unknown';
    console.log(`⏭️  Ignored — typeWebhook: ${wt}`);
    return res.status(200).json({ status: 'ignored' });
  }

  console.log(`💬  ${msg.senderName} (+${msg.sender}): ${msg.message.slice(0, 60)}`);

  const card = await createTrelloCard(buildTitle(msg), buildDescription(msg));

  if (card) {
    console.log(`✅  Card created → ${card.shortUrl}`);
    await sendWhatsAppReply(
      msg.chatId,
      '✅ Your request has been received and ticketed. Our team will update you once completed.'
    );
    return res.status(200).json({ status: 'ok', card: card.shortUrl });
  } else {
    console.error('❌  Card creation failed — check Trello errors above');
    return res.status(500).json({ status: 'error', message: 'Trello card creation failed' });
  }
};
