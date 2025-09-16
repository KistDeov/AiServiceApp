import dotenv from 'dotenv';
import { findFile } from './src/utils/findFile.js';
dotenv.config({ path: findFile('.env') });
import path from 'path';
import { fileURLToPath } from 'url';
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { getUnreadEmails, getEmailById } from './gmail.js';
import { OpenAI } from 'openai';
import XLSX from 'xlsx';
import 'dotenv/config';
import { authorize } from './src/backend/auth.js';
import { google } from 'googleapis';
import fs from 'fs';
import SmtpEmailHandler from './src/backend/smtp-handler.js';
import ExcelJS from 'exceljs';
import dns from 'dns';
import mysql from 'mysql2/promise'; // a fájl tetején legyen!
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';  

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // If someone tries to open another instance, focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

//Frissitési kliens
updateElectronApp({
  updateSource: {
    type: UpdateSourceType.ElectronPublicUpdateService,
    repo: 'KistDeov/AiServiceApp'
  },
  updateInterval: '5 minutes'
})


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPLIED_EMAILS_FILE = findFile('RepliedEmails.json');
const watermarkLink = 'https://okosmail.hu';
const watermarkImagePath = path.join(__dirname, 'src', 'images', 'watermark.png');

// Környezeti változók és útvonalak kezelése
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const AUTH_STATE_FILE = path.join(app.getPath('userData'), 'auth_state.json');
const TOKEN_PATH = findFile('token.json');
const SETTINGS_FILE = findFile('settings.json');

// Declare mainWindow globally
let mainWindow = null;

// Globális hibakezelő, hogy semmilyen uncaught exception ne állítsa le a main process-t
process.on('uncaughtException', (err) => {
  console.error('Globális uncaughtException (IGNORED):', err);
  // Ne dobjuk tovább, csak logoljuk!
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Globális unhandledRejection (IGNORED):', reason);
  // Ne dobjuk tovább, csak logoljuk!
});

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Hiba a konfiguráció beolvasásakor:', err);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Hiba a konfiguráció mentésekor:', err);
  }
}

let config = readConfig();

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

// Attachment upload handler (max 25MB, attachments folder)
ipcMain.handle('upload-attachment', async (event, { name, size, content }) => {
  console.log('[upload-attachment] Fájl feltöltés megkezdése:', { name, size });
  try {
    if (!name || !content) {
      console.error('[upload-attachment] Hiányzó fájlnév vagy tartalom:', { name, contentType: typeof content });
      return { success: false, error: 'Hiányzó fájlnév vagy tartalom.' };
    }
    if (size > 25 * 1024 * 1024) {
      console.error(`[upload-attachment] Túl nagy fájl (${size} bájt):`, name);
      return { success: false, error: 'A fájl mérete nem lehet nagyobb 25 MB-nál.' };
    }
    // Ensure attachments folder exists
    const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }
    // Avoid overwrite: if file exists, add (1), (2), ...
    let base = path.parse(name).name;
    let ext = path.parse(name).ext;
    let filePath = path.join(attachmentsDir, name);
    let counter = 1;
    while (fs.existsSync(filePath)) {
      filePath = path.join(attachmentsDir, `${base}(${counter})${ext}`);
      counter++;
    }
    try {
      fs.writeFileSync(filePath, Buffer.from(content));
    } catch (writeErr) {
      console.error(`[upload-attachment] Nem sikerült írni a fájlt: ${filePath}`, writeErr);
      return { success: false, error: 'Nem sikerült menteni a fájlt: ' + writeErr.message };
    }
    console.log(`[upload-attachment] Sikeres feltöltés: ${filePath} (${size} bájt)`);
    return { success: true, filePath };
  } catch (error) {
    console.error('[upload-attachment] Általános hiba:', error, { name, size });
    return { success: false, error: error.message };
  }
});

// Attachment delete handler
ipcMain.handle('delete-attachment', async (event, { name }) => {
  try {
    if (!name) return { success: false, error: 'Hiányzó fájlnév.' };
    const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
    const filePath = path.join(attachmentsDir, name);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'A fájl nem található.' };
    }
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (error) {
    console.error('Hiba a csatolmány törlésekor:', error);
    return { success: false, error: error.message };
  }
});

// Attachment list handler
ipcMain.handle('list-attachments', async () => {
  try {
    const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
    if (!fs.existsSync(attachmentsDir)) return [];
    const files = fs.readdirSync(attachmentsDir).filter(f => fs.statSync(path.join(attachmentsDir, f)).isFile());
    return files;
  } catch (error) {
    console.error('Hiba a csatolmányok listázásakor:', error);
    return [];
  }
});

// DEMO vége flag, ha több mint 100 elküldött email van
function isDemoOver() {
  try {
    const log = readSentEmailsLog();
    return Array.isArray(log) && log.length >= 100; 
  } catch (e) {
    return false;
  }
}

ipcMain.handle('get-licence-from-localstorage', async (event, licence) => {
  return licence || '';
});

async function setTrialEndedForLicence(licence) {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    const [result] = await connection.execute(
      'UPDATE user SET trialEnded = 1 WHERE licence = ?',
      [licence]
    );
    console.log('[SQL] UPDATE result:', result); // LOG
    await connection.end();
    return result.affectedRows > 0;
  } catch (err) {
    console.error('TrialEnded frissítési hiba:', err);
    return false;
  }
}

ipcMain.handle('is-demo-over', async (event) => {
  const demoOver = isDemoOver();
  if (demoOver) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      const licence = await win.webContents.executeJavaScript('localStorage.getItem("licence")');
      console.log('[DEMO OVER] Licence:', licence); // LOG
      if (licence) {
        const result = await setTrialEndedForLicence(licence);
        console.log('[DEMO OVER] setTrialEndedForLicence result:', result); // LOG
      } else {
        console.log('[DEMO OVER] Licence kulcs nem található a localStorage-ben!');
      }
    }
    localStorage.removeItem('isLicenced');
    localStorage.removeItem('licence');
  }
  return demoOver;
});

// API kulcs kezelése
ipcMain.handle('setApiKey', async (event, apiKey) => {
  config.OPENAI_API_KEY = apiKey;
  saveConfig(config);
  openai.apiKey = apiKey;
  return true;
});

ipcMain.handle('getApiKey', async () => {
  return config.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
});

// Add to settings defaults
const defaultSettings = {
  autoSend: false,
  autoSendStartTime: "08:00",
  autoSendEndTime: "16:00",
  displayMode: "windowed",
  LeftNavBarOn: true,
  greeting: "Tisztelt Ügyfelünk!",
  signature: "Üdvözlettel,\nAz Ön csapata",
  signatureText: "",
  signatureImage: "",
  ignoredEmails: [], // Új: lista az ignorált email címekhez
  minEmailDate: "", 
  maxEmailDate: ""
};

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const fileSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  return { ...defaultSettings, ...fileSettings, ignoredEmails: fileSettings.ignoredEmails || [] };
    }
  } catch (err) {
    console.error('Hiba a beállítások beolvasásakor:', err);
  }
  return { ...defaultSettings };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Hiba a beállítások mentésekor:', err);
  }
}

let settings = readSettings();
let autoSend = settings.autoSend || false;

ipcMain.handle("getAutoSend", async () => {
  return autoSend;
});

let emailMonitoringInterval = null;
let internetMonitorInterval = null;
let lastInternetStatus = null;

