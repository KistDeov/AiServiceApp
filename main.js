import { findFile } from './src/utils/findFile.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { app, BrowserWindow, ipcMain, dialog, shell, webContents} from 'electron';
import { getUnreadEmails, getEmailById, getRecentEmails } from './gmail.js';
import { OpenAI } from 'openai';
import XLSX from 'xlsx';
import { authorize } from './src/backend/auth.js';
import { google } from 'googleapis';
import fs from 'fs';
import SmtpEmailHandler from './src/backend/smtp-handler.js';
import ExcelJS from 'exceljs';
import dns from 'dns';
import mysql from 'mysql2/promise'; 
import updaterPkg from "electron-updater";
const { autoUpdater } = updaterPkg;
import { getSecret } from './src/utils/keytarHelper.js'; 

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPLIED_EMAILS_FILE = findFile('repliedEmails.json');
const GENERATED_REPLIES_FILE = findFile('GeneratedReplies.json');
const CACHED_EMAILS_FILE = findFile('cached_emails.json');

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

function encodeRFC2047Name(name) {
  // Csak akkor kódoljuk, ha van nem-ASCII karakter
  if (/[^ -~]/.test(name)) {
    return `=?UTF-8?B?${Buffer.from(name, 'utf-8').toString('base64')}?=`;
  }
  return name;
}

function formatAddress(address) {
  const match = address.match(/^(.*)<(.+@.+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, '');
    const email = match[2].trim();
    return `"${encodeRFC2047Name(name)}" <${email}>`;
  }
  return address;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Hiba a konfiguráció mentésekor:', err);
  }
}

let config = readConfig();

const openKey = await getSecret('OpenAPIKey');
if (!openKey) {
  throw new Error('OpenAPIKey nincs beállítva Keytarban!');
}

const openai = new OpenAI({
  apiKey: openKey
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
// Check whether the demo/trial period is over.
// If a licence is supplied and a DATABASE_URL is configured, consult the database
// for the user's `trialEndDate` and `remainingGenerations`. If either condition
// indicates expiry, return true. Otherwise fall back to the local sent emails log.
async function isDemoOver(licence = null) {
  try {
    // Try DB-based checks first when possible
    try {
      const dbUrl = await getSecret('DATABASE_URL');
      if (dbUrl && licence) {
        const connection = await mysql.createConnection(dbUrl);
        const [rows] = await connection.execute('SELECT trialEndDate, remainingGenerations FROM user WHERE licence = ? LIMIT 1', [licence]);
        await connection.end();
        if (Array.isArray(rows) && rows.length > 0) {
          const row = rows[0];
          let dbSaysOver = false;
          // Check remainingGenerations
          if (typeof row.remainingGenerations !== 'undefined' && row.remainingGenerations !== null) {
            const remaining = Number(row.remainingGenerations);
            if (!Number.isNaN(remaining) && remaining <= 0) {
              dbSaysOver = true;
            }
          }
          // Check trialEndDate (format: "YYYY-MM-DD HH:MM:SS")
          if (!dbSaysOver && row.trialEndDate) {
            // Replace space with 'T' so Date can parse as local/ISO
            const normalized = row.trialEndDate.replace(' ', 'T');
            const trialDate = new Date(normalized);
            if (!isNaN(trialDate.getTime())) {
              const now = new Date();
              if (trialDate <= now) {
                dbSaysOver = true;
              }
            }
          }
          // If DB has a definitive row, use DB result OR the sent emails log (both considered)
          if (dbSaysOver) return true;
          // else fall through to the sent-emails log check below
        }
      }
    } catch (dbErr) {
      // If DB check fails, log and fall back to file-based check below
      console.error('[isDemoOver] DB check failed, falling back to local log check:', dbErr);
    }

    // Fallback: existing behavior - check sent emails log count
    const log = readSentEmailsLog();
    return Array.isArray(log) && log.length >= 100;
  } catch (e) {
    console.error('[isDemoOver] Unexpected error:', e);
    return false;
  }
}

ipcMain.handle('get-licence-from-localstorage', async (event, licence) => {
  return licence || '';
});

async function setTrialEndedForLicence(licence) {
  try {
    const dbUrl = await getSecret('DATABASE_URL'); // Az adatbázis URL-t Keytarból olvassuk
    if (!dbUrl) {
      throw new Error('DATABASE_URL nincs beállítva Keytarban!');
    }

    const connection = await mysql.createConnection(dbUrl); // URL alapú csatlakozás
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
  // Try to obtain licence from renderer localStorage so we can consult the DB
  let licence = null;
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      licence = await win.webContents.executeJavaScript('localStorage.getItem("licence")');
    }
  } catch (e) {
    console.error('[is-demo-over] Could not read licence from renderer localStorage:', e);
  }

  const demoOver = await isDemoOver(licence);
  if (demoOver) {
    try {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        console.log('[DEMO OVER] Licence:', licence); // LOG
        if (licence) {
          const result = await setTrialEndedForLicence(licence);
          console.log('[DEMO OVER] setTrialEndedForLicence result:', result); // LOG
        } else {
          console.log('[DEMO OVER] Licence kulcs nem található a localStorage-ben!');
        }
      }
    } catch (e) {
      console.error('[is-demo-over] Error while handling demo-over cleanup:', e);
    }
    try {
      // localStorage here refers to the main process global (not renderer). Try to remove if present in a safe way.
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.removeItem('isLicenced');
        localStorage.removeItem('licence');
      }
    } catch (e) {
      // ignore
    }
  }
  return demoOver;
});

// Return trial status (trialEndDate, remainingGenerations) for the current licence.
ipcMain.handle('get-trial-status', async (event) => {
  let licence = null;
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      licence = await win.webContents.executeJavaScript('localStorage.getItem("licence")');
    }
  } catch (e) {
    console.error('[get-trial-status] Could not read licence from renderer localStorage:', e);
  }

  try {
    const dbUrl = await getSecret('DATABASE_URL');
    if (dbUrl && licence) {
      const connection = await mysql.createConnection(dbUrl);
      const [rows] = await connection.execute('SELECT trialEndDate, remainingGenerations FROM user WHERE licence = ? LIMIT 1', [licence]);
      await connection.end();
      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0];
        return {
          trialEndDate: row.trialEndDate || null,
          remainingGenerations: typeof row.remainingGenerations !== 'undefined' && row.remainingGenerations !== null ? Number(row.remainingGenerations) : null,
          licence: licence
        };
      }
    }
  } catch (err) {
    console.error('[get-trial-status] DB error:', err);
  }

  // Fallback: return nulls and provide sent log count so renderer can decide
  try {
    const log = readSentEmailsLog();
    return {
      trialEndDate: null,
      remainingGenerations: null,
      licence: licence,
      sentEmailsCount: Array.isArray(log) ? log.length : 0
    };
  } catch (err) {
    return { trialEndDate: null, remainingGenerations: null, licence: licence };
  }
});

// API kulcs kezelése
ipcMain.handle('setApiKey', async (event, apiKey) => {
  config.OPENAI_API_KEY = apiKey;
  saveConfig(config);
  openai.apiKey = apiKey;
  return true;
});

ipcMain.handle('getApiKey', async () => {
  const apiKey = await getSecret('OpenAPIKey');
  if (!apiKey) {
    throw new Error('OpenAPI kulcs nincs beállítva Keytarban!');
  }
  return apiKey;
});

