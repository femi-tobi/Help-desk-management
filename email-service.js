require('dotenv').config();
const Imap = require('node-imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const axios = require('axios');

const imapConfig = {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    tls: process.env.IMAP_TLS === 'true',
};

const startEmailService = () => {
    const imap = new Imap(imapConfig);

    imap.once('ready', () => {
        console.log('IMAP connection ready.');
        openInbox(imap);
    });

    imap.once('error', (err) => {
        console.error('IMAP error:', err);
    });

    imap.once('end', () => {
        console.log('IMAP connection ended.');
    });

    imap.connect();
};

const openInbox = (imap) => {
    imap.openBox('INBOX', false, (err, box) => {
        if (err) throw err;
        console.log('Inbox opened.');
        imap.search(['UNSEEN'], (err, results) => {
            if (err) throw err;
            if (results.length === 0) {
                console.log('No new emails.');
                imap.end();
                return;
            }

            const f = imap.fetch(results, { bodies: '' });
            f.on('message', (msg, seqno) => {
                console.log('Processing message #%d', seqno);
                msg.on('body', (stream, info) => {
                    simpleParser(stream, async (err, parsed) => {
                        if (err) throw err;

                        const { from, subject, text } = parsed;
                        console.log('From:', from.text);
                        console.log('Subject:', subject);
                        console.log('Body:', text);

                        const fromEmail = from.value[0].address;

                        // Check if the email is from an allowed domain
                        if (fromEmail === 'hello@notify.railway.app' || (!fromEmail.endsWith('@gmail.com') && !fromEmail.endsWith('@may-baker.com'))) {
                            console.log(`Email from ${fromEmail} is not from an allowed domain or is from the railway app. Skipping.`);
                            // Mark email as seen without creating a ticket
                            imap.addFlags(seqno, ['\Seen'], (err) => {
                                if (err) {
                                    console.log('Error marking email as seen:', err);
                                }
                            });
                            return;
                        }
                        const report = {
                            issue: subject,
                            description: text,
                            reportedBy: fromEmail,
                            dateReported: new Date().toLocaleDateString(),
                            timeReported: new Date().toLocaleTimeString(),
                            status: 'open',
                        };

                        try {
                            // Get user to see if they exist
                            const userResponse = await axios.get(`http://localhost:${process.env.PORT || 5500}/api/users`);
                            const users = userResponse.data;
                            const user = users.find(u => u.email === fromEmail);

                            if (user) {
                                report.branch = user.branch;
                                report.department = user.department;
                            }

                            // Get staff to assign the ticket to
                            const staffResponse = await axios.get(`http://localhost:${process.env.PORT || 5500}/api/users`);
                            const staff = staffResponse.data.filter(u => u.role === 'admin' || u.role === 'superadmin');

                            if (staff.length > 0) {
                                // Simple assignment: assign to the first admin/superadmin
                                report.staff = staff[0].email;
                            }

                            const response = await axios.post(`http://localhost:${process.env.PORT || 5500}/api/reports`, report);
                            if (response.status === 201) {
                                console.log('Ticket created successfully');
                                // Send notification email
                                if (report.staff) {
                                    const transporter = nodemailer.createTransport({
                                        host: process.env.SMTP_HOST,
                                        port: process.env.SMTP_PORT,
                                        secure: process.env.SMTP_SECURE === 'true',
                                        auth: {
                                            user: process.env.SMTP_USER,
                                            pass: process.env.SMTP_PASSWORD,
                                        },
                                    });

                                    const mailOptions = {
                                        from: process.env.SMTP_USER,
                                        to: report.staff,
                                        subject: `New Ticket Assigned: ${report.issue}`,
                                        text: `A new ticket has been assigned to you.\n\nIssue: ${report.issue}\nDescription: ${report.description}\nReported by: ${report.reportedBy}`,
                                    };

                                    transporter.sendMail(mailOptions, (error, info) => {
                                        if (error) {
                                            console.error('Error sending email:', error);
                                        } else {
                                            console.log('Email sent:', info.response);
                                        }
                                    });
                                }
                            }
                        } catch (error) {
                            console.error('Error creating ticket:', error.message);
                        }

                        // Mark email as seen
                        imap.addFlags(seqno, ['\Seen'], (err) => {
                            if (err) {
                                console.log('Error marking email as seen:', err);
                            }
                        });
                    });
                });
            });
            f.once('error', (err) => {
                console.log('Fetch error: ' + err);
            });
            f.once('end', () => {
                console.log('Done fetching all messages!');
                imap.end();
            });
        });
    });
};

module.exports = { startEmailService };