function startInternetMonitoring() {
  if (internetMonitorInterval) clearInterval(internetMonitorInterval);
  const emitStatus = (online) => {
    if (online) {
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('internet-connection-restored'));
    } else {
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('no-internet-connection'));
    }
  };
  const checkNow = async () => {
    try {
      const ok = await checkInternetConnection();
      if (lastInternetStatus === null) {
        // első állapot: mindig küldjük ki (offline-nál azonnal vált)
        emitStatus(ok);
      } else if (ok !== lastInternetStatus) {
        emitStatus(ok);
      }
      lastInternetStatus = ok;
    } catch {
      if (lastInternetStatus !== false) emitStatus(false);
      lastInternetStatus = false;
    }
  };
  // Azonnali első ellenőrzés
  checkNow();
  internetMonitorInterval = setInterval(checkNow, 3000); // 3 mp
}

function stopInternetMonitoring() {
  if (internetMonitorInterval) {
    clearInterval(internetMonitorInterval);
    internetMonitorInterval = null;
  }
}

let smtpHandler = null;

let repliedEmailIds = readRepliedEmails();
let replyInProgressIds = [];

async function getEmailsBasedOnProvider() {
  // ...existing code...
  let emails = [];
  if (authState.provider === 'smtp') {
    emails = await smtpHandler.getUnreadEmails();
  } else if (authState.provider === 'gmail') {
    emails = await getUnreadEmails();
  } else {
    throw new Error('No valid email provider configured');
  }
  // --- DÁTUM SZŰRÉS JAVÍTÁS ---
  if (settings.minEmailDate || settings.maxEmailDate) {
    const minDate = settings.minEmailDate ? new Date(settings.minEmailDate) : null;
    if (minDate) minDate.setHours(0, 0, 0, 0);
    const maxDate = settings.maxEmailDate ? new Date(settings.maxEmailDate) : null;
    if (maxDate) maxDate.setHours(23, 59, 59, 999);
    emails = emails.filter(email => {
      let emailDate = null;
      if (email.internalDate) {
        emailDate = new Date(Number(email.internalDate));
      } else if (email.date) {
        emailDate = new Date(email.date);
        if (isNaN(emailDate)) {
          const parts = email.date.match(/(\d{4})[.\-\/ ]+(\d{2})[.\-\/ ]+(\d{2})/);
          if (parts) {
            emailDate = new Date(`${parts[1]}-${parts[2]}-${parts[3]}`);
          }
        }
      }
      if (!emailDate || isNaN(emailDate)) return false;
      if (minDate && emailDate < minDate) return false;
      if (maxDate && emailDate > maxDate) return false;
      return true;
    });
  }
  return emails;
}

async function getEmailByIdBasedOnProvider(id) {
  if (authState.provider === 'smtp') {
    if (!smtpHandler || !smtpHandler.imap) {
      throw new Error('SMTP/IMAP connection is not established. Please check your connection and try again.');
    }
    return await smtpHandler.getEmailById(id);
  } else if (authState.provider === 'gmail') {
    return await getEmailById(id);
  } else {
    throw new Error('No valid email provider configured');
  }
}

function checkInternetConnection() {
  return new Promise((resolve) => {
    dns.lookup('google.com', (err) => {
      resolve(!err);
    });
  });
}

function startEmailMonitoring() {
  if (emailMonitoringInterval) {
    clearInterval(emailMonitoringInterval);
  }

  emailMonitoringInterval = setInterval(async () => {
    try {
      // --- INTERNET CHECK: skip if offline ---
      const hasInternet = await checkInternetConnection();
      if (!hasInternet) {
        console.log('No internet connection, skipping email check.');
        // Értesítsük a renderert
        BrowserWindow.getAllWindows().forEach(window => {
          window.webContents.send('no-internet-connection');
        });
        return;
      } else {
        // Ha visszajött a net, jelezzük a rendernek
        BrowserWindow.getAllWindows().forEach(window => {
          window.webContents.send('internet-connection-restored');
        });
      }
      const currentTime = new Date();
      const currentHour = currentTime.getHours();
      const currentMinute = currentTime.getMinutes();
      const currentTimeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

      console.log('Checking emails at:', currentTimeString);

      // --- SPAM + IGNORED szűrés ---
      const spamKeywords = ['spam', 'junk', 'promóció', 'reklám', 'ad', 'free money', "guaranteed", "amazing deal", "act now", "limited time", "click here", "buy now"];
      let unreadEmails = await getEmailsBasedOnProvider();
      // Filter out spam and ignored emails
      const ignoredEmailsList = (settings.ignoredEmails || []).map(e => e.trim().toLowerCase()).filter(Boolean);
      unreadEmails = unreadEmails.filter(email => {
        const subject = (email.subject || '').toLowerCase();
        const from = (email.from || '').toLowerCase();
        // Gmail esetén labelIds tartalmazza-e a SPAM-t
        if (email.labelIds && Array.isArray(email.labelIds) && email.labelIds.includes('SPAM')) return false;
        // Subject vagy from tartalmaz spam kulcsszót
        if (spamKeywords.some(word => subject.includes(word) || from.includes(word))) return false;
        // Ignore, ha benne van az ignoredEmails-ben
        if (ignoredEmailsList.some(ignored => from.includes(ignored))) return false;
        return true;
      });
      console.log('Fetched emails (spam+ignored szűrve):', unreadEmails.length);

      // Notify renderer about new emails for MailView update
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('emails-updated', unreadEmails);
      });

      // Handle auto-replies if enabled
      if (settings.autoSend && 
          currentTimeString >= settings.autoSendStartTime && 
          currentTimeString <= settings.autoSendEndTime &&
          unreadEmails && 
          unreadEmails.length > 0) {
        
        console.log(`Processing ${unreadEmails.length} emails for auto-reply`);
        
        for (const email of unreadEmails) {
          try {
            // IGNORE if subject or sender contains 'noreply' (case-insensitive)
            const subjectLower = (email.subject || '').toLowerCase();
            const fromLower = (email.from || '').toLowerCase();
            if (subjectLower.includes('noreply') || fromLower.includes('noreply') || subjectLower.includes('no reply') || fromLower.includes('no reply') || subjectLower.includes('no-reply') || fromLower.includes('no-reply')) {
              console.log('Skipping noreply email:', email.id, email.subject, email.from);
              continue;
            }
            if (!repliedEmailIds.includes(email.id) && !replyInProgressIds.includes(email.id)) {
              replyInProgressIds.push(email.id);
              console.log('Processing email for reply:', email.id, email.subject);
              // Robust getEmailById with reconnect and retry, and ignore TypeError
              let fullEmail;
              try {
                fullEmail = await getEmailByIdBasedOnProvider(email.id);
              } catch (err) {
                if (err instanceof TypeError) {
                  console.error('TypeError (ignored) in getEmailById:', err.message, 'Email ID:', email.id);
                  replyInProgressIds = replyInProgressIds.filter(id => id !== email.id);
                  continue;
                }
                if (authState.provider === 'smtp' && smtpHandler) {
                  console.error('getEmailById error, trying reconnect:', err);
                  try {
                    await smtpHandler.connect();
                    fullEmail = await getEmailByIdBasedOnProvider(email.id);
                  } catch (err2) {
                    if (err2 instanceof TypeError) {
                      console.error('TypeError (ignored) in getEmailById after reconnect:', err2.message, 'Email ID:', email.id);
                      replyInProgressIds = replyInProgressIds.filter(id => id !== email.id);
                      continue;
                    }
                    console.error('getEmailById failed after reconnect:', err2);
                    replyInProgressIds = replyInProgressIds.filter(id => id !== email.id);
                    continue; // skip this email
                  }
                } else {
                  console.error('getEmailById error:', err);
                  continue;
                }
              }
              let generatedReply;
              try {
                generatedReply = await generateReply(fullEmail);
              } catch (err) {
                if (err instanceof TypeError) {
                  console.error('TypeError (ignored) in generateReply:', err.message, 'Email ID:', email.id);
                  continue;
                }
                console.error('generateReply error:', err, 'Email ID:', email.id);
                continue;
              }
              let replyResult;
              try {
                if (authState.provider === 'smtp' && smtpHandler) {
                  const toAddress = extractEmailAddress(fullEmail.from);
                  if (!toAddress) {
                    console.error('Nem sikerült email címet kinyerni a from mezőből:', fullEmail.from);
                    continue;
                  }
                  console.log('SMTP auto-reply sendReply params:', { to: toAddress, subject: fullEmail.subject, body: generatedReply });
                  replyResult = await sendReply({
                    to: toAddress,
                    subject: `${fullEmail.subject}`,
                    body: generatedReply,
                    emailId: fullEmail.id
                  });
                  console.log('SMTP auto-reply sendReply result:', replyResult);
                } else if (authState.provider === 'gmail') {
                  console.log('GMAIL auto-reply sendReply params:', { to: fullEmail.from, subject: fullEmail.subject, body: generatedReply });
                  replyResult = await sendReply({
                    to: fullEmail.from,
                    subject: `${fullEmail.subject}`,
                    body: generatedReply,
                    emailId: fullEmail.id
                  });
                  console.log('GMAIL auto-reply sendReply result:', replyResult);
                }
              } catch (err) {
                if (err instanceof TypeError) {
                  console.error('TypeError (ignored) in sendReply:', err.message, 'Email ID:', email.id);
                  continue;
                }
                console.error('sendReply error:', err, 'Email ID:', email.id);
                continue;
              }
              if ((replyResult && replyResult.success) || (replyResult && replyResult.id)) {
                let markedAsRead = false;
                let markError = null;
                if (authState.provider === 'smtp' && smtpHandler) {
                  for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                      await smtpHandler.markAsRead(email.id);
                      markedAsRead = true;
                      break;
                    } catch (err) {
                      markError = err;
                      console.error('SMTP markAsRead error (attempt ' + (attempt+1) + '):', err);
                      if (smtpHandler && smtpHandler.imap && smtpHandler.imap.state !== 'connected') {
                        try { await smtpHandler.connect(); } catch (e) { console.error('Reconnect failed:', e); }
                      }
                      if (attempt === 0) {
                        try {
                          await smtpHandler.connect();
                          await smtpHandler.markAsRead(email.id);
                          markedAsRead = true;
                          break;
                        } catch (err2) {
                          markError = err2;
                          console.error('SMTP markAsRead failed after reconnect:', err2);
                        }
                      }
                    }
                  }
                } else if (authState.provider === 'gmail') {
                  try {
                    const auth = await authorize();
                    const gmail = google.gmail({ version: 'v1', auth });
                    console.log('[GMAIL] Mark as read, messageId:', email.id);
                    const modifyRes = await gmail.users.messages.modify({
                      userId: 'me',
                      id: email.id,
                      requestBody: {
                        removeLabelIds: ['UNREAD']
                      }
                    });
                    console.log('[GMAIL] Modify response:', JSON.stringify(modifyRes.data));
                    markedAsRead = true;
                  } catch (modifyErr) {
                    console.error('[GMAIL] Modify error:', modifyErr);
                  }
                }
                if (markedAsRead) {
                  if (!Array.isArray(repliedEmailIds)) repliedEmailIds = [];
                  repliedEmailIds.push(email.id);
                  saveRepliedEmails(repliedEmailIds);
                  console.log('Reply sent and email marked as read for:', email.id);
                } else {
                  console.error('Reply sent, but failed to mark as read:', email.id, markError);
                }
              } else {
                console.log('Reply failed for email:', email.id, 'replyResult:', JSON.stringify(replyResult));
              }
            } else {
              console.log('Email already replied to:', email.id);
            }
          } catch (error) {
            if (error instanceof TypeError) {
              console.error('TypeError (ignored):', error.message, 'Email ID:', email.id);
              continue;
            } else {
              console.error('Error processing email:', error, 'Email ID:', email.id);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof TypeError) {
        console.error('Top-level TypeError (ignored in interval):', err.message);
      } else {
        console.error('Top-level error in email monitoring interval:', err);
      }
      // Do not throw, just log and continue
    }
  }, 5000); // 5 másodperc
}

