import nodemailer from 'nodemailer';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import XLSX from 'xlsx';
import mammoth from 'mammoth';
import kbManager from './kb-manager.js';
import { createAndStoreEmbeddingsForLongText } from './embeddings-helper.js';

class SmtpEmailHandler {
  constructor(config) {
    this.config = config;
    this.transporter = null;
    this.imap = null;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.keepaliveInterval = null;
    // Callback invoked when IMAP reports new mail (imap 'mail' event)
    this.onMailCallback = null;
  }

  async connect() {
    try {
      console.log('Creating SMTP transport with config:', {
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: true,
        auth: {
          user: this.config.email
        }
      });

      // Use standard SMTP authentication
      this.transporter = nodemailer.createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: true,
        auth: {
          user: this.config.email,
          pass: this.config.password
        },
        tls: {
          rejectUnauthorized: false
        },
        debug: true,
        logger: true,
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000
      });

      console.log('Creating IMAP connection with config:', {
        host: this.config.imapHost,
        port: this.config.imapPort,
        tls: true,
        user: this.config.email
      });

      await this.setupImap();

      // Test SMTP connection
      console.log('Testing SMTP connection...');
      await this.testSmtpConnection();
      console.log('SMTP connection test successful');
      
      // Test IMAP connection
      console.log('Testing IMAP connection...');
      await this.testImapConnection();
      console.log('IMAP connection test successful');
      
