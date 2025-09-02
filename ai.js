// ai.js - Node.js Express backend for Gemini AI chat (Google AI Studio)
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

// Replace with your Gemini API key from Google AI Studio
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  try {
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });
    const data = await geminiRes.json();
    // Gemini returns reply in data.candidates[0].content.parts[0].text
    if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
      res.json({ reply: data.candidates[0].content.parts[0].text });
    } else {
      res.status(500).json({ error: data.error?.message || 'No response from Gemini AI' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