function stopEmailMonitoring() {
  if (emailMonitoringInterval) {
    clearInterval(emailMonitoringInterval);
    emailMonitoringInterval = null;
  }
}

function isWithinAutoSendHours() {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  
  const [startHour, startMinute] = settings.autoSendStartTime.split(':').map(Number);
  const [endHour, endMinute] = settings.autoSendEndTime.split(':').map(Number);
  
  const startTime = startHour * 60 + startMinute;
  const endTime = endHour * 60 + endMinute;
  
  return currentTime >= startTime && currentTime < endTime;
}

// IPC handler: Get and set ignored emails (globális scope-ban, ne csak startEmailMonitoring-on belül)
ipcMain.handle('getIgnoredEmails', async () => {
  return settings.ignoredEmails || [];
});

ipcMain.handle('setIgnoredEmails', async (event, ignoredEmails) => {
  settings.ignoredEmails = Array.isArray(ignoredEmails)
    ? ignoredEmails.filter(e => typeof e === 'string').map(e => e.trim()).filter(Boolean)
    : [];
  saveSettings(settings);
  return true;
});

ipcMain.handle("setAutoSend", async (event, value) => {
  autoSend = value;
  settings.autoSend = value;
  saveSettings(settings);
  // Always start monitoring (it will just skip auto-reply if autoSend is false)
  startEmailMonitoring();
});

ipcMain.handle("setAutoSendTimes", async (event, { startTime, endTime }) => {
  settings.autoSendStartTime = startTime;
  settings.autoSendEndTime = endTime;
  saveSettings(settings);
  return true;
});

ipcMain.handle("getAutoSendTimes", async (event) => {
  return {
    startTime: settings.autoSendStartTime,
    endTime: settings.autoSendEndTime
  };
});

ipcMain.handle('getMinEmailDate', async () => {
  return settings.minEmailDate || "";
});

ipcMain.handle('setMinEmailDate', async (event, dateStr) => {
  settings.minEmailDate = dateStr;
  saveSettings(settings);
  return true;
});

ipcMain.handle('getMaxEmailDate', async () => {
  return settings.maxEmailDate || "";
});

ipcMain.handle('setMaxEmailDate', async (event, dateStr) => {
  settings.maxEmailDate = dateStr;
  saveSettings(settings);
  return true;
});

function readRepliedEmails() {
  try {
    if (fs.existsSync(REPLIED_EMAILS_FILE)) {
      return JSON.parse(fs.readFileSync(REPLIED_EMAILS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Hiba a válaszolt levelek beolvasásakor:', err);
  }
  return [];
}

function saveRepliedEmails(ids) {
  try {
    fs.writeFileSync(REPLIED_EMAILS_FILE, JSON.stringify(ids, null, 2), 'utf-8');
  } catch (err) {
    console.error('Hiba a válaszolt levelek mentésekor:', err);
  }
}

// Excel fájl kezelése
async function readExcelDataWithImages() {
  try {
    const excelFile = path.join(app.getPath('userData'), 'adatok.xlsx');
    if (fs.existsSync(excelFile)) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelFile);
      const allData = {};
      const allImages = [];
      workbook.eachSheet((worksheet, sheetId) => {
        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
          rows.push(row.values);
        });
        allData[worksheet.name] = rows;
      });
      // Képek kigyűjtése
      workbook.media.forEach((media, idx) => {
        if (media.type === 'image') {
          // base64 string
          allImages.push({
            buffer: media.buffer,
            extension: media.extension || 'png',
            base64: `data:image/${media.extension || 'png'};base64,${media.buffer.toString('base64')}`
          });
        }
      });
      return { allData, allImages };
    }
  } catch (err) {
    console.error('Hiba az Excel fájl beolvasásakor (képekkel):', err);
  }
  return { allData: {}, allImages: [] };
}

