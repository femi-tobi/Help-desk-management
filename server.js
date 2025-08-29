require('dotenv').config();
// server.js - Main Express server
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const aiRouter = require('./ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Mount AI chat API
app.use('/api/ai', aiRouter);

// Health check
app.get('/', (req, res) => res.send('Helpdesk backend running.'));

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
