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

                        // Check if it's a reply to an assignment email
                        const replySubjectMatch = subject.match(/Re: New Helpdesk Request Assigned \(ID: (\d+)\):/);
                        const resolutionKeywords = ['resolved', 'completed', 'fixed', 'done'];
                        const isResolutionEmail = resolutionKeywords.some(keyword => text.toLowerCase().includes(keyword));

                        if (replySubjectMatch && isResolutionEmail) {
                            const reportId = replySubjectMatch[1];
                            console.log(`Detected resolution email for Report ID: ${reportId}`);
                            try {
                                const now = new Date();
                                const resolutionTime = now.toLocaleTimeString();
                                const dateClosed = now.toLocaleDateString();

                                const updateResponse = await axios.put(`http://localhost:${process.env.PORT || 5500}/api/reports/${reportId}`, {
                                    status: 'resolved',
                                    resolutionTime: resolutionTime,
                                    dateClosed: dateClosed
                                });

                                if (updateResponse.status === 200) {
                                    console.log(`Report ${reportId} marked as resolved.`);
                                } else {
                                    console.error(`Failed to mark report ${reportId} as resolved:`, updateResponse.data.message);
                                }
                            } catch (error) {
                                console.error(`Error updating report ${reportId}:`, error.message);
                            }
                            // Mark email as seen and skip further processing for this email
                            imap.addFlags(seqno, ['\Seen'], (err) => {
                                if (err) {
                                    console.log('Error marking email as seen:', err);
                                }
                            });
                            return;
                        }

                        // Original logic for creating new tickets
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
                                        subject: `New Helpdesk Request Assigned (ID: ${response.data.id}): ${report.issue}`,
                                        html: `
                                            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                                              <div style="text-align: center; padding: 20px 0;">
                                                <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT0khPVXRmSCB14Patt-Kn5PJGtOG5yyJenuA&s" alt="Company Logo" style="max-width: 150px;">
                                              </div>
                                              <h2 style="color: #22a7f0;">New Helpdesk Request Assigned</h2>
                                              <p>You have been assigned a new helpdesk request with the following details:</p>
                                              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                                <tr>
                                                  <td style="padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2; font-weight: bold;">Issue:</td>
                                                  <td style="padding: 8px; border: 1px solid #ddd;">${report.issue}</td>
                                                </tr>
                                                <tr>
                                                  <td style="padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2; font-weight: bold;">Description:</td>
                                                  <td style="padding: 8px; border: 1px solid #ddd;">${report.description || 'N/A'}</td>
                                                </tr>
                                                <tr>
                                                  <td style="padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2; font-weight: bold;">Reported By:</td>
                                                  <td style="padding: 8px; border: 1px solid #ddd;">${report.reportedBy || 'Unknown'}</td>
                                                </tr>
                                                <tr>
                                                  <td style="padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2; font-weight: bold;">Department:</td>
                                                  <td style="padding: 8px; border: 1px solid #ddd;">${report.department || 'N/A'}</td>
                                                </tr>
                                              </table>
                                              <p>Please attend to this request as soon as possible.</p>
                                              <p>Thank you.</p>
                                            </div>
                                          `
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