// Új Excel fájl feltöltése
ipcMain.handle('upload-excel-file', async (event, fileContent) => {
  try {
    const targetPath = path.join(app.getPath('userData'), 'adatok.xlsx');
    
    // Write the file content to disk
    fs.writeFileSync(targetPath, Buffer.from(fileContent));
    
    // Ellenőrizzük, hogy olvasható-e az Excel fájl
    const workbook = XLSX.readFile(targetPath);
    if (!workbook.SheetNames.length) {
      throw new Error('Az Excel fájl üres vagy nem olvasható!');
    }
    
    return { success: true };
  } catch (error) {
    console.error('Hiba az Excel fájl feltöltésekor:', error);
    return { success: false, error: error.message };
  }
});

//Új kép fájl feltöltése
ipcMain.handle('upload-image-file', async (event, fileContent) => {
  try {
    const imagesDir = path.join(app.getPath('userData'), 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    const targetPath = path.join(imagesDir, 'signature.png');
    fs.writeFileSync(targetPath, Buffer.from(fileContent));
    // Állítsuk be a settings.signatureImage-t is!
    settings.signatureImage = targetPath;
    saveSettings(settings);
    return { success: true };
  } catch (error) {
    console.error('Hiba a kép fájl feltöltésekor:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-image-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const filePath = result.filePaths[0];
      const content = fs.readFileSync(filePath);
      return { success: true, content: content };
    } catch (error) {
      console.error('Hiba a fájl olvasásakor:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'No file selected' };
});

ipcMain.handle('delete-signature-image', async () => {
  try {
    let errors = [];
    // Mindig az src/images/signature.png-t töröljük
    const imagePath = path.join(__dirname, 'src', 'images', 'signature.png');
    try {
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    } catch (e) {
      errors.push('src/images/signature.png: ' + e.message);
    }
    // Töröljük a settingsből is
    settings.signatureImage = '';
    saveSettings(settings);
    if (errors.length > 0) {
      return { success: false, error: errors.join('; ') };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});


ipcMain.handle('show-file-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const filePath = result.filePaths[0];
      const content = fs.readFileSync(filePath);
      return { success: true, content: content };
    } catch (error) {
      console.error('Hiba a fájl olvasásakor:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'No file selected' };
});

// IPC handlers for prompt settings
ipcMain.handle('getPromptSettings', async () => {
  return {
    greeting: settings.greeting || defaultSettings.greeting,
    signature: settings.signature || defaultSettings.signature,
    signatureText: settings.signatureText || defaultSettings.signatureText,
    signatureImage: settings.signatureImage || defaultSettings.signatureImage
  };
});
ipcMain.handle('savePromptSettings', async (event, { greeting, signature, signatureText, signatureImage }) => {
  settings.greeting = greeting;
  settings.signature = signature;
  settings.signatureText = signatureText;
  settings.signatureImage = signatureImage;
  saveSettings(settings);
  return true;
});

// Refactor promptBase and generateReply
let promptBase = `Egy ügyféltől a következő email érkezett:\n\n{greeting}\n\n"{email.body}"\n\n{imageDescriptions}\n\n{excelImageDescriptions}\n\nA következő adatokat használd fel a válaszadáshoz:\n{excelData}\n\n{signature}`;

async function generateReply(email) {
  try {
    // Excel adatok és képek beolvasása
    const { allData: excelData, allImages: excelImages } = await readExcelDataWithImages();
    // Excel adatok formázása
    const formattedExcelData = Object.entries(excelData)
      .map(([sheetName, rows]) => {
        const rowsText = rows.map((row, index) => {
          if (typeof row === 'object' && !Array.isArray(row)) {
            return `   ${index + 1}. ${Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(', ')}`;
          } else if (Array.isArray(row)) {
            return `   ${index + 1}. ${row.join(', ')}`;
          } else {
            return `   ${index + 1}. ${row}`;
          }
        }).join('\n');
        return `Munkalap: ${sheetName}\n${rowsText}`;
      })
      .join('\n\n');
    // Excel képek leírása
    let excelImageDescriptions = '';
    if (excelImages && excelImages.length > 0) {
      const aiDescs = await describeImagesWithAI(excelImages);
      excelImageDescriptions = '\nAz Excelből származó képek AI által generált leírásai:';
      excelImageDescriptions += aiDescs.map((desc, idx) => `\n${idx + 1}. ${desc}`).join('');
      excelImageDescriptions += '\n';
    }
    // Use greeting and signature from settings
    const greeting = settings.greeting || defaultSettings.greeting;
    const signature = settings.signature || defaultSettings.signature;
    // Képleírások összegyűjtése (emailből)
    let imageDescriptions = '';
    if (email.aiImageResponses && email.aiImageResponses.length > 0) {
      imageDescriptions = '\nA levélhez csatolt képek AI által generált leírásai:';
      imageDescriptions += email.aiImageResponses.map((resp, idx) => {
        let desc = '';
        if (resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) {
          desc = resp.choices[0].message.content;
        } else {
          desc = JSON.stringify(resp);
        }
        return `\n${idx + 1}. ${desc}`;
      }).join('');
      imageDescriptions += '\n';
    }
    const finalPrompt = promptBase
      .replace('{greeting}', greeting)
      .replace('{signature}', signature)
      .replace('{email.body}', email.body)
      .replace('{excelData}', formattedExcelData)
      .replace('{imageDescriptions}', imageDescriptions)
      .replace('{excelImageDescriptions}', excelImageDescriptions);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "Te egy segítőkész asszisztens vagy, aki udvarias és professzionális válaszokat ír az ügyfeleknek. Az Excel adatokat használd fel a válaszadáshoz, ha releváns információt találsz bennük. Az adatok különböző munkalapokról származnak, mindegyiket vedd figyelembe a válaszadásnál." 
        },
        { role: "user", content: finalPrompt }
      ],
      temperature: 0.7,
    });
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Hiba a válasz generálásakor:', error);
    throw error;
  }
}

async function autoReplyEmail(email) {
  try {
    if (!isWithinAutoSendHours()) {
      console.log('Automatikus válasz kihagyva: időablakon kívül');
      return { success: false, error: 'Időablakon kívül' };
    }

    console.log('AutoReplyEmail kezdése:', email.id);
    const generatedReply = await generateReply(email);
    const result = await sendReply({
      to: email.from,
      subject: `${email.subject}`,
      body: generatedReply,
      emailId: email.id
    });

    console.log('Válasz küldés eredménye:', result, 'Email ID:', email.id);
    return result;
  } catch (error) {
    console.error('Hiba az automatikus válasz során:', error, 'Email ID:', email.id);
    return { success: false, error: error.message };
  }
}

// Helper to extract body from Gmail API payload
// filepath: [main.js](http://_vscodecontentref_/3)
function extractBody(payload) {
  // Rekurzív keresés text/plain-re, ha nincs, akkor text/html-re
  function findPart(part, preferredType) {
    if (!part) return null;
    if (part.mimeType === preferredType && part.body && part.body.data) {
      let text = Buffer.from(part.body.data, 'base64').toString('utf8');
      if (preferredType === 'text/html') {
        text = text.replace(/<[^>]+>/g, '');
      }
      return text;
    }
    if (part.parts && Array.isArray(part.parts)) {
      for (const p of part.parts) {
        const found = findPart(p, preferredType);
        if (found) return found;
      }
    }
    return null;
  }
  // Először próbáljuk a text/plain-t
  let result = findPart(payload, 'text/plain');
  if (result) return result;
  // Ha nincs, próbáljuk a text/html-t
  result = findPart(payload, 'text/html');
  if (result) return result;
  // Ha semmi nincs, térjünk vissza üres stringgel!
  return '';
}
// --- MIME / QP segédfüggvények (új) ---
function decodeQuotedPrintableFallback(str) {
  if (!str || !/=([A-Fa-f0-9]{2})/.test(str)) return str;
  // Lágy sortörések eltávolítása
  str = str.replace(/=\r?\n/g, '');
  // Byte gyűjtés
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '=' && /^[A-Fa-f0-9]{2}$/.test(str.slice(i+1, i+3))) {
      bytes.push(parseInt(str.slice(i+1, i+3), 16));
      i += 2;
    } else {
      bytes.push(str.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function stripMimeArtifacts(text) {
  if (!text) return text;
  return text
    .split(/\r?\n/)
    .filter(l => !/^--[_A-Za-z0-9-]+$/.test(l.trim()) &&
                 !/^Content-(Type|Transfer-Encoding|Disposition):/i.test(l.trim()) &&
                 !/^MIME-Version:/i.test(l.trim()))
    .join('\n')
    .trim();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function buildQuotedOriginalPlain(originalPlain) {
  return originalPlain
    .split(/\r?\n/)
    .map(l => l.trim() ? '> ' + l : '>')
    .join('\n');
}

function prepareOriginalForQuote(originalEmail) {
  let txt = originalEmail?.text || originalEmail?.body || '';
  if (!txt && originalEmail?.raw) {
    // Utolsó mentsvár – ne használjuk ha nem muszáj
    txt = originalEmail.raw;
  }
  // Ha még mindig QP minták vannak, dekódoljuk
  if (/=C[0-9A-F]/i.test(txt) || /=\r?\n/.test(txt)) {
    txt = decodeQuotedPrintableFallback(txt);
  }
  txt = stripMimeArtifacts(txt);
  return txt;
}

async function sendReply({ to, subject, body, emailId }) {
  try {
    let sendResult;
    const signatureText = settings.signatureText || '';
    const signatureImage = settings.signatureImage || '';
    let htmlBody = null;
    let imageCid = 'signature';
    let watermarkCid = 'watermark';
    let imageMime = '';
    let imagePath = '';
    let originalFrom = '';
    let originalDate = '';
    let originalSubject = '';
    let originalBody = '';
    let originalBodyPlain = '';

    // --- Attachments: list all files in attachments folder ---
    const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
    let attachmentFiles = [];
    if (fs.existsSync(attachmentsDir)) {
      attachmentFiles = fs.readdirSync(attachmentsDir).filter(f => fs.statSync(path.join(attachmentsDir, f)).isFile());
    }

    // Build nodemailer-style attachments array
    const nodemailerAttachments = attachmentFiles.map(filename => ({
      filename,
      path: path.join(attachmentsDir, filename)
    }));

    // Add signature image if exists
    if (signatureImage) {
      imagePath = signatureImage;
      if (fs.existsSync(imagePath)) {
        nodemailerAttachments.push({
          filename: path.basename(signatureImage),
          path: imagePath,
          cid: imageCid
        });
      }
    }
    // Add watermark image if exists
    if (fs.existsSync(watermarkImagePath)) {
      nodemailerAttachments.push({
        filename: 'watermark.png',
        path: watermarkImagePath,
        cid: watermarkCid
      });
    }

    // --- Eredeti üzenet adatok betöltése ---
    if (emailId) {
      try {
        let headers, payload;
        if (authState.provider === 'smtp' && smtpHandler) {
          const originalEmail = await smtpHandler.getEmailById(emailId);
          originalFrom = originalEmail.from || '';
          originalDate = originalEmail.date || '';
          originalSubject = originalEmail.subject || '';
          originalBodyPlain = prepareOriginalForQuote(originalEmail);
        } else {
          // Gmail esetén
          const auth = await authorize();
          const gmail = google.gmail({ version: 'v1', auth });
          const originalEmail = await gmail.users.messages.get({
            userId: 'me',
            id: emailId,
            format: 'full',
          });
          headers = originalEmail.data.payload.headers;
          payload = originalEmail.data.payload;
          originalFrom = headers.find(h => h.name === 'From')?.value || '';
          originalDate = headers.find(h => h.name === 'Date')?.value || '';
          originalSubject = headers.find(h => h.name === 'Subject')?.value || '';
          originalBodyPlain = extractBody(payload);
          if (/=C[0-9A-F]/i.test(originalBodyPlain) || /=\r?\n/.test(originalBodyPlain)) {
            originalBodyPlain = decodeQuotedPrintableFallback(originalBodyPlain);
          }
          originalBodyPlain = stripMimeArtifacts(originalBodyPlain);
        }
      } catch (err) {
        console.error('Nem sikerült az eredeti email betöltése:', err);
      }
    }

    // --- Idézett eredeti üzenet blokk (plain és html) ---
    // Tisztítsd meg az idézett eredeti szöveget minden MIME/maradék kódolástól!
    let cleanOriginal = originalBodyPlain;
    if (cleanOriginal) {
      cleanOriginal = decodeQuotedPrintableFallback(cleanOriginal);
      cleanOriginal = stripMimeArtifacts(cleanOriginal);
    }
    // Itt még egyszer dekódoljuk, ha kell!
    cleanOriginal = decodeQuotedPrintableFallback(cleanOriginal);
    cleanOriginal = stripMimeArtifacts(cleanOriginal);

    const quotedOriginal = cleanOriginal
      ? `\n\n----- Eredeti üzenet -----\nFeladó: ${originalFrom}\nDátum: ${originalDate}\nTárgy: ${originalSubject}\n\n${buildQuotedOriginalPlain(cleanOriginal)}`
      : '';

    const finalText = body + quotedOriginal;

    const htmlReply = (() => {
      let mainPart = escapeHtml(body).replace(/\n/g, '<br>');
      if (signatureText) mainPart += `<br><br>${escapeHtml(signatureText)}`;
      if (signatureImage) mainPart += `<br><img src="cid:${imageCid}" style="width:15%">`;
      if (fs.existsSync(watermarkImagePath)) {
        mainPart += `<br><b>Charter Okos Mail</b><br><a href="${watermarkLink}" target="_blank"><img src="cid:${watermarkCid}" style="width:15%"></a>`;
      }
      if (!cleanOriginal) return `<p>${mainPart}</p>`;
      const originalHtmlBlock = escapeHtml(cleanOriginal).replace(/\n/g, '<br>');
      return `<div style="font-family:Arial,Helvetica,sans-serif;white-space:normal;">
<p>${mainPart}</p>
<hr style="margin:16px 0;border:none;border-top:1px solid #ccc;">
<div style="color:#555;font-size:12px;margin-bottom:4px;">Eredeti üzenet</div>
<blockquote style="margin:0;padding-left:8px;border-left:3px solid #ccc;white-space:normal;">${originalHtmlBlock}</blockquote>
</div>`;
    })();

    // --- SMTP ---
    if (authState.provider === 'smtp' && smtpHandler) {
      sendResult = await smtpHandler.sendEmail({
        to,
        subject,
        body: finalText,
        html: htmlReply,
        attachments: nodemailerAttachments,
      });
    } else {
      // --- GMAIL ---
      let boundary = '----=_Part_' + Math.random().toString(36).slice(2);
      let mimeMsg = '';
      let encodedSubject = `=?UTF-8?B?${Buffer.from(subject || 'Válasz', 'utf-8').toString('base64')}?=`;
      mimeMsg += `To: ${formatAddress(to)}\r\n`;
      mimeMsg += `Subject: ${encodedSubject}\r\n`;
      mimeMsg += `MIME-Version: 1.0\r\n`;
      mimeMsg += `Content-Type: multipart/related; boundary="${boundary}"\r\n`;

      // --- TEXT/PLAIN part (EZ HIÁNYZOTT!) ---
      mimeMsg += `\r\n--${boundary}\r\n`;
      mimeMsg += `Content-Type: text/plain; charset="UTF-8"\r\n`;
      mimeMsg += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
      mimeMsg += `${finalText}\r\n`;

      // --- HTML part ---
      mimeMsg += `\r\n--${boundary}\r\n`;
      mimeMsg += `Content-Type: text/html; charset="UTF-8"\r\n`;
      mimeMsg += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
      mimeMsg += `${htmlReply}\r\n`;
      // Signature image inline
      if (signatureImage && fs.existsSync(imagePath)) {
        const ext = path.extname(signatureImage).toLowerCase();
        if (ext === '.png') imageMime = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') imageMime = 'image/jpeg';
        else if (ext === '.gif') imageMime = 'image/gif';
        else imageMime = 'application/octet-stream';
        const imageData = fs.readFileSync(imagePath);
        mimeMsg += `\r\n--${boundary}\r\n`;
        mimeMsg += `Content-Type: ${imageMime}\r\n`;
        mimeMsg += `Content-Transfer-Encoding: base64\r\n`;
        mimeMsg += `Content-ID: <${imageCid}>\r\n`;
        mimeMsg += `Content-Disposition: inline; filename="${signatureImage}"\r\n\r\n`;
        mimeMsg += imageData.toString('base64').replace(/(.{76})/g, '$1\r\n') + '\r\n';
      }
      // Watermark image inline
      if (fs.existsSync(watermarkImagePath)) {
        const ext = path.extname(watermarkImagePath).toLowerCase();
        let watermarkMime = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') watermarkMime = 'image/jpeg';
        else if (ext === '.gif') watermarkMime = 'image/gif';
        const watermarkData = fs.readFileSync(watermarkImagePath);
        mimeMsg += `\r\n--${boundary}\r\n`;
        mimeMsg += `Content-Type: ${watermarkMime}\r\n`;
        mimeMsg += `Content-Transfer-Encoding: base64\r\n`;
        mimeMsg += `Content-ID: <${watermarkCid}>\r\n`;
        mimeMsg += `Content-Disposition: inline; filename="watermark.png"\r\n\r\n`;
        mimeMsg += watermarkData.toString('base64').replace(/(.{76})/g, '$1\r\n') + '\r\n';
      }
      // Attachments (as regular attachments)
      for (const filename of attachmentFiles) {
        const filePath = path.join(attachmentsDir, filename);
        if (fs.existsSync(filePath)) {
          const fileData = fs.readFileSync(filePath);
          const ext = path.extname(filename).toLowerCase();
          let mimeType = 'application/octet-stream';
          if (ext === '.png') mimeType = 'image/png';
          else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
          else if (ext === '.pdf') mimeType = 'application/pdf';
          else if (ext === '.txt') mimeType = 'text/plain';
          mimeMsg += `\r\n--${boundary}\r\n`;
          mimeMsg += `Content-Type: ${mimeType}\r\n`;
          mimeMsg += `Content-Transfer-Encoding: base64\r\n`;
          mimeMsg += `Content-Disposition: attachment; filename="${filename}"\r\n\r\n`;
          mimeMsg += fileData.toString('base64').replace(/(.{76})/g, '$1\r\n') + '\r\n';
        }
      }
      mimeMsg += `--${boundary}--`;
      const encodedMessage = Buffer.from(mimeMsg)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const auth = await authorize();
      const gmail = google.gmail({ version: 'v1', auth });
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });
      sendResult = { success: true };
    }
    // --- LOG SENT EMAIL ---
    appendSentEmailLog({
      id: emailId || null,
      to,
      subject,
      date: new Date().toISOString(),
      body: finalText,
      signatureText: signatureText,
      signatureImage: signatureImage,
      originalFrom,
      originalDate,
      originalSubject,
      originalBody: originalBodyPlain,
    });
    return sendResult;
  } catch (error) {
    console.error('Hiba az email küldése során:', error);
    throw error;
  }
}

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('get-unread-emails', async () => {
  try {
    return await getEmailsBasedOnProvider();
  } catch (error) {
    console.error('Hiba az emailek lekérésekor:', error);
    throw error;
  }
});

ipcMain.handle('exit-app', () => {
  app.quit();
});

ipcMain.handle('get-email-by-id', async (event, id) => {
  try {
    return await getEmailByIdBasedOnProvider(id);
  } catch (error) {
    console.error('Hiba az email lekérésekor:', error);
    throw error;
  }
});

ipcMain.handle('get-user-email', async () => {
  try {
    if (authState.provider === 'smtp' && smtpHandler) {
      return smtpHandler.config.email;
    } else if (authState.provider === 'gmail') {
      const auth = await authorize();
      const gmail = google.gmail({ version: 'v1', auth });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      return profile.data.emailAddress;
    }
    throw new Error('No valid email provider configured');
  } catch (error) {
    console.error('Hiba az email cím lekérésekor:', error);
    throw error;
  }
});

ipcMain.handle('generate-reply', async (event, email) => {
  try {
    const reply = await generateReply(email);
    return {
      subject: `${email.subject}`,
      body: reply
    };
  } catch (error) {
    console.error('Hiba a válasz generálásakor:', error);
    return {
      subject: email.subject,
      body: 'Sajnálom, nem sikerült választ generálni.'
    };
  }
});

ipcMain.handle('send-reply', async (event, { to, subject, body, emailId }) => {
  const result = await sendReply({ to, subject, body, emailId });
  // Ha sikeres volt a küldés és van emailId, akkor jelöljük olvasottnak
  if (result && result.success && emailId) {
    try {
      if (authState.provider === 'smtp' && smtpHandler) {
        await smtpHandler.markAsRead(emailId);
      } else if (authState.provider === 'gmail') {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.messages.modify({
          userId: 'me',
          id: emailId,
          requestBody: {
            removeLabelIds: ['UNREAD']
          }
        });
      }
      // Frissítsük a repliedEmailIds listát is!
      if (!Array.isArray(repliedEmailIds)) repliedEmailIds = [];
      if (!repliedEmailIds.includes(emailId)) {
        repliedEmailIds.push(emailId);
        saveRepliedEmails(repliedEmailIds);
      }
    } catch (err) {
      console.error('Nem sikerült olvasottnak jelölni a levelet:', err);
    }
  }
  return result;
});

// Authentikációs állapot kezelése
let authState = {
  isAuthenticated: false,
  provider: null,
  credentials: null
};

// Authentikációs állapot mentése
function saveAuthState() {
  try {
    fs.writeFileSync(AUTH_STATE_FILE, JSON.stringify(authState));
  } catch (err) {
    console.error('Hiba az authentikációs állapot mentésekor:', err);
  }
}

// Authentikációs állapot betöltése
function loadAuthState() {
  try {
    if (fs.existsSync(AUTH_STATE_FILE)) {
      const data = fs.readFileSync(AUTH_STATE_FILE, 'utf-8');
      authState = JSON.parse(data);
      console.log('Auth state loaded:', authState); // Debug log
    }
  } catch (err) {
    console.error('Hiba az authentikációs állapot betöltésekor:', err);
    // Reset auth state on error
    authState = {
      isAuthenticated: false,
      provider: null,
      credentials: null
    };
    saveAuthState();
  }
}

ipcMain.handle('login-with-gmail', async () => {
  try {
    // Itt használjuk a meglévő Gmail authentikációt
    const oAuth2Client = await authorize();
    let email = null;
    try {
      const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      email = profile.data.emailAddress;
    } catch (err) {
      console.error('Nem sikerült lekérni a Gmail email címet:', err);
    }
    authState = {
      isAuthenticated: true,
      provider: 'gmail',
      credentials: {
        email // elmentjük az email címet is
      }
    };
    saveAuthState();
    startEmailMonitoring();
    return true;
  } catch (error) {
    console.error('Gmail bejelentkezési hiba:', error);
    return false;
  }
});

ipcMain.handle('check-auth-status', async () => {
  let email = null;
  if (authState.provider === 'smtp' && authState.credentials) {
    email = authState.credentials.email;
  }
  if (authState.provider === 'gmail') {
    if (authState.credentials && authState.credentials.email) {
      email = authState.credentials.email;
    } else {
      // Próbáljuk lekérni a Gmail email címet, ha nincs elmentve
      try {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        email = profile.data.emailAddress;
        // Frissítsük az authState-et is, hogy legközelebb már elmentve legyen
        authState.credentials = { email };
        saveAuthState();
      } catch (err) {
        console.error('Nem sikerült lekérni a Gmail email címet (check-auth-status):', err);
      }
    }
  }
  return {
    isAuthenticated: authState.isAuthenticated,
    provider: authState.provider,
    email
  };
});

ipcMain.handle('login-with-smtp', async (event, config) => {
  try {
    console.log('Attempting SMTP login...'); // Debug log
    smtpHandler = new SmtpEmailHandler(config);
    const success = await smtpHandler.connect();
    
    if (success) {
      console.log('SMTP connection successful, saving auth state...'); // Debug log
      authState = {
        isAuthenticated: true,
        provider: 'smtp',
        credentials: {
          email: config.email,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          imapHost: config.imapHost,
          imapPort: config.imapPort,
          useSSL: config.useSSL,
          password: config.password // We need to store the password for reconnection
        }
      };
      saveAuthState();
      startEmailMonitoring();
      return true;
    }
    return false;
  } catch (error) {
    console.error('SMTP bejelentkezési hiba:', error);
    // Reset auth state on error
    authState = {
      isAuthenticated: false,
      provider: null,
      credentials: null
    };
    saveAuthState();
    return false;
  }
});

ipcMain.handle('logout', async () => {
  try {
    if (smtpHandler) {
      smtpHandler = null;
    }
    
    // Ha Gmail-lel voltunk bejelentkezve, töröljük a token fájlt
    if (authState.provider === 'gmail' && fs.existsSync(TOKEN_PATH)) {
      // Ne töröljük a fájlt, csak ürítsük ki a tartalmát
      fs.writeFileSync(TOKEN_PATH, '', 'utf-8');
    }    
    // Stop email monitoring
    if (emailMonitoringInterval) {
      clearInterval(emailMonitoringInterval);
      emailMonitoringInterval = null;
    }
    
    authState = {
      isAuthenticated: false,
      provider: null,
      credentials: null
    };
    saveAuthState();
    return true;
  } catch (error) {
    console.error('Hiba a kijelentkezés során:', error);
    return false;
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 1080,
    autoHideMenuBar: true,
    minWidth: 1300,
    minHeight: 750,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  //mainWindow.webContents.openDevTools();

  // Apply initial display mode from settings
  if (settings.displayMode === "fullscreen") {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  // Induláskori egyszeri net ellenőrzés – ha nincs, az első betöltés után jelez
  checkInternetConnection().then(hasInternet => {
    if (!hasInternet) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('no-internet-connection');
      });
    }
  });
}

async function checkAndAutoReply() {
  if (!autoSend) return;
  try {
    const emails = await getEmailsBasedOnProvider();
    for (const email of emails) {
      if (!repliedEmailIds.includes(email.id)) {
        await autoReplyEmail(email);
      }
    }
  } catch (error) {
    console.error('Hiba az automatikus válaszok küldésekor:', error);
  }
}

app.whenReady().then(async () => {
  loadAuthState();
  createWindow();
  startInternetMonitoring();
  console.log('Initial auth state:', authState); // Debug log
  
  if (authState.isAuthenticated) {
    try {
      if (authState.provider === 'gmail') {
        if (fs.existsSync(TOKEN_PATH)) {
          await authorize();
          startEmailMonitoring();
        } else {
          authState.isAuthenticated = false;
          saveAuthState();
        }
      } else if (authState.provider === 'smtp' && authState.credentials) {
        console.log('Reconnecting to SMTP...'); // Debug log
        smtpHandler = new SmtpEmailHandler(authState.credentials);
        const success = await smtpHandler.connect();
        if (success) {
          console.log('SMTP reconnection successful'); // Debug log
          startEmailMonitoring();
        } else {
          console.log('SMTP reconnection failed'); // Debug log
          authState.isAuthenticated = false;
          saveAuthState();
        }
      }
    } catch (error) {
      console.error('Hiba az újracsatlakozás során:', error);
      authState.isAuthenticated = false;
      saveAuthState();
    }
  }
});

app.on('window-all-closed', () => {
  if(process.platform !== 'darwin') app.quit();
});

// Add cleanup on app quit
app.on('before-quit', () => {
  stopEmailMonitoring();
  stopInternetMonitoring();
});

// Left navbar handlers
ipcMain.handle("getLeftNavbarMode", async () => {
    return settings.LeftNavBarOn ?? true;
});

ipcMain.handle("setLeftNavbarMode", async (event, mode) => {
  if (!mainWindow) {
    console.error('mainWindow is not initialized');
    return false;
  }
  settings.LeftNavBarOn = mode;
  saveSettings(settings);
  return true;
});

// Display mode handlers
ipcMain.handle("getDisplayMode", async () => {
  return settings.displayMode || "windowed";
});

ipcMain.handle("setDisplayMode", async (event, mode) => {
  if (!mainWindow) {
    console.error('mainWindow is not initialized');
    return false;
  }

  settings.displayMode = mode;
  saveSettings(settings);
  
  if (mode === "fullscreen") {
    mainWindow.maximize();
  } else {
    mainWindow.unmaximize();
  }
  
  return true;
});

// Helper function to extract email address from 'from' field
function extractEmailAddress(fromField) {
  // Egyszerű email cím keresés
  const match = fromField && fromField.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1] : null;
}

// Utility function to convert Markdown links to HTML anchors
//function convertMarkdownLinksToHtml(text) {
//  if (!text) return text;
//  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
//}

ipcMain.handle('get-replied-email-ids', async () => {
  const idsToFetch = repliedEmailIds.slice(-20);
  return idsToFetch;
});

// IPC handler: Get reply statistics (aggregated by day, last 5 days only)
ipcMain.handle('get-reply-stats', async () => {
  try {
    const sentLog = readSentEmailsLog();
    if (!sentLog || sentLog.length === 0) return [];
    // Csak az utolsó 100 rekordot nézzük teljesítmény miatt
    const recent = sentLog.slice(-100);
    // Aggregálás nap szerint (utolsó 5 nap)
    const counts = {};
    const now = new Date();
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const day = d.toLocaleDateString('hu-HU');
      counts[day] = 0;
    }
    recent.forEach(e => {
      if (!e || !e.date) return;
      const d = new Date(e.date);
      if (isNaN(d)) return;
      const day = d.toLocaleDateString('hu-HU');
      if (day in counts) counts[day] = (counts[day] || 0) + 1;
    });
    // Csak az utolsó 5 nap, növekvő sorrendben
    const sorted = Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date.split('.').reverse().join('-')) - new Date(b.date.split('.').reverse().join('-')));
    return sorted;
  } catch (e) {
    return [];
  }
});