// Add to settings defaults
const defaultSettings = {
  autoSend: false,
  halfAuto: false,
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
let halfAutoSend = settings.halfAuto || false;

ipcMain.handle("getAutoSend", async () => {
  return autoSend;
});

ipcMain.handle("getHalfAutoSend", async () => {
  return halfAutoSend;
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
  let emails = [];

  if (authState.provider === 'smtp') {
    console.log('Fetching emails using SMTP provider...');
    emails = await smtpHandler.getUnreadEmails();
  } else if (authState.provider === 'gmail') {
    console.log('Fetching emails using Gmail provider...');
    emails = await getUnreadEmails();
  } else {
    console.error('Invalid email provider configured:', authState.provider);
    return []; // Return an empty array if no valid provider is configured
  }

  // Log the number of emails fetched
  console.log(`Fetched ${emails.length} emails from ${authState.provider} provider.`);

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

  //console.log('Emails after date filtering:', emails.map(email => ({ id: email.id, subject: email.subject })));
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
  // Use a regular interval to trigger checks, but the heavy work is in checkEmailsOnce
  emailMonitoringInterval = setInterval(async () => {
    try {
      await checkEmailsOnce();
    } catch (err) {
      console.error('Error in scheduled email check:', err);
    }
  }, 5000);
}

let emailCheckInProgress = false;
async function checkEmailsOnce() {
  // Avoid overlapping runs
  if (emailCheckInProgress) return;
  emailCheckInProgress = true;
  try {
    // --- INTERNET CHECK: skip if offline ---
    const hasInternet = await checkInternetConnection();
    if (!hasInternet) {
      console.log('No internet connection, skipping email check.');
      BrowserWindow.getAllWindows().forEach(window => window.webContents.send('no-internet-connection'));
      return;
    } else {
      BrowserWindow.getAllWindows().forEach(window => window.webContents.send('internet-connection-restored'));
    }

    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    console.log('Checking emails at:', currentTimeString);

    // --- SPAM + IGNORED szűrés ---
    const spamKeywords = ['hirlevel', 'no-reply','noreply','no reply','spam', 'junk', 'promóció', 'reklám', 'ad', 'free money', "guaranteed", "amazing deal", "act now", "limited time", "click here", "buy now"];
    let unreadEmails = await getEmailsBasedOnProvider();
    const ignoredEmailsList = (settings.ignoredEmails || []).map(e => e.trim().toLowerCase()).filter(Boolean);
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const spamRegexes = spamKeywords.map(k => new RegExp(`\\b${escapeRegExp(k)}\\b`, 'i'));

    const beforeCount = unreadEmails.length;
    const filteredOut = [];
    unreadEmails = unreadEmails.filter(email => {
      const subject = (email.subject || '').toLowerCase();
      const from = (email.from || '').toLowerCase();

      if (email.labelIds && Array.isArray(email.labelIds) && email.labelIds.includes('SPAM')) {
        filteredOut.push({ id: email.id, reason: 'label SPAM', subject: email.subject, from: email.from });
        return false;
      }
      const matchedSpam = spamRegexes.find(rx => rx.test(email.subject || '') || rx.test(email.from || ''));
      if (matchedSpam) {
        filteredOut.push({ id: email.id, reason: 'spamKeyword', matched: matchedSpam.source, subject: email.subject, from: email.from });
        return false;
      }
      const matchedIgnored = ignoredEmailsList.find(ignored => from.includes(ignored));
      if (matchedIgnored) {
        filteredOut.push({ id: email.id, reason: 'ignoredEmail', matchedIgnored, subject: email.subject, from: email.from });
        return false;
      }
      return true;
    });

    console.log('Fetched emails (spam+ignored szűrve):', unreadEmails.length, `(before: ${beforeCount})`);
    //if (filteredOut.length) console.log('Filtered out emails (with reasons):', filteredOut);

    // Persist filtered unread emails to cache so renderer views can read from disk
    try { saveCachedEmails(unreadEmails); } catch (err) { console.error('Failed to save cached emails:', err); }
    BrowserWindow.getAllWindows().forEach(window => window.webContents.send('emails-updated', unreadEmails));

    // Handle auto replies (re-using existing logic)
    if (settings.autoSend && currentTimeString >= settings.autoSendStartTime && currentTimeString <= settings.autoSendEndTime && unreadEmails && unreadEmails.length > 0) {
      console.log(`Processing ${unreadEmails.length} emails for auto-reply`);
      for (const email of unreadEmails) {
        try {
          const subjectLower = (email.subject || '').toLowerCase();
          const fromLower = (email.from || '').toLowerCase();
          if (subjectLower.includes('noreply') || fromLower.includes('noreply') || subjectLower.includes('no reply') || fromLower.includes('no reply') || subjectLower.includes('no-reply') || fromLower.includes('no-reply')) {
            console.log('Skipping noreply email:', email.id, email.subject, email.from);
            continue;
          }
          if (!repliedEmailIds.includes(email.id) && !replyInProgressIds.includes(email.id)) {
            replyInProgressIds.push(email.id);
            console.log('Processing email for reply:', email.id, email.subject);
            let fullEmail;
            try { fullEmail = await getEmailByIdBasedOnProvider(email.id); } catch (err) {
              console.error('getEmailById error:', err);
              replyInProgressIds = replyInProgressIds.filter(id => id !== email.id);
              continue;
            }
            let generatedReply;
            try { generatedReply = await generateReply(fullEmail); } catch (err) { console.error('generateReply error:', err); replyInProgressIds = replyInProgressIds.filter(id => id !== email.id); continue; }
            let replyResult;
            try {
              if (authState.provider === 'smtp' && smtpHandler) {
                const toAddress = extractEmailAddress(fullEmail.from);
                if (!toAddress) { console.error('Nem sikerült email címet kinyerni a from mezőből:', fullEmail.from); replyInProgressIds = replyInProgressIds.filter(id => id !== email.id); continue; }
                replyResult = await sendReply({ to: toAddress, subject: `${fullEmail.subject}`, body: generatedReply, emailId: fullEmail.id, originalEmail: { to: fullEmail.from || 'Ismeretlen feladó', subject: fullEmail.subject, body: fullEmail.body } });
              } else if (authState.provider === 'gmail') {
                replyResult = await sendReply({ to: fullEmail.from, subject: `${fullEmail.subject}`, body: generatedReply, emailId: fullEmail.id, originalEmail: { to: fullEmail.from || 'Ismeretlen feladó', subject: fullEmail.subject, body: fullEmail.body } });
              }
            } catch (err) { console.error('sendReply error:', err); replyInProgressIds = replyInProgressIds.filter(id => id !== email.id); continue; }

            if ((replyResult && replyResult.success) || (replyResult && replyResult.id)) {
              let markedAsRead = false;
              try {
                if (authState.provider === 'smtp' && smtpHandler) {
                  await smtpHandler.markAsRead(email.id);
                  markedAsRead = true;
                } else if (authState.provider === 'gmail') {
                  const auth = await authorize();
                  const gmail = google.gmail({ version: 'v1', auth });
                  await gmail.users.messages.modify({ userId: 'me', id: email.id, requestBody: { removeLabelIds: ['UNREAD'] } });
                  markedAsRead = true;
                }
              } catch (err) { console.error('Error marking email as read:', err); }

              if (markedAsRead) {
                repliedEmailIds.push(email.id);
                saveRepliedEmails(repliedEmailIds);
                try { removeEmailFromCache(email.id); } catch (err) { console.error('Failed to remove email from cache after auto-reply:', err); }
                console.log('Reply sent and email marked as read for:', email.id);
              }
            }
            replyInProgressIds = replyInProgressIds.filter(id => id !== email.id);
          }
        } catch (err) { console.error('Error processing email for auto-reply:', err); }
      }
    }
  } finally {
    emailCheckInProgress = false;
  }
}

function stopEmailMonitoring() {
  if (emailMonitoringInterval) {
    clearInterval(emailMonitoringInterval);
    emailMonitoringInterval = null;
  }
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
ipcMain.handle("setHalfAutoSend", async (event, value) => {
  halfAutoSend = value;
  settings.halfAuto = value;
  saveSettings(settings);
  // Always start monitoring (it will just skip auto-reply if halfAuto is false)
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

ipcMain.handle('getFromDate', async () => {
  return settings.fromDate || "";
});

ipcMain.handle('setFromDate', async (event, dateStr) => {
  settings.fromDate = dateStr;
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

function readGeneratedReplies() {
  try {
    if (fs.existsSync(GENERATED_REPLIES_FILE)) {
      const data = fs.readFileSync(GENERATED_REPLIES_FILE, 'utf-8');
      return JSON.parse(data);
    }
    return {};
  } catch (err) {
    console.error('Hiba a generated_replies.json beolvasásakor:', err);
    return {};
  }
}

function saveGeneratedReplies(replies) {
  try {
    fs.writeFileSync(GENERATED_REPLIES_FILE, JSON.stringify(replies, null, 2), 'utf-8');
  } catch (err) {
    console.error('Hiba a generated_replies.json mentésekor:', err);
  }
}

// Cached emails helpers: the monitoring loop will write the filtered unread emails
function readCachedEmails() {
  try {
    if (fs.existsSync(CACHED_EMAILS_FILE)) {
      const data = fs.readFileSync(CACHED_EMAILS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Hiba a cached_emails.json beolvasásakor:', err);
  }
  return [];
}

function saveCachedEmails(emails) {
  try {
    fs.writeFileSync(CACHED_EMAILS_FILE, JSON.stringify(Array.isArray(emails) ? emails : [], null, 2), 'utf-8');
  } catch (err) {
    console.error('Hiba a cached_emails.json mentésekor:', err);
  }
}

function removeEmailFromCache(emailId) {
  try {
    const emails = readCachedEmails();
    const filtered = emails.filter(e => e.id !== emailId);
    saveCachedEmails(filtered);
    // Notify renderer of update
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('emails-updated', filtered);
    });
  } catch (err) {
    console.error('Hiba a cached_emails.json frissítésekor:', err);
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
    // Accept either raw content or an object: { content, originalPath }
    let contentBuffer = null;
    let originalPath = null;
    if (fileContent && typeof fileContent === 'object' && (fileContent.content || fileContent.originalPath)) {
      if (fileContent.content) contentBuffer = Buffer.from(fileContent.content);
      if (fileContent.originalPath) originalPath = fileContent.originalPath;
    } else {
      contentBuffer = Buffer.from(fileContent);
    }

    // Always save uploads to the userData folder as 'adatok.xlsx' (overwrite existing)
    const userDataDir = app.getPath('userData');
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    const targetPath = path.join(userDataDir, 'adatok.xlsx');

    // Write the file content to disk (overwrite)
    fs.writeFileSync(targetPath, contentBuffer);

    // Verify the written file is a readable workbook
    const workbook = XLSX.readFile(targetPath);
    if (!workbook.SheetNames || !workbook.SheetNames.length) {
      // Remove the invalid file
      try { fs.unlinkSync(targetPath); } catch (e) {}
      throw new Error('Az Excel fájl üres vagy nem olvasható!');
    }

    // Determine the original filename (base name) if provided
    let filename = null;
    try {
      if (originalPath) filename = path.basename(originalPath);
    } catch (e) {
      filename = null;
    }

    // Return success, absolute path and original filename (if known)
    return { success: true, path: targetPath, filename };
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
      return { success: true, content: content, filePath };
    } catch (error) {
      console.error('Hiba a fájl olvasásakor:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'No file selected' };
});

// Show directory picker to select a folder for import
ipcMain.handle('show-directory-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, dirPath: result.filePaths[0] };
  }
  return { success: false, error: 'No directory selected' };
});

// Import a folder recursively, extract text from supported files and generate embeddings
ipcMain.handle('import-folder-embeddings', async (event, { dirPath, model = 'text-embedding-3-small', maxChunkChars = 3000 } = {}) => {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) {
      return { success: false, error: 'Directory does not exist' };
    }

    const supported = new Set(['.txt', '.csv', '.xlsx', '.xls']);

    // Walk directory recursively
    const walk = (dir) => {
      let results = [];
      const list = fs.readdirSync(dir, { withFileTypes: true });
      for (const dirent of list) {
        const full = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          results = results.concat(walk(full));
        } else if (dirent.isFile()) {
          const ext = path.extname(dirent.name).toLowerCase();
          if (supported.has(ext)) results.push(full);
        }
      }
      return results;
    };

    const files = walk(dirPath);
    const totalFiles = files.length;

    const embeddingsOut = [];

    // dynamic import for xlsx library (handle default export vs namespace)
    let XLSX = null;
    try {
      const mod = await import('xlsx');
      XLSX = mod && (mod.default || mod);
    } catch (e) {
      try {
        const mod = require('xlsx');
        XLSX = mod && (mod.default || mod);
      } catch (e2) {
        XLSX = null;
      }
    }
    if (!XLSX) {
      console.warn('[import-folder-embeddings] xlsx library not available; .xlsx files will be skipped');
    }

    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      const ext = path.extname(file).toLowerCase();
      let text = '';

      try {
        if (ext === '.txt' || ext === '.csv') {
          text = fs.readFileSync(file, 'utf8');
        } else if ((ext === '.xlsx' || ext === '.xls') && XLSX) {
          try {
            // ensure readFile exists (some bundlers expose under default)
            const reader = typeof XLSX.readFile === 'function' ? XLSX : (XLSX.default || XLSX);
            if (typeof reader.readFile !== 'function') {
              throw new Error('XLSX.readFile is not available');
            }
            const wb = reader.readFile(file);
            for (const sname of wb.SheetNames) {
              const csv = (XLSX.utils && XLSX.utils.sheet_to_csv)
                ? XLSX.utils.sheet_to_csv(wb.Sheets[sname])
                : (reader.utils && reader.utils.sheet_to_csv)
                  ? reader.utils.sheet_to_csv(wb.Sheets[sname])
                  : '';
              text += '\n' + csv;
            }
          } catch (e) {
            console.error('[import-folder-embeddings] xlsx read error for', file, e);
            BrowserWindow.getAllWindows().forEach(w => w.webContents.send('import-progress', { file, index: fi + 1, totalFiles, status: 'error', error: e?.message || String(e) }));
          }
        } else {
          // unsupported or no parser - skip
        }
      } catch (readErr) {
        console.error('[import-folder-embeddings] read error for', file, readErr);
      }

      text = (text || '').toString().trim();
      if (!text) {
        // notify progress: skipped
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('import-progress', { file, index: fi + 1, totalFiles, status: 'skipped', reason: 'empty' }));
        continue;
      }

      // chunk text to avoid very large embedding inputs
      const chunks = [];
      for (let i = 0; i < text.length; i += maxChunkChars) {
        chunks.push(text.slice(i, i + maxChunkChars));
      }

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        try {
          BrowserWindow.getAllWindows().forEach(w => w.webContents.send('import-progress', { file, index: fi + 1, totalFiles, chunkIndex: ci + 1, totalChunks: chunks.length, status: 'embedding' }));
          const resp = await openai.embeddings.create({ model, input: chunk });
          const emb = resp?.data && resp.data[0] && resp.data[0].embedding ? resp.data[0].embedding : null;
          embeddingsOut.push({ id: `${fi}-${ci}`, file, chunkIndex: ci, textSnippet: chunk.slice(0, 200), embedding: emb });
        } catch (embErr) {
          console.error('[import-folder-embeddings] embedding error for', file, embErr);
          BrowserWindow.getAllWindows().forEach(w => w.webContents.send('import-progress', { file, index: fi + 1, totalFiles, chunkIndex: ci + 1, totalChunks: chunks.length, status: 'error', error: embErr?.message || String(embErr) }));
        }
      }

      // file done
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('import-progress', { file, index: fi + 1, totalFiles, status: 'done' }));
    }

    // save embeddings to userData
    const embeddingsPath = path.join(app.getPath('userData'), 'embeddings.json');
    try {
      fs.writeFileSync(embeddingsPath, JSON.stringify(embeddingsOut, null, 2), 'utf8');
    } catch (writeErr) {
      console.error('[import-folder-embeddings] write embeddings error', writeErr);
      return { success: false, error: 'Failed to save embeddings: ' + writeErr.message };
    }

    return { success: true, embeddingsPath, count: embeddingsOut.length };
  } catch (err) {
    console.error('[import-folder-embeddings] unexpected', err);
    return { success: false, error: err?.message || String(err) };
  }
});
//Értesítések
ipcMain.handle("getNotifyOnAutoReply", async () => {
  return settings.notifyOnAutoReply || false;
});

