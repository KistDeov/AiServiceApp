import nodemailer from 'nodemailer';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

class SmtpEmailHandler {
  constructor(config) {
    this.config = config;
    this.transporter = null;
    this.imap = null;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.keepaliveInterval = null;
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
                  resolve({
                    id: uid,
                    from: parsed.from?.text || '',
                    subject: parsed.subject || '',
                    date: parsed.date ? parsed.date.toISOString() : '',
                    body: parsed.text || '',
                    html: parsed.html || null,
                    text: parsed.text || '',
                    raw
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