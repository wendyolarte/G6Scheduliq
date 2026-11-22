const router = require('express').Router();
const pool = require('../config/db');
const { optionalAuth } = require('../middleware/auth');
const { reply } = require('../services/chatbot');

router.post('/', optionalAuth, async (req, res) => {
  const message = String(req.body.message || '').slice(0, 500);
  if (!message.trim()) return res.status(400).json({ error: 'Type a message first' });
  let out;
  try {
    out = await reply(req.user || null, message);
  } catch (e) {
    console.error('chatbot error', e);
    out = { reply: 'Sorry, I had trouble looking that up. Please try again in a moment.', suggestions: [] };
  }
  try {
    await pool.query('INSERT INTO chat_logs(user_id,message,reply) VALUES(?,?,?)', [req.user?.id || null, message, out.reply.slice(0, 4000)]);
  } catch { /* logging must never break the chat */ }
  res.json(out);
});

module.exports = router;