ipcMain.handle("setNotifyOnAutoReply", async (event, value) => {
  settings.notifyOnAutoReply = value;
  saveSettings(settings);
  return true;
});

ipcMain.handle("getNotificationEmail", async () => {
  return settings.notificationEmail || "";
});

ipcMain.handle("setNotificationEmail", async (event, email) => {
  settings.notificationEmail = email;
  saveSettings(settings);
  return true;
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
      const filename = filePath ? filePath.split(/[/\\\\]/).pop() : null;
      return { success: true, content: content, filePath, filename };
    } catch (error) {
      console.error('Hiba a fájl olvasásakor:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'No file selected' };
});

// Excel helpers for renderer: check if adatok.xlsx exists, read and save
ipcMain.handle('excel-exists', async () => {
  try {
    // Prefer the userData copy if present (that's where uploads are written)
    const userDataExcel = path.join(app.getPath('userData'), 'adatok.xlsx');
    if (fs.existsSync(userDataExcel)) return true;

    // Fallback to searching common locations (packaged/dev)
    try {
      const excelFile = findFile('adatok.xlsx');
      return fs.existsSync(excelFile);
    } catch (e) {
      return false;
    }
  } catch (e) {
    console.error('excel-exists error', e);
    return false;
  }
});

// Return the absolute path to the current adatok.xlsx if it exists, otherwise null
ipcMain.handle('get-excel-path', async () => {
  try {
    // Prefer the copy in userData (uploads are saved here)
    const userDataExcel = path.join(app.getPath('userData'), 'adatok.xlsx');
    if (fs.existsSync(userDataExcel)) return userDataExcel;

    // Fallback to searching common locations
    try {
      const excelFile = findFile('adatok.xlsx');
      return fs.existsSync(excelFile) ? excelFile : null;
    } catch (e) {
      return null;
    }
  } catch (e) {
    return null;
  }
});

ipcMain.handle('read-excel-file', async () => {
  try {
    // Prefer the userData copy
    let excelFile = path.join(app.getPath('userData'), 'adatok.xlsx');
    if (!fs.existsSync(excelFile)) {
      try {
        excelFile = findFile('adatok.xlsx');
      } catch (e) {
        return { success: false, error: 'No file' };
      }
    }

    // Use XLSX to read quickly into arrays
    const workbook = XLSX.readFile(excelFile, { cellDates: true });
    const sheets = workbook.SheetNames.map((name) => {
      const ws = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      return { name, data };
    });
    return { success: true, sheets };
  } catch (error) {
    console.error('read-excel-file error', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-excel-file', async (event, payload) => {
  try {
    if (!payload || !Array.isArray(payload.sheets)) throw new Error('Invalid payload');
    const workbook = new ExcelJS.Workbook();
    for (const sheet of payload.sheets) {
      const ws = workbook.addWorksheet(sheet.name || 'Sheet');
      // sheet.data expected as array of arrays
      (sheet.data || []).forEach((row) => {
        ws.addRow(row);
      });
    }
    // Always write the saved workbook to the userData folder so the renderer
    // reading logic (which prefers the userData copy) sees the updated file.
    const userDataDir = app.getPath('userData');
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    const targetPath = path.join(userDataDir, 'adatok.xlsx');
    await workbook.xlsx.writeFile(targetPath);
    return { success: true };
  } catch (error) {
    console.error('save-excel-file error', error);
    return { success: false, error: error.message };
  }
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
// Ipc handlers for web settings
ipcMain.handle('getWebSettings', async () => {
  return {
    webUrls: settings.webUrls || defaultSettings.webUrls
  };
});
ipcMain.handle('saveWebSettings', async (event, { webUrls }) => {
  settings.webUrls = Array.isArray(webUrls) ? webUrls : [];
  saveSettings(settings);
  return true;
});

// Fetch data from the web URL

// Refactor promptBase and generateReply
// Added {embeddingsContext} placeholder so we can inject nearest-file snippets from the imported embeddings
let promptBase = `Egy ügyféltől a következő email érkezett:\n\n{greeting}\n\n"{email.body}"\n\n{imageDescriptions}\n\n{excelImageDescriptions}\n\nA következő adatokat használd fel a válaszadáshoz:\n{excelData}\n\n{signature}\n\n{webUrls}\n{embeddingsContext}\nEzekről a htmlek-ről is gyűjtsd ki a szükséges információkat a válaszadáshoz: {webUrls}, gyűjts ki a szükséges információkat, linkeket, telefonszámokat, email címeket és így tovább és ezeket küldd vissza.\n\n`;

async function generateReply(email) {
  try {
    // Ensure we have full email body: always try to fetch the full email by id when available.
    // This guarantees that if the renderer passed only a snippet or cached record, we still
    // retrieve the complete body (and any OCR/aiImageResponses) before generating a reply.
    try {
      if (email && email.id) {
        try {
          const full = await getEmailByIdBasedOnProvider(email.id);
          if (full) {
            if (full.body) email.body = full.body;
            if (full.aiImageResponses) email.aiImageResponses = full.aiImageResponses;
            // prefer richer fields if available
            if (full.subject) email.subject = full.subject;
            if (full.from) email.from = full.from;
          }
        } catch (e) {
          console.warn('[generateReply] could not fetch full email by id, proceeding with provided email', e);
        }
      }
    } catch (e) {
      console.warn('[generateReply] pre-fetch full email guard failed', e);
    }

    try {
      const dbUrl = await getSecret('DATABASE_URL');
      if (dbUrl) {
        // Determine current user email: prefer activationEmail (set on licence activation),
        // then authState stored email, then smtpHandler config email as fallback.
        let userEmail = null;
        try {
          if (typeof activationEmail !== 'undefined' && activationEmail) {
            userEmail = activationEmail;
          } else if (authState && authState.credentials && authState.credentials.email) {
            userEmail = authState.credentials.email;
          } else if (smtpHandler && smtpHandler.config && smtpHandler.config.email) {
            userEmail = smtpHandler.config.email;
          }
        } catch (e) {
          // In the unlikely event activationEmail is not accessible, fallback silently
          if (authState && authState.credentials && authState.credentials.email) {
            userEmail = authState.credentials.email;
          } else if (smtpHandler && smtpHandler.config && smtpHandler.config.email) {
            userEmail = smtpHandler.config.email;
          }
        }
        if (userEmail) {
          try {
            const connection = await mysql.createConnection(dbUrl);
            // Ensure we don't go below zero
            await connection.execute(
              'UPDATE user SET remainingGenerations = GREATEST(0, remainingGenerations - 1) WHERE email = ?',
              [userEmail]
            );
            await connection.end();
            console.log('[generateReply] Decremented remainingGenerations for', userEmail);
          } catch (dbErr) {
            console.error('[generateReply] DB update error:', dbErr);
          }
        } else {
          console.log('[generateReply] No authenticated user email found; skipping remainingGenerations decrement.');
        }
      } else {
        console.log('[generateReply] DATABASE_URL not set; skipping remainingGenerations decrement.');
      }
    } catch (err) {
      console.error('[generateReply] Error while attempting to decrement remainingGenerations:', err);
    }
    let htmlContents = [];

    if (settings.webUrls && Array.isArray(settings.webUrls)) {
      for (const url of settings.webUrls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const html = await response.text();
            htmlContents.push(html);
          } else {
            console.error(`Failed to fetch web URL (${url}): ${response.statusText}`);
          }
        } catch (error) {
          console.error(`Error fetching web URL (${url}):`, error);
        }
      }
    }

    const combinedHtml = htmlContents.join('\n\n');

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

    // Safety: trim very large inputs to avoid exceeding model context limits.
    // We use character-based truncation as a cheap approximation (1 token ~ ~4 chars).
    function safeTrim(text, maxChars) {
      if (!text) return '';
      if (typeof text !== 'string') text = String(text);
      if (text.length <= maxChars) return text;
      return text.slice(0, maxChars) + '\n\n[...további tartalom levágva...]';
    }

    const SAFE_HTML_MAX_CHARS = 20000; // ~5k tokens upper-bound approximation
    const SAFE_EXCEL_MAX_CHARS = 8000;
    const SAFE_IMAGE_DESC_MAX_CHARS = 3000;

    const safeCombinedHtml = safeTrim(combinedHtml || '', SAFE_HTML_MAX_CHARS);
    const safeFormattedExcelData = safeTrim(formattedExcelData || '', SAFE_EXCEL_MAX_CHARS);
    const safeImageDescriptions = safeTrim(imageDescriptions || '', SAFE_IMAGE_DESC_MAX_CHARS);
    const safeExcelImageDescriptions = safeTrim(excelImageDescriptions || '', SAFE_IMAGE_DESC_MAX_CHARS);

    // Helper: extract probable license/identifier codes from text (simple heuristic)
    function extractCodesFromText(text) {
      if (!text) return [];
      try {
        // Look for alphanumeric sequences of length 6-20 (common licence keys), allow hyphens
        const re = /\b[A-Z0-9][-A-Z0-9]{4,19}\b/gi;
        const matches = (String(text).match(re) || []).map(m => m.replace(/[^A-Z0-9-]/gi, '').trim()).filter(Boolean);
        return Array.from(new Set(matches));
      } catch (e) {
        return [];
      }
    }

    // Build embeddings-based context: combine (A) existing embeddings.json knowledge base
    // and (B) the most similar snippets from the user's recent emails (last 50 loaded from mailbox).
    // This block computes the embedding for the incoming email once and reuses it.
    let embeddingsContext = '';
    try {
      const modelForEmb = 'text-embedding-3-small';

      // compute embedding for the incoming email (used as query)
      let emailEmb = null;
      try {
        const embResp = await openai.embeddings.create({ model: modelForEmb, input: String(email.body || email.subject || '') });
        emailEmb = embResp?.data?.[0]?.embedding || null;
      } catch (e) {
        console.error('[generateReply] failed to compute embedding for incoming email', e);
      }

      const cosine = (a, b) => {
        if (!a || !b || a.length !== b.length) return 0;
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
          dot += (a[i] || 0) * (b[i] || 0);
          na += (a[i] || 0) * (a[i] || 0);
          nb += (b[i] || 0) * (b[i] || 0);
        }
        na = Math.sqrt(na); nb = Math.sqrt(nb);
        return na && nb ? dot / (na * nb) : 0;
      };

      // (A) Lookup in stored embeddings (embeddings.json) if present
      try {
        const embeddingsFile = path.join(app.getPath('userData'), 'embeddings.json');
        if (fs.existsSync(embeddingsFile)) {
          const raw = fs.readFileSync(embeddingsFile, 'utf8');
          const stored = JSON.parse(raw || '[]');
          if (Array.isArray(stored) && stored.length > 0 && emailEmb) {
            try {
              // Score all stored items against the incoming email
              const scored = stored.map(s => ({ score: cosine(emailEmb, s.embedding || []), item: s }));
              scored.sort((a, b) => b.score - a.score);
              // Build a more informative snippet for each top item: include title/url/source/filePath and a short snippet
              const topItems = scored.slice(0, 5).filter(s => s.item);
              const fileSnippets = topItems.map(s => {
                const it = s.item || {};
                // If the stored item looks like an email, prefer From/Subject/Date/Body formatting
                if (it.subject || it.from || it.body) {
                  const from = it.from || it.author || '';
                  const subject = it.subject || '';
                  const date = it.date || it.createdAt || '';
                  const body = safeTrim(String(it.body || it.text || it.content || it.textSnippet || '').replace(/\s+/g, ' '), 1000);
                  const src = it.source || it.url || it.filePath ? ` | Source: ${it.source || it.url || it.filePath}` : '';
                  return `(${s.score.toFixed(3)}) From: ${from} | Subject: ${subject} | Date: ${date}${src}\n${body}`;
                }
                // Otherwise treat as generic document/snippet
                const title = it.title || it.name || it.source || it.url || it.filePath || 'Név nélküli forrás';
                const snippet = it.textSnippet || it.content || it.text || it.summary || '';
                const short = safeTrim(String(snippet || '').replace(/\s+/g, ' '), 800);
                const metaParts = [];
                if (it.url) metaParts.push(`URL: ${it.url}`);
                if (it.filePath) metaParts.push(`Fájl: ${it.filePath}`);
                if (it.source) metaParts.push(`Forrás: ${it.source}`);
                const meta = metaParts.length ? ` (${metaParts.join(' | ')})` : '';
                return `(${s.score.toFixed(3)}) ${title}${meta}\n${short}`;
              });
              if (fileSnippets.length) embeddingsContext += 'Releváns dokumentumok a tudásbázisból:\n' + fileSnippets.join('\n\n') + '\n\n';
            } catch (e) {
              console.error('[generateReply] embedding lookup in embeddings.json failed', e);
            }
          }
        }
      } catch (e) {
        console.error('[generateReply] failed to read embeddings.json', e);
      }

      // (B) Also compute embeddings for the user's recent mailbox emails (take latest 50)
      try {
          // Fetch recent mailbox emails for embedding context (not only unread)
          let mailboxEmails = [];
          try {
            if (authState.provider === 'smtp' && smtpHandler && typeof smtpHandler.getRecentEmails === 'function') {
              mailboxEmails = await smtpHandler.getRecentEmails(50);
            } else if (authState.provider === 'gmail') {
              mailboxEmails = await getRecentEmails(50);
            } else {
              // fallback to existing behavior (may return unread only)
              mailboxEmails = await getEmailsBasedOnProvider();
            }
          } catch (e) {
            console.error('[generateReply] failed to fetch recent mailbox emails, falling back to provider unread list', e);
            mailboxEmails = await getEmailsBasedOnProvider();
          }
        if (Array.isArray(mailboxEmails) && mailboxEmails.length > 0 && emailEmb) {
          // sort by date desc and take up to 50
          const withTs = mailboxEmails.map(m => ({
            ...m,
            _ts: m.date ? new Date(m.date).getTime() : 0
          }));
          withTs.sort((a, b) => b._ts - a._ts);
          const last50 = withTs.slice(0, 50);
          const texts = last50.map(e => {
            const subj = e.subject || '';
            const from = e.from || '';
            const body = e.body || '';
            console.log('[generateReply] preparing mailbox email for embedding:', { subj, from, date: e.date, body });
            return `Subject: ${subj}\nFrom: ${from}\nDate: ${e.date || ''}\n${body}`;
          });

          // request embeddings in batch (guard against empty inputs)
          const batchInput = texts.map(t => safeTrim(t, 2000)); // limit per-email input
          try {
            const batchResp = await openai.embeddings.create({ model: modelForEmb, input: batchInput });
            const mailEmbeddings = (batchResp && batchResp.data) ? batchResp.data.map(d => d.embedding) : [];
            const scoredMail = mailEmbeddings.map((emb, idx) => ({ score: cosine(emailEmb, emb || []), item: last50[idx] }));
            scoredMail.sort((a, b) => b.score - a.score);
            const topMail = scoredMail.slice(0, 5).filter(s => s.item).map(s => `(${s.score.toFixed(3)}) From: ${s.item.from} | Subject: ${s.item.subject}\n${safeTrim(s.item.body || '', 800)}`);
            if (topMail.length) embeddingsContext += 'Releváns korábbi emailek a postaládából:\n' + topMail.join('\n\n') + '\n\n';
          } catch (e) {
            console.error('[generateReply] failed to compute embeddings for recent mailbox emails', e);
          }
        }
      } catch (e) {
        console.error('[generateReply] mailbox embedding step failed', e);
      }

      // truncate the final embeddingsContext so we don't blow model context
      if (embeddingsContext && embeddingsContext.length > 4000) {
        embeddingsContext = embeddingsContext.slice(0, 4000) + '\n\n[...további bejegyzések levágva...]';
      }
    } catch (e) {
      console.error('[generateReply] failed to build embeddings context', e);
    }

    // Check for explicit license/identifier codes in the email body and image descriptions
    let detectedCodesSection = '';
    try {
      const codes = new Set();
      // from body
      const bodyCodes = extractCodesFromText(email.body || '');
      bodyCodes.forEach(c => codes.add(c));
      // from image descriptions (if present)
      const imgDescText = (email.aiImageResponses && Array.isArray(email.aiImageResponses))
        ? email.aiImageResponses.map(r => JSON.stringify(r)).join('\n')
        : imageDescriptions || '';
      const imgCodes = extractCodesFromText(imgDescText);
      imgCodes.forEach(c => codes.add(c));
      if (codes.size > 0) {
        const list = Array.from(codes).join(', ');
        detectedCodesSection = `
--Detected license/identifier codes found in the email (please include verbatim in the reply): ${list}\n\n`;
        console.log('[generateReply] Detected codes in email:', list);
      }
    } catch (e) {
      console.error('[generateReply] error while extracting codes from email', e);
    }

    // Debug logging to help diagnose large inputs
    try {
      console.log('[generateReply] sizes:', {
        combinedHtmlLength: (combinedHtml || '').length,
        combinedHtmlTrimmed: safeCombinedHtml.length,
        excelDataLength: (formattedExcelData || '').length,
        excelDataTrimmed: safeFormattedExcelData.length,
        imageDescLength: (imageDescriptions || '').length,
        imageDescTrimmed: safeImageDescriptions.length
      });
    } catch (e) {
      // ignore logging errors
    }

    const finalPrompt = promptBase
      .replace('{greeting}', greeting)
      .replace('{signature}', signature)
      .replace('{email.body}', email.body)
      .replace('{excelData}', safeFormattedExcelData)
      .replace('{imageDescriptions}', safeImageDescriptions)
      .replace('{excelImageDescriptions}', safeExcelImageDescriptions)
      .replace('{webUrls}', safeCombinedHtml || 'N/A')
      // prepend detected codes section to embeddingsContext so model sees them clearly
      .replace('{embeddingsContext}', (detectedCodesSection || '') + (embeddingsContext || ''));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "Te egy segítőkész asszisztens vagy, aki udvarias és professzionális válaszokat ír az ügyfeleknek. Az Excel adatokat és a megadott html-ről szerzett információkat használd fel a válaszadáshoz, ha releváns információt találsz bennük. Az adatok különböző munkalapokról származnak, mindegyiket vedd figyelembe a válaszadásnál. Elsődlegesen a html-ről származó információkat használd, ezek lehetnek linkek, email címek, telefonszámok és így tovább. FONTOS: Ha a beérkezett levél tartalmaz licensz kódot vagy bármilyen azonosítót (pl. alfanumerikus kód), másold ki és add vissza pontosan (verbatim) a válaszban. Ha a kód a csatolt képen található, próbáld meg azt is felhasználni, ha az OCR-eredmény elérhető. Ne tagadd meg az adat közlését, ha az szerepel a levélben vagy a csatolt képekből kinyert tartalomban." 
        },
        { role: "user", content: finalPrompt }
      ],
      temperature: 1,
    });
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Hiba a válasz generálásakor:', error);
    throw error;
  }
}

