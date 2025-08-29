// ai.js - Node.js Express backend for Hugging Face AI chat
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

// Replace with your Hugging Face API key
const HF_API_TOKEN = process.env.HF_API_TOKEN || 'YOUR_HF_API_KEY';
const HF_MODEL = 'microsoft/DialoGPT-medium'; // Or any other conversational model

router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  try {
    const hfRes = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: message })
    });
    const data = await hfRes.json();
    if (data && data.generated_text) {
      res.json({ reply: data.generated_text });
    } else if (Array.isArray(data) && data[0] && data[0].generated_text) {
      res.json({ reply: data[0].generated_text });
    } else {
      res.status(500).json({ error: data.error || 'No response from AI' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
