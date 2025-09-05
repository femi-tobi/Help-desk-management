require('dotenv').config();
// server.js - Main Express server
const express = require('express');
const path = require('path');
const cors = require('cors');
const aiRouter = require('./ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON bodies. This replaces the need for `body-parser`.
app.use(express.json());

// Mount AI chat API
app.use('/api/ai', aiRouter);

// Serve static files (like index.html, css, images) from the project root
app.use(express.static(path.join(__dirname, '')));

app.listen(PORT, () => {
	console.log(`\nServer is running!`);
	console.log(`Please open your browser and go to http://localhost:${PORT}`);
});