async function sendReply({ to, subject, body, emailId, originalEmail }) {
  try {
    console.log(`[sendReply] Küldés megkezdése: to=${to}, subject=${subject}, emailId=${emailId}`);

    let sendResult;
    const signatureText = settings.signatureText || 'AiMail';
    const signatureImage = settings.signatureImage || '';
    const watermarkImagePath = path.join(__dirname, 'src', 'images', 'watermark.png');
    const watermarkLink = 'https://okosmail.hu';
    let imageCid = 'signature';
    let watermarkCid = 'watermark';
    let htmlBody = body.replace(/\n/g, '<br>');

    

    // Add signature text
    if (signatureText) htmlBody += `<br><br>${signatureText}`;

    // Add signature image
    if (signatureImage && fs.existsSync(signatureImage)) {
      htmlBody += `<br><img src=\"cid:${imageCid}\" style=\"width:25%\">`;
    }

    // Add watermark image
    if (fs.existsSync(watermarkImagePath)) {
      htmlBody += `<br><img src=\"cid:${watermarkCid}\" style=\"width:25%\">`;
    }

    // Add original email details
    if (originalEmail) {
      htmlBody += `<br><br>--- Eredeti üzenet ---`;
      htmlBody += `<br><br><strong>Feladó:</strong> ${originalEmail.to}`;
      htmlBody += `<br><strong>Tárgy:</strong> ${originalEmail.subject}`;
      htmlBody += `<br><br><strong>Üzenet:</strong><br>${originalEmail.body.replace(/\n/g, '<br>')}`;
    }

    // --- Attachments: list all files in attachments folder ---
    const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
    let attachmentFiles = [];
    if (fs.existsSync(attachmentsDir)) {
      attachmentFiles = fs.readdirSync(attachmentsDir).filter(f => fs.statSync(path.join(attachmentsDir, f)).isFile());
    }
    const nodemailerAttachments = attachmentFiles.map(filename => ({
      filename,
      path: path.join(attachmentsDir, filename)
    }));

    // Add inline images to attachments
    if (signatureImage && fs.existsSync(signatureImage)) {
      nodemailerAttachments.push({
        filename: path.basename(signatureImage),
        path: signatureImage,
        cid: imageCid
      });
    }
    if (fs.existsSync(watermarkImagePath)) {
      nodemailerAttachments.push({
        filename: path.basename(watermarkImagePath),
        path: watermarkImagePath,
        cid: watermarkCid
      });
    }

    // --- Gmail ---
    let boundary = '----=_Part_' + Math.random().toString(36).slice(2);
    let mimeMsg = '';
    let encodedSubject = `=?UTF-8?B?${Buffer.from(subject || 'Válasz', 'utf-8').toString('base64')}?=`;
    mimeMsg += `To: ${formatAddress(to)}\r\n`;
    mimeMsg += `Subject: ${encodedSubject}\r\n`;
    mimeMsg += `MIME-Version: 1.0\r\n`;
    mimeMsg += `Content-Type: multipart/related; boundary=\"${boundary}\"\r\n`;

    // --- HTML part ---
    mimeMsg += `\r\n--${boundary}\r\n`;
    mimeMsg += `Content-Type: text/html; charset=\"UTF-8\"\r\n`;
    mimeMsg += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    mimeMsg += `<html><body>${htmlBody}</body></html>\r\n`;

    // Attachments (as regular attachments)
    for (const attachment of nodemailerAttachments) {
      const fileData = fs.readFileSync(attachment.path);
      const mimeType = attachment.cid ? 'image/png' : 'application/octet-stream';
      mimeMsg += `\r\n--${boundary}\r\n`;
      mimeMsg += `Content-Type: ${mimeType}\r\n`;
      mimeMsg += `Content-Transfer-Encoding: base64\r\n`;
      mimeMsg += `Content-Disposition: ${attachment.cid ? 'inline' : 'attachment'}; filename=\"${attachment.filename}\"\r\n`;
      if (attachment.cid) mimeMsg += `Content-ID: <${attachment.cid}>\r\n`;
      mimeMsg += `\r\n${fileData.toString('base64').replace(/(.{76})/g, '$1\r\n')}\r\n`;
    }

    mimeMsg += `--${boundary}--`;

    const encodedMessage = Buffer.from(mimeMsg)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    if (authState.provider === 'smtp') {

      await smtpHandler.connect();

      const mailOptions = {
        to,
        subject,
        body: htmlBody,
        html: htmlBody,
        attachments: nodemailerAttachments,
      };

      const result = await smtpHandler.sendEmail(mailOptions);
      if (result.success) {
        sendResult = { success: true };
        console.log(`[sendReply] SMTP küldés sikeres.`);
      } else {
        throw new Error(result.error || 'SMTP küldési hiba.');
      }
    } else if (authState.provider === 'gmail') {
      const auth = await authorize();
      const gmail = google.gmail({ version: 'v1', auth });
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });
      sendResult = { success: true };
      console.log(`[sendReply] Gmail küldés sikeres.`);
    }
    // --- LOG SENT EMAIL ---
    appendSentEmailLog({
      id: emailId || null,
      to,
      subject,
      date: new Date().toISOString(),
      body: body,
      signatureText: signatureText,
      signatureImage: signatureImage,
    });
    return sendResult;
  } catch (error) {
    console.error(`[sendReply] Hiba az email küldése során: ${error.message}`);
    throw error;
  }
}

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('get-unread-emails', async () => {
  try {
    // Return cached emails if available so renderer can read quickly
    const cached = readCachedEmails();
    if (cached && Array.isArray(cached) && cached.length > 0) {
      console.log('Returning cached unread emails:', cached.length);
      return cached;
    }
    // Fallback: fetch live based on provider and cache result
    if (authState.provider === 'gmail' || authState.provider === 'smtp') {
      console.log('No cache found, fetching emails live for provider:', authState.provider);
      const emails = await getEmailsBasedOnProvider();
      // Apply same filtering as monitoring loop to be consistent
      // (we rely on startEmailMonitoring normally to populate cache)
      saveCachedEmails(emails);
      return emails;
    }
  } catch (error) {
    console.error('Hiba az emailek lekérésekor:', error);
    throw error;
  }
});

