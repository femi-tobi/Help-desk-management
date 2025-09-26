require('dotenv').config();
// server.js - Main Express server
const express = require('express');
const path = require('path');
const cors = require('cors');
const aiRouter = require('./ai');
const { startEmailService } = require('./email-service');


const multer = require('multer');
const uploadDir = path.join(__dirname, 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

const app = express();
// CSV user loader
const csv = require('csv-parser');
let csvUsers = [];
function normalizeKey(key) {
  return key.trim().toLowerCase().replace(/\s+/g, '');
}
fs.createReadStream(path.join(__dirname, 'mbusers.csv'))
  .pipe(csv())
  .on('data', (row) => {
    // Normalize keys for each row
    const keys = Object.keys(row);
    let normRow = {};
    keys.forEach(k => {
      normRow[normalizeKey(k)] = row[k];
    });
    csvUsers.push({
      email: normRow['email'],
      firstname: normRow['firstname'],
      lastname: normRow['lastname']
      // department: normRow['department'] // If you add department
    });
  });

// API to get all users from CSV
// API to get all users from CSV and DB
app.get('/api/allusers', async (req, res) => {
  try {
    db.all('SELECT email, firstname, lastname, department FROM users', [], (err, dbUsers) => {
      if (err) {
        console.error('Database error fetching users:', err.message);
        return res.status(500).json({ message: 'Internal server error' });
      }
      // Merge CSV and DB users, avoiding duplicates
      const emails = new Set();
      const all = [];
      csvUsers.forEach(u => {
        if (u.email && !emails.has(u.email)) {
          all.push(u);
          emails.add(u.email);
        }
      });
      dbUsers.forEach(u => {
        if (u.email && !emails.has(u.email)) {
          all.push(u);
          emails.add(u.email);
        }
      });
      res.json(all);
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});
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
      dateClosed TEXT,
      image TEXT
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
      // Check CSV users if not found in DB
      const csvUser = csvUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
      if (csvUser) {
        // Return a user object similar to DB format
        res.json({ success: true, user: {
          email: csvUser.email,
          firstname: csvUser.firstname,
          lastname: csvUser.lastname,
          role: 'csv',
          department: csvUser.department || ''
        }});
      } else {
        res.status(404).json({ success: false, message: 'User not found' });
      }
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

// API to get all departments
app.get('/api/departments', (req, res) => {
  db.all('SELECT DISTINCT department FROM users WHERE department IS NOT NULL', [], (err, rows) => {
    if (err) {
      console.error('Database error fetching departments:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
    const departments = rows.map(row => row.department);
    res.json(departments);
  });
});

// API to get users by department
app.get('/api/users/department/:department', (req, res) => {
  const { department } = req.params;
  db.all('SELECT * FROM users WHERE department = ?', [department], (err, rows) => {
    if (err) {
      console.error('Database error fetching users by department:', err.message);
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
  // Validate email domain
  if (!email.endsWith('@gmail.com') && !email.endsWith('@may-bakerng.com')) {
    return res.status(400).json({ message: 'Invalid email domain. Only @gmail.com and @may-bakerng.com are allowed.' });
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
const nodemailer = require('nodemailer');

app.post('/api/reports', upload.single('image'), (req, res) => {
  const { issue, description, branch, department, staff, status, resolution, reportedBy, dateReported, timeReported, resolutionTime, dateClosed } = req.body;
  let imagePath = '';
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }
  db.run(
    `INSERT INTO reports (issue, description, branch, department, staff, status, resolution, reportedBy, dateReported, timeReported, resolutionTime, dateClosed, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [issue, description, branch, department, staff, status, resolution, reportedBy, dateReported, timeReported, resolutionTime, dateClosed, imagePath],
    function(err) {
      if (err) {
        console.error('Database error adding report:', err.message);
        return res.status(500).json({ message: 'Internal server error' });
      }
      // ...existing email logic...
      res.status(201).json({ message: 'Report added successfully', id: this.lastID, image: imagePath });
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

// API to delete a single report by ID
app.delete('/api/reports/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM reports WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Database error deleting report:', err.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.json({ message: 'Report deleted successfully' });
  });
});

// API to update a report
app.put('/api/reports/:id', (req, res) => {
  const { id } = req.params;
  const { issue, description, branch, department, staff, status, resolution, reportedBy, dateReported, timeReported, resolutionTime, dateClosed } = req.body;
  db.run(
    `UPDATE reports SET issue = ?, description = ?, branch = ?, department = ?, staff = ?, status = ?, resolution = ?, reportedBy = ?, dateReported = ?, timeReported = ?, resolutionTime = ?, dateClosed = ? WHERE id = ?`,
    [issue, description, branch, department, staff, status, resolution, reportedBy, dateReported, timeReported, resolutionTime, dateClosed, id],
    async function(err) {
      if (err) {
        console.error('Database error updating report:', err.message);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Report not found' });
      }
      // Send email if resolved
      if (status && status.toLowerCase() === 'resolved') {
        db.get('SELECT * FROM reports WHERE id = ?', [id], (err, report) => {
          if (err || !report) return;
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            },
          });
          const subject = `Helpdesk Report Resolved: ${report.issue}`;
          const html = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #22a7f0;">Your Helpdesk Report Has Been Resolved</h2>
              <p><b>Issue:</b> ${report.issue}</p>
              <p><b>Description:</b> ${report.description}</p>
              <p><b>Resolution:</b> ${report.resolution}</p>
              <p><b>Resolved By:</b> ${report.staff}</p>
              <p><b>Date Closed:</b> ${report.dateClosed || ''}</p>
              <p>Thank you for using the Helpdesk!</p>
            </div>
          `;
          // Send to reporter
          if (report.reportedBy) {
            transporter.sendMail({
              from: process.env.SMTP_USER,
              to: report.reportedBy,
              subject,
              html
            }, (error, info) => {
              if (error) console.error('Error sending resolved email to reporter:', error);
            });
          }
          // Send to staff
          if (report.staff) {
            transporter.sendMail({
              from: process.env.SMTP_USER,
              to: report.staff,
              subject,
              html
            }, (error, info) => {
              if (error) console.error('Error sending resolved email to staff:', error);
            });
          }
        });
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
});

// Serve static files (like index.html, css, images) from the project root
app.use(express.static(path.join(__dirname, '')));

// Start the email polling service to check for new emails every 5 minutes
setInterval(startEmailService, 300000);

app.listen(PORT, () => {
	console.log(`
Server is running!`);
	console.log(`Please open your browser and go to http://localhost:${PORT}`);
});
