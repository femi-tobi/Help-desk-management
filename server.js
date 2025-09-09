require('dotenv').config();
// server.js - Main Express server
const express = require('express');
const path = require('path');
const cors = require('cors');
const aiRouter = require('./ai');
const { startEmailService } = require('./email-service');

const app = express();
const PORT = process.env.PORT || 5500;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON bodies. This replaces the need for `body-parser`.
app.use(express.json());

const db = require('./db'); // Import the database connection

// Create reports table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue TEXT NOT NULL,
      description TEXT,
      branch TEXT,
      department TEXT,
      staff TEXT,
      status TEXT DEFAULT 'open',
      resolution TEXT,
      reportedBy TEXT,
      dateReported TEXT,
      timeReported TEXT,
      resolutionTime TEXT,
      dateClosed TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating reports table:', err.message);
    } else {
      console.log('Reports table created or already exists.');
    }
  });
});

// Login endpoint
app.post('/login', (req, res) => {
  const { email } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      console.error('Database error during login:', err.message);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }

    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  });
});

// API to get all users
app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM users', [], (err, rows) => {
    if (err) {
      console.error('Database error fetching users:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json(rows);
  });
});

// API to add a new user
app.post('/api/users', (req, res) => {
  const { email, role, department } = req.body;
  if (!email || !role) {
    return res.status(400).json({ message: 'Email and role are required' });
  }
  db.run('INSERT INTO users (email, role, department) VALUES (?, ?, ?)', [email, role, department || null], function(err) {
    if (err) {
      console.error('Database error adding user:', err.message);
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ message: 'User with this email already exists' });
      }
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.status(201).json({ message: 'User added successfully', id: this.lastID });
  });
});

// API to update user role
app.put('/api/users/:email', (req, res) => {
  const { email } = req.params;
  const { role } = req.body;
  if (!role) {
    return res.status(400).json({ message: 'Role is required' });
  }
  db.run('UPDATE users SET role = ? WHERE email = ?', [role, email], function(err) {
    if (err) {
      console.error('Database error updating user:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User role updated successfully' });
  });
});

// API to delete a user
app.delete('/api/users/:email', (req, res) => {
  const { email } = req.params;
  db.run('DELETE FROM users WHERE email = ?', [email], function(err) {
    if (err) {
      console.error('Database error deleting user:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  });
});

// API to create a new report
app.post('/api/reports', (req, res) => {
  const { issue, description, branch, department, staff, status, resolution, reportedBy, dateReported, timeReported, resolutionTime, dateClosed } = req.body;

  // Validate reportedBy email
  if (reportedBy && !reportedBy.endsWith('@gmail.com') && !reportedBy.endsWith('@may-bakerng.com')) {
    return res.status(400).json({ message: 'Invalid email domain. Only @gmail.com and @may-bakerng.com are allowed.' });
  }

  db.run(
    `INSERT INTO reports (issue, description, branch, department, staff, status, resolution, reportedBy, dateReported, timeReported, resolutionTime, dateClosed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [issue, description, branch, department, staff, status, resolution, reportedBy, dateReported, timeReported, resolutionTime, dateClosed],
    function(err) {
      if (err) {
        console.error('Database error adding report:', err.message);
        return res.status(500).json({ message: 'Internal server error' });
      }
      res.status(201).json({ message: 'Report added successfully', id: this.lastID });
    }
  );
});

// API to get all reports, with optional department filter
app.get('/api/reports', (req, res) => {
  const { department } = req.query;
  let sql = 'SELECT * FROM reports';
  let params = [];

  if (department) {
    sql += ' WHERE department = ?';
    params.push(department);
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Database error fetching reports:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json(rows);
  });
});

// API to delete all reports
app.delete('/api/reports/all', (req, res) => {
  db.run('DELETE FROM reports', [], function(err) {
    if (err) {
      console.error('Database error deleting all reports:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json({ message: `Deleted ${this.changes} reports successfully` });
  });
});

// API to update a report
app.put('/api/reports/:id', (req, res) => {
  const { id } = req.params;
  const { issue, description, branch, department, staff, status, resolution, reportedBy, dateReported, timeReported, resolutionTime, dateClosed } = req.body;
  db.run(
    `UPDATE reports SET issue = ?, description = ?, branch = ?, department = ?, staff = ?, status = ?, resolution = ?, reportedBy = ?, dateReported = ?, timeReported = ?, resolutionTime = ?, dateClosed = ? WHERE id = ?`,
    [issue, description, branch, department, staff, status, resolution, reportedBy, dateReported, timeReported, resolutionTime, dateClosed, id],
    function(err) {
      if (err) {
        console.error('Database error updating report:', err.message);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Report not found' });
      }
      res.json({ message: 'Report updated successfully' });
    }
  );
});

// API to get a single report by ID
app.get('/api/reports/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM reports WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Database error fetching report by ID:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (!row) {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.json(row);
  });
});

// Debug endpoint to list all users in DB
app.get('/debug/users', (req, res) => {
  db.all('SELECT * FROM users', [], (err, rows) => {
    if (err) {
      console.error('Debug DB error:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json(rows);
  });
});

// Mount AI chat API
app.use('/api/ai', aiRouter);

// Serve static files (like index.html, css, images) from the project root
app.use(express.static(path.join(__dirname, '')));

// Start the email polling service to check for new emails every 5 minutes
setInterval(startEmailService, 300000);

app.listen(PORT, () => {
	console.log(`
Server is running!`);
	console.log(`Please open your browser and go to http://localhost:${PORT}`);
});