ipcMain.handle('exit-app', () => {
  app.quit();
});

ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.exit(0);
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
      // Remove from cache so renderer no longer shows it
      try {
        removeEmailFromCache(emailId);
      } catch (err) {
        console.error('Failed to remove email from cache after send-reply:', err);
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
    // Save the authenticated email to the database
    
      const dbUrl = await getSecret('DATABASE_URL');
      if (!dbUrl) {
        throw new Error('DATABASE_URL nincs beállítva Keytarban!');
      }

    const emailInUse = activationEmail || null;
    const connection = await mysql.createConnection(dbUrl); // URL alapú csatlakozás
    const [result] = await connection.execute(
      'UPDATE user SET emailInUse = ? WHERE email = ?;',
      [email, emailInUse]
    );
    console.log("Email címek az adatbézisban frissítve:", email, emailInUse); 
    console.log('[SQL] UPDATE result:', result); // LOG
    await connection.end();

  } catch (error) {
    console.error('Gmail bejelentkezési hiba:', error);
    return false;
  }
  return true;

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
    // Register callback so IMAP 'mail' events trigger an immediate check
    try {
      smtpHandler.setOnMailCallback(() => {
        // trigger a background check without awaiting
        checkEmailsOnce().catch(err => console.error('Error in onMail triggered check:', err));
      });
    } catch (e) {
      console.warn('Could not set onMail callback on smtpHandler:', e);
    }
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

        const dbUrl = await getSecret('DATABASE_URL');
        if (!dbUrl) {
          throw new Error('DATABASE_URL nincs beállítva Keytarban!');
        }

      const emailInUse = activationEmail || null;
      const connection = await mysql.createConnection(dbUrl); // URL alapú csatlakozás
      const [result] = await connection.execute(
        'UPDATE user SET emailInUse = ? WHERE email = ?;',
        [config.email, emailInUse]
      );
      console.log('[SQL] UPDATE result:', result); // LOG
      await connection.end();

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

    // Stop email monitoring
    if (emailMonitoringInterval) {
      clearInterval(emailMonitoringInterval);
      emailMonitoringInterval = null;
    }

    // Try to clear emailInUse in the database for the currently authenticated user.
    // We'll attempt multiple strategies so we reliably clear the same row we set at login:
    // 1) Clear the row identified by activationEmail (the licence owner's email) if available
    // 2) Clear any row that currently has emailInUse equal to the logged-in mailbox address
    try {
      const dbUrl = await getSecret('DATABASE_URL');
      if (dbUrl) {
        let connection;
        try {
          connection = await mysql.createConnection(dbUrl);

          // 1) Clear by activationEmail (this is how login sets the row)
          if (activationEmail) {
            try {
              const [res] = await connection.execute('UPDATE user SET emailInUse = NULL WHERE email = ?;', [activationEmail]);
              console.log('[logout] Cleared emailInUse for licence owner (activationEmail):', activationEmail, 'result:', res);
            } catch (dbErr) {
              console.error('[logout] Failed to clear emailInUse by activationEmail:', dbErr);
            }
          }
          }
         catch (connErr) {
          console.error('[logout] DB connection error while clearing emailInUse:', connErr);
        } finally {
          try { if (connection) await connection.end(); } catch (e) {}
        }
      }
    } catch (err) {
      console.error('[logout] Error while attempting to clear emailInUse:', err);
    }

    // If Gmail token exists, clear it (do this after we used authState.credentials above)
    try {
      if (authState.provider === 'gmail' && fs.existsSync(TOKEN_PATH)) {
        // Ne töröljük a fájlt, csak ürítsük ki a tartalmát
        fs.writeFileSync(TOKEN_PATH, '', 'utf-8');
      }
    } catch (e) {
      console.error('[logout] Failed to clear Gmail token file:', e);
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
    },
    icon: path.join(__dirname, 'assets', 'icon.ico')
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