// Képleírás generálása OpenAI Vision-nel
async function describeImagesWithAI(images) {
  if (!images || images.length === 0) return [];
  const descriptions = [];
  for (const img of images) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Írj rövid, informatív leírást erről a képről magyarul!" },
              { type: "image_url", image_url: { url: img.base64 } }
            ]
          }
        ],
        max_tokens: 200
      });
      const desc = completion.choices[0]?.message?.content || '(nincs leírás)';
      descriptions.push(desc);
    } catch (err) {
      console.error('AI képleírás hiba:', err);
      descriptions.push('(AI leírás sikertelen)');
    }
  }
  return descriptions;
}

ipcMain.handle('check-licence', async (event, { email, licenceKey }) => {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    // Ellenőrzés
    const [rows] = await connection.execute(
      'SELECT * FROM user WHERE email = ? AND licence = ?',
      [email, licenceKey]
    );
    if (rows.length > 0) {
      // licenceActivated mező beállítása true-ra
      await connection.execute(
        'UPDATE user SET licenceActivated = 1 WHERE email = ? AND licence = ?',
        [email, licenceKey]
      );
      await connection.end();
      return { success: true };
    } else {
      await connection.end();
      return { success: false, error: 'Hibás licenc vagy email.' };
    }
  } catch (err) {
    console.error('Licenc ellenőrzési hiba:', err);
    return { success: false, error: 'Adatbázis hiba.' };
  }
});


