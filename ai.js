// ai.js - Node.js Express backend for Gemini AI chat (Google AI Studio)
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

// It's best practice to load sensitive keys from environment variables.
// Make sure you have a .env file and are using a package like 'dotenv'
// in your main server file (e.g., require('dotenv').config();)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
  console.error('ERROR: The GEMINI_API_KEY environment variable is not set. The AI chat feature will not work.');
}

router.post('/chat', async (req, res) => {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
    return res.status(500).json({ error: 'The server is missing the Gemini API key.' });
  }

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    const geminiRes = await fetch(`${GEMINI_API_URL_BASE}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const data = await geminiRes.json();

    // Check for an error response from Gemini first
    if (data.error) {
      console.error('Gemini API Error:', data.error);
      return res.status(geminiRes.status).json({ error: `Gemini API Error: ${data.error.message}` });
    }

    // Check for a valid successful response structure
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      res.json({ reply: data.candidates[0].content.parts[0].text });
    } else {
      console.error('Unexpected response structure from Gemini:', data);
      res.status(500).json({ error: 'Received an unexpected response structure from the AI.' });
    }
  } catch (err) {
    console.error('Failed to fetch from Gemini API:', err);
    res.status(500).json({ error: 'An error occurred while communicating with the AI service.' });
  }
});

module.exports = router;