app.whenReady().then(async () => {
  loadAuthState();
  createWindow();
  startInternetMonitoring();
  console.log('Initial auth state:', authState); // Debug log

  // Frissítési kliens és események
  autoUpdater.checkForUpdatesAndNotify();


  autoUpdater.on('update-available', () => {
    console.log('Frissítés elérhető!');
    if (mainWindow) {
        mainWindow.webContents.send('update-ava');
    }
  });
  
  autoUpdater.on('download-progress', (progressTrack) => {
    console.log(`Frissítés letöltése: ${progressTrack.percent}%`);
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', progressTrack.percent);
    }
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('Frissítés letöltve!');
    if (mainWindow) {
      mainWindow.webContents.send('update-ready');
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Frissítési hiba:', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', err.message);
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Frissítési hiba',
        message: `Hiba történt a frissítés során: ${err.message}`,
        buttons: ['OK']
      });
    }
  });


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
        try {
          smtpHandler.setOnMailCallback(() => checkEmailsOnce().catch(err => console.error('Error in onMail triggered check:', err)));
        } catch (e) { console.warn('Could not set onMail callback on smtpHandler:', e); }
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

function extractEmailAddress(fromField) {
  const match = fromField && fromField.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1] : null;
}

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
    console.error('[get-reply-stats] Error:', e);
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
  let connection;
  try {
    const dbUrl = await getSecret('DATABASE_URL');
    if (!dbUrl) {
      throw new Error('DATABASE_URL nincs beállítva Keytarban!');
    }

    connection = await mysql.createConnection(dbUrl); // URL alapú csatlakozás
    const [rows] = await connection.execute(
      'SELECT id FROM user WHERE email = ? AND licence = ? LIMIT 1',
      [email, licenceKey]
    );

    if (rows && rows.length > 0) {
      return { success: true };
    }
    return { success: false, error: 'Hibás licenc vagy email.' };
  } catch (err) {
    console.error('Licenc ellenőrzési hiba:', err);
    return { success: false, error: 'Adatbázis hiba.' };
  } finally {
    try { if (connection) await connection.end(); } catch (e) {}
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



// Add IPC handlers for email storage
ipcMain.handle('set-email', async (event, email) => {
  try {
    // Save email to a persistent storage (e.g., a file or database)
    authState.credentials = { email };
    saveAuthState();
    return { success: true };
  } catch (error) {
    console.error('Error saving email:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-email', async () => {
  try {
    // Retrieve email from persistent storage
    return authState.credentials?.email || null;
  } catch (error) {
    console.error('Error retrieving email:', error);
    return null;
  }
});

// Új változó az aktivációs email cím tárolására (in-memory, inicializálva a settingsből ha van)
let activationEmail = settings.activationEmail || null;

// Új IPC handler az aktivációs email cím beállítására (most mentjük is a settings-be)
ipcMain.handle('set-activation-email', async (event, email) => {
  activationEmail = email;
  try {
    settings.activationEmail = email;
    saveSettings(settings);
  } catch (e) {
    console.error('[set-activation-email] Failed to save activationEmail to settings:', e);
  }
  console.log('Activation email set:', activationEmail);
  return true;
});

// Új IPC handler az aktivációs email cím lekérdezésére (visszaadjuk a mentett értéket ha van)
ipcMain.handle('get-activation-email', async () => {
  return settings.activationEmail || activationEmail || null;
});

// Logging
const logFilePath = path.join(app.getPath('userData'), 'app.log');

if (!fs.existsSync(app.getPath('userData'))) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
}

function logToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`);
}

ipcMain.on('log', (event, message) => {
  console.log(`[Renderer Log]: ${message}`);
  logToFile(`[Renderer Log]: ${message}`);
});

function readSentEmailsLog() {
  try {
    const sentPath = findFile('sentEmailsLog.json');
    if (fs.existsSync(sentPath)) {
      return JSON.parse(fs.readFileSync(sentPath, 'utf-8'));
    }
    return [];
  } catch (err) {
    console.error('[readSentEmailsLog] Error reading sentEmailsLog.json:', err);
    return [];
  }
}

// IPC handler to check licence activation
ipcMain.handle('is-licence-activated', async (event, payload) => {
  const { email, licenceKey } = payload || {};
  let connection;
  try {
    const dbUrl = await getSecret('DATABASE_URL');
    if (!dbUrl) {
      throw new Error('DATABASE_URL nincs beállítva Keytarban!');
    }

    connection = await mysql.createConnection(dbUrl); // URL alapú csatlakozás
    const [rows] = await connection.execute(
      'SELECT licenceActivated FROM user WHERE email = ? AND licence = ? LIMIT 1',
      [email, licenceKey]
    );

    if (!rows || rows.length === 0) {
      // No matching record -> return false (not activated / invalid)
      return false;
    }

    const activated = Number(rows[0].licenceActivated) === 1;
    return activated;
  } catch (error) {
    console.error('Error checking licence activation:', error);
    // On error, return true to be safe and block activation
    return true;
  } finally {
    try { if (connection) await connection.end(); } catch (e) {}
  }
});

// IPC to perform the actual activation (set licenceActivated = 1)
ipcMain.handle('activate-licence', async (event, payload) => {
  const { email, licenceKey } = payload || {};
  let connection;
  try {
    const dbUrl = await getSecret('DATABASE_URL');
    if (!dbUrl) throw new Error('DATABASE_URL nincs beállítva Keytarban!');
    connection = await mysql.createConnection(dbUrl);
    const [result] = await connection.execute(
      'UPDATE user SET licenceActivated = 1, TrialEndDate = DATE_ADD(NOW(), INTERVAL 90 DAY) WHERE email = ? AND licence = ?',
      [email, licenceKey]
    );
    // result.affectedRows can indicate success
    const success = result && (result.affectedRows === undefined ? true : result.affectedRows > 0);
    return { success };
  } catch (err) {
    console.error('Error activating licence:', err);
    return { success: false, error: 'Adatbázis hiba.' };
  } finally {
    try { if (connection) await connection.end(); } catch (e) {}
  }
});

ipcMain.handle('set-view', async (event, view) => {
  if (!mainWindow) {
    console.error('mainWindow is not initialized');
    return false;
  }

  mainWindow.webContents.send('set-view', view);
  return true;
});

ipcMain.handle('read-generated-replies', async () => {
  return readGeneratedReplies();
});

ipcMain.handle('save-generated-replies', async (event, replies) => {
  saveGeneratedReplies(replies);
});