ipcMain.handle('read-sent-emails-log', async () => {
  try {
    // Use the helper if available
    if (typeof readSentEmailsLog === 'function') {
      return readSentEmailsLog();
    }
    // Fallback: read the file directly
    const sentPath = findFile('sentEmailsLog.json');
    if (fs.existsSync(sentPath)) {
      return JSON.parse(fs.readFileSync(sentPath, 'utf-8'));
    }
    return [];
  } catch (err) {
    console.error('Hiba a sentEmailsLog.json olvasásakor:', err);
    return [];
  }
});

ipcMain.handle('copy-image-to-exe-root', async () => {
  const isPackaged = process.mainModule && process.mainModule.filename.indexOf('app.asar') !== -1;
  if (!isPackaged) return true;
  try {
    const src = path.join(process.resourcesPath, 'app', 'signature.png');
    const exeDir = path.dirname(app.getPath('exe'));
    const dest = path.join(exeDir, 'signature.png');
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
    return true;
  } catch (e) {
    console.error('Hiba a signature.png másolásakor az exe mellé:', e);
    return false;
  }
});

ipcMain.handle('getSignatureImageFileUrl', async () => {
  try {
    if (!settings.signatureImage) return '';
    // Ha abszolút útvonal, akkor azt használjuk, különben __dirname-ből számoljuk
    let absPath = settings.signatureImage;
    if (!path.isAbsolute(absPath)) {
      absPath = path.join(__dirname, settings.signatureImage);
    }
    if (!fs.existsSync(absPath)) return '';
    // file:// URL-t adunk vissza
    return 'file://' + absPath.replace(/\\/g, '/');
  } catch (e) {
    return '';
  }
});