      return true;
    } catch (error) {
      console.error('Kapcsolódási hiba:', error);
      if (error.code) console.error('Error code:', error.code);
      if (error.command) console.error('Failed command:', error.command);
      return false;
    }
  }

  async disconnect() {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }

    if (this.imap && this.imap.state !== 'disconnected') {
      try {
        await new Promise((resolve) => {
          const cleanup = () => {
            try {
              if (this.imap) {
                this.imap.removeAllListeners();
              }
            } catch (err) {
              console.error('Error removing listeners:', err);
            }
            resolve();
          };
          
          // Set timeout to prevent hanging
          const timeoutId = setTimeout(() => {
            console.log('Disconnect timeout - forcing cleanup');
            cleanup();
          }, 5000);
          
          this.imap.once('end', () => {
            clearTimeout(timeoutId);
            cleanup();
          });
          
          this.imap.once('close', () => {
            clearTimeout(timeoutId);
            cleanup();
          });
          
          this.imap.once('error', (err) => {
            console.error('Error during disconnect:', err);
            clearTimeout(timeoutId);
            cleanup();
          });
          
          try {
            this.imap.end();
          } catch (err) {
            console.error('Error ending connection:', err);
            cleanup();
          }
        });
      } catch (error) {
        console.error('Error in disconnect:', error);
      }
    }
    
    // Always ensure imap is nullified at the end
    this.imap = null;
  }

  async setupImap() {
    try {
      // Clean up existing connection first
      await this.disconnect();

      this.imap = new Imap({
        user: this.config.email,
        password: this.config.password,
        host: this.config.imapHost,
        port: this.config.imapPort,
        tls: true,
        tlsOptions: {
          rejectUnauthorized: false
        },
        keepalive: true,
        debug: console.log,
        authTimeout: 60000,
        connTimeout: 60000,
        socketTimeout: 0,
        autotls: 'always'
      });

      // Set up error handler first
      this.imap.on('error', async (err) => {
        console.error('IMAP error:', err);
        if (err.source === 'timeout' || err.code === 'EAUTH') {
          console.log('Authentication or timeout error, attempting reconnect...');
          await this.handleDisconnect();
        } else if (this.imap && this.imap.state !== 'disconnected') {
          await this.handleDisconnect();
        }
      });

      // Handle unexpected disconnections
      this.imap.on('close', async () => {
        console.log('IMAP connection closed unexpectedly');
        await this.handleDisconnect();
      });

      // Notify about new mail immediately so the app can fetch and cache
      this.imap.on('mail', async (numNew) => {
        try {
          console.log('IMAP mail event, new messages count:', numNew);
          if (typeof this.onMailCallback === 'function') {
            // call without awaiting to avoid blocking IMAP event loop
            try { this.onMailCallback(numNew); } catch (e) { console.error('onMailCallback error:', e); }
          }
        } catch (e) {
          console.error('Error handling mail event:', e);
        }
      });

      // Handle end event
      this.imap.on('end', () => {
        console.log('IMAP connection ended');
      });

      return this.imap;
    } catch (error) {
      console.error('Error in setupImap:', error);
      throw error;
    }
  }

  // Allow main process to register a callback invoked when IMAP signals new mail
  setOnMailCallback(cb) {
    this.onMailCallback = cb;
  }

  async handleDisconnect() {
    if (this.isReconnecting) return;
    
    this.isReconnecting = true;
    console.log('Attempting to reconnect...');

    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      try {
        this.reconnectAttempts++;
        console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        await this.setupImap();
        await this.testImapConnection();
        
        console.log('Reconnection successful');
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        return true;
      } catch (error) {
        console.error('Reconnection failed:', error);
        // Delay 5 másodperc minden próbálkozás között
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    console.error('Max reconnection attempts reached');
    return false;
  }

  async testSmtpConnection() {
    try {
      await this.transporter.verify();
      console.log('SMTP kapcsolat sikeres');
      return true;
    } catch (error) {
      console.error('SMTP kapcsolódási hiba:', error);
      if (error.code) console.error('Error code:', error.code);
      if (error.command) console.error('Failed command:', error.command);
      throw error;
    }
  }

  async testImapConnection() {
    return new Promise((resolve, reject) => {
      console.log('Attempting IMAP connection...');
      
      const errorHandler = (err) => {
        this.imap.removeListener('ready', readyHandler);
        reject(err);
      };

      const readyHandler = () => {
        this.imap.removeListener('error', errorHandler);
        console.log('IMAP connection successful');
        resolve();
      };

      this.imap.once('error', errorHandler);
      this.imap.once('ready', readyHandler);

      // Only connect if not already connected
      if (this.imap.state !== 'connected') {
        this.imap.connect();
      }
    });
  }

  async getUnreadEmails() {
    return new Promise((resolve, reject) => {
      try {
        if (!this.imap) {
          return reject(new Error('IMAP connection is not established.'));
        }
        const emails = [];
        const parsePromises = []; // ÚJ

        const openInbox = (cb) => {
          this.imap.openBox('INBOX', false, (err) => {
            if (err) return reject(err);
            cb();
          });
        };

        const processMailbox = () => {
          this.imap.search(['UNSEEN'], (err, results) => {
            if (err) return reject(err);

            if (!results.length) {
              return resolve([]);
            }

            const limited = results.slice(-50);

            const f = this.imap.fetch(limited, {
              bodies: '',
              struct: true,
              markSeen: false,
              uid: true              // LEGYEN EGYÉRTELMŰ
            });

            f.on('message', (msg) => {
              let raw = '';
              let uid = null;

              msg.on('attributes', attrs => {
                uid = attrs.uid;
              });

              msg.on('body', (stream) => {
                stream.on('data', chunk => raw += chunk.toString('utf8'));
              });

              msg.once('end', () => {
                const p = simpleParser(raw)
                  .then(parsed => {
                    emails.push({
                      id: uid,
                      from: parsed.from?.text || '',
                      subject: parsed.subject || '',
                      date: parsed.date ? parsed.date.toISOString() : '',
                      body: parsed.text || '',
                      html: parsed.html || null,
                      text: parsed.text || '',
                      snippet: (parsed.text || '').slice(0, 100)
                    });
                  })
                  .catch(e => console.error('Mail parse hiba (unread):', e));
                parsePromises.push(p);
              });
            });

            f.once('error', err => reject(err));
            f.once('end', async () => {
              try {
                await Promise.all(parsePromises); // VÁRUNK MINDEN PARSINGRA
                emails.sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(emails);
              } catch (e) {
                reject(e);
              }
            });
          });
        };

        if (this.imap.state === 'authenticated' || this.imap.state === 'selected' || this.imap.state === 'connected') {
          openInbox(processMailbox);
        } else {
          this.imap.once('ready', () => openInbox(processMailbox));
          this.imap.once('error', reject);
          this.imap.connect();
        }
      } catch (err) {
        return reject(err);
      }
    });
  }

  // Return the most recent emails (regardless of read/unread). Limit optional.
  async getRecentEmails(limit = null) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.imap) {
          return reject(new Error('IMAP connection is not established.'));
        }
        const emails = [];
        const parsePromises = [];

        const openInbox = (cb) => {
          this.imap.openBox('INBOX', false, (err) => {
            if (err) return reject(err);
            cb();
          });
        };

        const processMailbox = () => {
          // Try to read `fromDate` from settings.json (format: YYYY-MM-DD)
          // and convert it to IMAP search format (DD-MMM-YYYY) for SINCE.
          let searchCriteria = ['ALL'];
          try {
            const settingsPath = path.resolve(process.cwd(), 'settings.json');
            const raw = fs.readFileSync(settingsPath, 'utf8');
            const settings = JSON.parse(raw);
            const fromDateStr = settings?.fromDate;
            if (fromDateStr && /^\d{4}-\d{2}-\d{2}$/.test(fromDateStr)) {
              const [y, m, d] = fromDateStr.split('-');
              const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const imapDate = `${parseInt(d, 10)}-${months[parseInt(m, 10) - 1]}-${y}`;
              searchCriteria = ['SINCE', imapDate];
            }
          } catch (e) {
            console.error('[AIServiceApp][smtp-handler.js] settings.json read error:', e.message);
          }

          this.imap.search(searchCriteria, (err, results) => {
            if (err) return reject(err);

            if (!results.length) {
              return resolve([]);
            }

            const limited = (limit && limit > 0) ? results.slice(-limit) : results;

            const f = this.imap.fetch(limited, {
              bodies: '',
              struct: true,
              markSeen: false,
              uid: true
            });

            f.on('message', (msg) => {
              let raw = '';
              let uid = null;

              msg.on('attributes', attrs => {
                uid = attrs.uid;
              });

              msg.on('body', (stream) => {
                stream.on('data', chunk => raw += chunk.toString('utf8'));
              });

              msg.once('end', () => {
                const p = simpleParser(raw)
                  .then(parsed => {
                    // Save attachments (if any) to attachments folder and include metadata
                    const attachmentsArr = [];
                    try {
                      if (Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
                        const attsDir = path.resolve(process.cwd(), 'fromAttachments');
                        if (!fs.existsSync(attsDir)) fs.mkdirSync(attsDir, { recursive: true });
                        for (const a of parsed.attachments) {
                          try {
                            const name = a.filename || `att-${uid}-${Date.now()}`;
                            const safeName = `${uid}-${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                            const filePath = path.join(attsDir, safeName);
                            // write the raw content buffer to disk
                            fs.writeFileSync(filePath, a.content);
                            const b64 = Buffer.from(a.content).toString('base64');
                            // keep the raw buffer for immediate processing
                            attachmentsArr.push({ filename: name, mimeType: a.contentType || 'application/octet-stream', path: filePath, base64: b64, raw: a.content });
                            // start async processing: extract text -> add to KB -> delete file
                            try {
                              // create an async task but don't await here; we'll push to parsePromises later
                              const proc = (async () => {
                                try {
                                  let extracted = '';
                                  const ext = (path.extname(name) || '').toLowerCase();
                                  const mt = (a.contentType || '').toLowerCase();
                                  // PDF
                                  if (ext === '.pdf' || mt.includes('pdf')) {
                                    try {
                                      const pdfRes = await pdfParse(a.content);
                                      extracted = pdfRes && pdfRes.text ? String(pdfRes.text) : '';
                                    } catch (pe) {
                                      console.error('[smtp-handler] pdf parse error:', pe && pe.message ? pe.message : pe);
                                    }
                                  } else if (ext === '.xlsx' || ext === '.xls' || mt.includes('spreadsheet')) {
                                    try {
                                      const wb = XLSX.read(a.content, { type: 'buffer' });
                                      const sheets = wb.SheetNames || [];
                                      const parts = [];
                                      // Collect per-cell KB entries so we can embed/retrieve exact cell values
                                      const cellKBs = [];
                                      for (const sname of sheets) {
                                        try {
                                          const sh = wb.Sheets[sname];
                                          // produce a human-readable CSV fallback for general extracted text
                                          const csv = XLSX.utils.sheet_to_csv(sh || {});
                                          if (csv) parts.push(csv);

                                          // get a 2D array of rows to iterate cells and retain coordinates
                                          const rows = XLSX.utils.sheet_to_json(sh || {}, { header: 1, raw: false, defval: '' });
                                          for (let r = 0; r < rows.length; r++) {
                                            const row = rows[r] || [];
                                            for (let c = 0; c < row.length; c++) {
                                              try {
                                                const val = row[c];
                                                if (val === null || val === undefined) continue;
                                                const sval = String(val).trim();
                                                if (!sval) continue;
                                                // compute A1-style address
                                                let addr = null;
                                                try { addr = XLSX.utils.encode_cell({ r, c }); } catch (ea) { addr = `${r + 1}:${c + 1}`; }
                                                const cellId = `${uid || parsed.messageId || Date.now()}-att-${safeName}-sheet-${sname}-cell-${addr}`;
                                                // compute column letter (A, B, C...)
                                                let col = c + 1;
                                                let colLetter = '';
                                                while (col > 0) {
                                                  const rem = (col - 1) % 26;
                                                  colLetter = String.fromCharCode(65 + rem) + colLetter;
                                                  col = Math.floor((col - 1) / 26);
                                                }
                                                const cellAddress = `${sname}!${colLetter}${r + 1}`;
                                                const kbEmail = {
                                                  id: cellId,
                                                  from: parsed.from?.text || '',
                                                  subject: parsed.subject || `Attachment: ${name} [${sname} ${addr}]`,
                                                  date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
                                                  body: sval,
                                                  sheet: sname,
                                                  colLetter,
                                                  row: r + 1,
                                                  cellAddress
                                                };
                                                cellKBs.push(kbEmail);
                                              } catch (cellErr) {
                                                // ignore single cell errors
                                              }
                                            }
                                          }
                                        } catch (se) { /* ignore sheet errors */ }
                                      }
                                      extracted = parts.join('\n\n');

                                      // If we collected cell-level entries, add them to the KB so
                                      // embeddings are created per cell and exact cell retrieval
                                      // becomes possible. This is async but we await here so the
                                      // mailbox processing includes it.
                                      try {
                                        if (cellKBs.length) {
                                          // batch-add cells to KB (kb-manager will handle embedding)
                                          await kbManager.addEmails(cellKBs);
                                        }
                                      } catch (kbCellErr) {
                                        console.error('[smtp-handler] failed to add per-cell KB entries:', kbCellErr && kbCellErr.message ? kbCellErr.message : kbCellErr);
                                      }
                                    } catch (xe) {
                                      console.error('[smtp-handler] xlsx parse error:', xe && xe.message ? xe.message : xe);
                                    }
                                  } else if (ext === '.docx' || mt.includes('word')) {
                                    try {
                                      const mm = await mammoth.extractRawText({ buffer: a.content });
                                      extracted = mm && mm.value ? String(mm.value) : '';
                                    } catch (me) {
                                      console.error('[smtp-handler] mammoth parse error:', me && me.message ? me.message : me);
                                    }
                                  } else if (ext === '.eml' || mt.includes('message/rfc822')) {
                                    try {
                                      const parsedAtt = await simpleParser(a.content);
                                      extracted = parsedAtt && parsedAtt.text ? String(parsedAtt.text) : '';
                                    } catch (ee) {
                                      console.error('[smtp-handler] eml parse error:', ee && ee.message ? ee.message : ee);
                                    }
                                  } else if (mt.startsWith('text/')) {
                                    try {
                                      extracted = String(a.content.toString('utf8'));
                                    } catch (te) {
                                      console.error('[smtp-handler] text attachment read error:', te && te.message ? te.message : te);
                                    }
                                  }

                                  if (extracted && extracted.length > 10) {
                                    try {
                                      // Create a minimal email-like object for KB ingestion
                                      const kbEmail = {
                                        id: `${uid || parsed.messageId || Date.now()}-att-${safeName}`,
                                        from: parsed.from?.text || '',
                                        subject: parsed.subject || `Attachment: ${name}`,
                                        date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
                                        body: extracted
                                      };
                                      // Add to KB
                                      await kbManager.addEmails([kbEmail]);
                                      // Also create embeddings for the extracted text (chunked)
                                      try {
                                        const helperPath = path.join(process.cwd(), 'src', 'backend', 'embeddings-helper.js');
                                        const { pathToFileURL } = await import('url');
                                        const helperUrl = pathToFileURL(helperPath).href;
                                        const { createAndStoreEmbeddingsForLongText } = await import(helperUrl);
                                        await createAndStoreEmbeddingsForLongText(extracted, { filename: name, sourceId: uid || parsed.messageId || null, maxTokens: 2000 });
                                      } catch (embErr) {
                                        console.error('[smtp-handler] embedding helper error:', embErr && embErr.message ? embErr.message : embErr);
                                      }
                                    } catch (ke) {
                                      console.error('[smtp-handler] kbManager.addEmails error:', ke && ke.message ? ke.message : ke);
                                    }
                                  }
                                } finally {
                                  // remove file to avoid leaving local temp files
                                  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (delErr) { console.error('[smtp-handler] failed to delete attachment file:', delErr && delErr.message ? delErr.message : delErr); }
                                }
                              })();
                              // push this processing promise so the mailbox wait will include it
                              parsePromises.push(proc);
                            } catch (procErr) {
                              console.error('[smtp-handler] scheduling attachment processing failed:', procErr && procErr.message ? procErr.message : procErr);
                            }
                          } catch (ea) {
                            console.error('Attachment save error (recent):', ea && ea.message ? ea.message : ea);
                          }
                        }
                      }
                    } catch (eatt) {
                      console.error('Error processing parsed.attachments (recent):', eatt && eatt.message ? eatt.message : eatt);
                    }

                    emails.push({
                      id: uid,
                      from: parsed.from?.text || '',
                      subject: parsed.subject || '',
                      date: parsed.date ? parsed.date.toISOString() : '',
                      body: parsed.text || '',
                      html: parsed.html || null,
                      text: parsed.text || '',
                      // Return the full text as snippet (no truncation)
                      snippet: parsed.text || '',
                      attachments: attachmentsArr
                    });
                  })
                  .catch(e => console.error('Mail parse hiba (recent):', e));
                parsePromises.push(p);
              });
            });

            f.once('error', err => reject(err));
            f.once('end', async () => {
              try {
                await Promise.all(parsePromises);
                // Filter by settings.fromDate (keep emails from that date up to now)
                try {
                  const settingsPath = path.resolve(process.cwd(), 'settings.json');
                  const raw = fs.readFileSync(settingsPath, 'utf8');
                  const settings = JSON.parse(raw);
                  const fromDateStr = settings?.fromDate;
                  if (fromDateStr && /^\d{4}-\d{2}-\d{2}$/.test(fromDateStr)) {
                    const [y, m, d] = fromDateStr.split('-');
                    const startDate = new Date(Number(y), Number(m) - 1, Number(d));
                    startDate.setHours(0,0,0,0);
                    const filtered = emails.filter(e => {
                      try {
                        const ed = e.date ? new Date(e.date) : null;
                        return ed && !isNaN(ed) && ed >= startDate;
                      } catch (ex) { return false; }
                    });
                    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
                    resolve(filtered);
                    return;
                  }
                } catch (pfErr) {
                  console.error('[AIServiceApp][smtp-handler.js] settings.json read error (post-filter):', pfErr.message);
                }

                emails.sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(emails);
              } catch (e) {
                reject(e);
              }
            });
          });
        };

        if (this.imap.state === 'authenticated' || this.imap.state === 'selected' || this.imap.state === 'connected') {
          openInbox(processMailbox);
        } else {
          this.imap.once('ready', () => openInbox(processMailbox));
          this.imap.once('error', reject);
          this.imap.connect();
        }
      } catch (err) {
        return reject(err);
      }
    });
  }

  async sendEmail({ to, subject, body, html, attachments }) {
    try {
      console.log('SMTP sendMail params:', { from: this.config.email, to, subject });
      await this.transporter.sendMail({
        from: this.config.email,
        to,
        subject,
        text: body,
        html: html,
        attachments: attachments,
        encoding: 'utf-8',
        textEncoding: 'base64' // <-- KÉNYSZERÍTSD BASE64-RE!
      });
      return { success: true };
    } catch (error) {
      console.error('Email küldési hiba:', error);
      return { success: false, error: error.message };
    }
  }

  async markAsRead(messageId) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.imap) {
          return reject(new Error('IMAP connection is not established.'));
        }
        const markRead = () => {
          this.imap.openBox('INBOX', false, (err) => {
            if (err) {
              reject(err);
              return;
            }

            this.imap.addFlags(messageId, ['\\Seen'], (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
        };

        if (this.imap.state === 'connected') {
          markRead();
        } else {
          this.imap.once('ready', markRead);
          this.imap.once('error', reject);
          this.imap.connect();
        }
      } catch (err) {
        if (err instanceof TypeError) {
          console.error('TypeError (ignored) in markAsRead:', err.message);
          return reject(err);
        } else {
          console.error('Error in markAsRead:', err);
          return reject(err);
        }
      }
    });
  }

  async getEmailById(id) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.imap) return reject(new Error('IMAP connection is not established.'));
        const fetchEmail = () => {
          this.imap.openBox('INBOX', false, (err) => {
            if (err) return reject(err);

            const f = this.imap.fetch(id, {
              bodies: '',   // FULL RAW
              struct: true,
              uid: true
            });

            f.on('message', (msg) => {
              let raw = '';
              let uid = id;

              msg.on('attributes', attrs => {
                uid = attrs.uid;
              });

              msg.on('body', (stream) => {
                stream.on('data', chunk => raw += chunk.toString('utf8'));
              });

              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(raw);
                    // Save any attachments to disk and include metadata
                    const attachmentsArr = [];
                    try {
                      if (Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
                        const attsDir = path.resolve(process.cwd(), 'fromAttachments');
                        if (!fs.existsSync(attsDir)) fs.mkdirSync(attsDir, { recursive: true });
                        for (const a of parsed.attachments) {
                          try {
                            const name = a.filename || `att-${uid || id}-${Date.now()}`;
                            const safeName = `${uid || id}-${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                            const filePath = path.join(attsDir, safeName);
                            fs.writeFileSync(filePath, a.content);
                            const b64 = Buffer.from(a.content).toString('base64');
                            attachmentsArr.push({ filename: name, mimeType: a.contentType || 'application/octet-stream', path: filePath, base64: b64 });
                          } catch (ea) {
                            console.error('Attachment save error (getEmailById):', ea && ea.message ? ea.message : ea);
                          }
                        }
                      }
                    } catch (eatt) {
                      console.error('Error processing parsed.attachments (getEmailById):', eatt && eatt.message ? eatt.message : eatt);
                    }

                    resolve({
                      id: uid,
                      from: parsed.from?.text || '',
                      subject: parsed.subject || '',
                      date: parsed.date ? parsed.date.toISOString() : '',
                      body: parsed.text || '',
                      html: parsed.html || null,
                      text: parsed.text || '',
                      raw,
                      attachments: attachmentsArr
                    });
                } catch (e) {
                  reject(e);
                }
              });
            });

            f.once('error', err => reject(err));
          });
        };

        if (this.imap.state === 'connected' || this.imap.state === 'authenticated' || this.imap.state === 'selected') {
          fetchEmail();
        } else {
          this.imap.once('ready', fetchEmail);
          this.imap.once('error', reject);
          this.imap.connect();
        }
      } catch (err) {
        reject(err);
      }
    });
  }
}

export default SmtpEmailHandler;