ipcMain.handle('check-internet', async () => {
  try {
    return await checkInternetConnection();
  } catch {
    return false;
  }
});

// Példa: signature.png feltöltésekor a mappa létrehozása, ha nem létezik
ipcMain.handle('upload-signature-image', async (event, fileContent) => {
  try {
    const imagesDir = path.join(app.getPath('userData'), 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    const targetPath = path.join(imagesDir, 'signature.png');
    fs.writeFileSync(targetPath, Buffer.from(fileContent));
    settings.signatureImage = targetPath;
    saveSettings(settings);
    return { success: true, path: targetPath };
  } catch (error) {
    console.error('Hiba a signature kép feltöltésekor:', error);
    return { success: false, error: error.message };
  }
});

// Példa: csatolmány feltöltésekor a mappa létrehozása, ha nem létezik
ipcMain.handle('upload-attachment', async (event, { name, size, content }) => {
  console.log('[upload-attachment] Fájl feltöltés megkezdése:', { name, size });
  try {
    if (!name || !content) {
      console.error('[upload-attachment] Hiányzó fájlnév vagy tartalom:', { name, contentType: typeof content });
      return { success: false, error: 'Hiányzó fájlnév vagy tartalom.' };
    }
    if (size > 25 * 1024 * 1024) {
      console.error(`[upload-attachment] Túl nagy fájl (${size} bájt):`, name);
      return { success: false, error: 'A fájl mérete nem lehet nagyobb 25 MB-nál.' };
    }
    // Ensure attachments folder exists
    const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }
    // Avoid overwrite: if file exists, add (1), (2), ...
    let base = path.parse(name).name;
    let ext = path.parse(name).ext;
    let filePath = path.join(attachmentsDir, name);
    let counter = 1;
    while (fs.existsSync(filePath)) {
      filePath = path.join(attachmentsDir, `${base}(${counter})${ext}`);
      counter++;
    }
    try {
      fs.writeFileSync(filePath, Buffer.from(content));
    } catch (writeErr) {
      console.error(`[upload-attachment] Nem sikerült írni a fájlt: ${filePath}`, writeErr);
      return { success: false, error: 'Nem sikerült menteni a fájlt: ' + writeErr.message };
    }
    console.log(`[upload-attachment] Sikeres feltöltés: ${filePath} (${size} bájt)`);
    return { success: true, filePath };
  } catch (error) {
    console.error('[upload-attachment] Általános hiba:', error, { name, size });
    return { success: false, error: error.message };
  }
});

// Példa: adatbázis importálásakor a mappa létrehozása, ha nem létezik
ipcMain.handle('import-database', async (event, fileContent) => {
  try {
    const dbDir = app.getPath('userData');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const targetPath = path.join(dbDir, 'adatok.xlsx');
    fs.writeFileSync(targetPath, Buffer.from(fileContent));
    return { success: true, path: targetPath };
  } catch (error) {
    console.error('Hiba az adatbázis importálásakor:', error);
    return { success: false, error: error.message };
  }
});

function appendSentEmailLog(entry) {
  try {
    const sentPath = findFile('sentEmailsLog.json');
    let log = [];
    if (fs.existsSync(sentPath)) {
      log = JSON.parse(fs.readFileSync(sentPath, 'utf-8'));
    }
    log.push(entry);
    // Csak az utolsó 500 rekordot tartsuk meg
    if (log.length > 500) log = log.slice(-500);
    fs.writeFileSync(sentPath, JSON.stringify(log, null, 2), 'utf-8');
  } catch (err) {
    console.error('Hiba a sentEmailsLog.json írásakor:', err);
  }
}