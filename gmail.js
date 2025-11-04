import { authorize } from './src/backend/auth.js';
import { google } from 'googleapis';
import { htmlToText } from 'html-to-text';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getSecret } from './src/utils/keytarHelper.js';
import { app } from 'electron';
import { OpenAI } from 'openai';
import pdfParse from 'pdf-parse';
import XLSX from 'xlsx';
import mammoth from 'mammoth';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';
import { createAndStoreEmbeddingsForLongText } from './src/backend/embeddings-helper.js';
import kbManager from './src/backend/kb-manager.js';

function decodeRFC2047(subject) {
  return subject.replace(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g, (match, charset, encoding, text) => {
    if (encoding.toUpperCase() === 'B') {
      const buff = Buffer.from(text, 'base64');
      return buff.toString(charset);
    } else if (encoding.toUpperCase() === 'Q') {
      const str = text.replace(/_/g, ' ');
      const buff = Buffer.from(str.replace(/=([A-Fa-f0-9]{2})/g, (m, p1) => {
        return String.fromCharCode(parseInt(p1, 16));
      }), 'binary');
      return buff.toString(charset);
    }
    return text;
  });
}

// Convert HTML to text but preserve <table> contents in a machine-friendly tab/CSV-like form.
function htmlToTextWithTables(html) {
  try {
    // Basic textual conversion
    let text = htmlToText(html, { wordwrap: 130 });
    let $ = null;
    try { $ = cheerio.load(html); } catch (e) { $ = null; }
    if ($) {
      const tables = $('table');
      if (tables.length > 0) {
        text += '\n\n[TABLES]\n';
        tables.each((ti, table) => {
          const rows = [];
          $(table).find('tr').each((ri, tr) => {
            const cells = [];
            $(tr).find('th,td').each((ci, cell) => {
              let cellText = $(cell).text().trim().replace(/\s+/g, ' ');
              // Replace newlines inside a cell with space to keep rows intact
              cellText = cellText.replace(/\n+/g, ' ');
              cells.push(cellText);
            });
            if (cells.length) rows.push(cells.join('\t'));
          });
          if (rows.length) {
            text += `Table ${ti + 1}:\n` + rows.join('\n') + '\n\n';
          }
        });
      }
    }
    return text;
  } catch (e) {
    try { return htmlToText(html); } catch { return '(html parsing error)'; }
  }
}

export async function getUnreadEmails() {
  const auth = await authorize();
  const gmail = google.gmail({ version: 'v1', auth });

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults: 50,
  });

  const messages = res.data.messages || [];

  const detailed = await Promise.all(
    messages.map(async (msg) => {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const headers = full.data.payload.headers.reduce((acc, h) => {
        acc[h.name] = h.value;
        return acc;
      }, {});

      return {
        id: msg.id,
        from: headers['From'],
        subject: headers['Subject'] ? decodeRFC2047(headers['Subject']) : '',
        date: headers['Date'],
        snippet: full.data.snippet,
      };
    })
  );

  // Apply explicit fromDate post-filter: keep emails whose Date header is >= start of fromDate
  try {
    const settingsPath = path.resolve(process.cwd(), 'settings.json');
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(raw);
    const fromDateStr = settings?.fromDate;
    if (fromDateStr && /^\d{4}-\d{2}-\d{2}$/.test(fromDateStr)) {
      const parts = fromDateStr.split('-');
      const startDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      // Normalize to start of day
      startDate.setHours(0, 0, 0, 0);
      const filtered = detailed.filter(d => {
        try {
          const msgDate = d.date ? new Date(d.date) : null;
          return msgDate && !isNaN(msgDate) && msgDate >= startDate;
        } catch (e) { return false; }
      });
      return filtered;
    }
  } catch (e) {
    console.error('[AIServiceApp][gmail.js] settings.json read error (post-filter):', e.message);
  }

  return detailed;
}

export async function getRecentEmails() {
  const auth = await authorize();
  const gmail = google.gmail({ version: 'v1', auth });
  // Try to read `fromDate` from settings.json (format expected: YYYY-MM-DD).
  // We interpret `fromDate` as the earliest date to load emails from (i.e. "from this date until now").
  // We'll page through results to collect ALL messages matching the criteria (respecting Gmail paging).
  let listParams = { userId: 'me', maxResults: 100 }; // page size for listing
  try {
    const settingsPath = path.resolve(process.cwd(), 'settings.json');
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(raw);
    const fromDateStr = settings?.fromDate;
    if (fromDateStr && /^\d{4}-\d{2}-\d{2}$/.test(fromDateStr)) {
      const parts = fromDateStr.split('-');
      // Gmail search uses YYYY/MM/DD format for date queries
      const gmailDate = `${parts[0]}/${parts[1]}/${parts[2]}`;
      // Use `after:` to get messages from the given date (inclusive behavior depends on Gmail but this is the common approach)
      listParams.q = `after:${gmailDate}`;
    }
  } catch (e) {
    // If settings can't be read or parsed, silently continue with default behavior
    console.error('[AIServiceApp][gmail.js] settings.json read error:', e.message);
  }

  // Page through all results and aggregate messages
  let messages = [];
  try {
    let nextPageToken = null;
    do {
      if (nextPageToken) listParams.pageToken = nextPageToken;
      const res = await gmail.users.messages.list(listParams);
      const pageMsgs = res.data.messages || [];
      messages.push(...pageMsgs);
      nextPageToken = res.data.nextPageToken;
    } while (nextPageToken);
  } catch (e) {
    console.error('[AIServiceApp][gmail.js] Error listing messages:', e.message);
    messages = []; // fallback to empty
  }

  // Helper to extract a readable body from the MIME payload (text/plain preferred,
  // fallback to text/html converted to text). This mirrors the logic used in getEmailById.
  function extractBodyFromPayload(payload) {
    function isUnsupportedHtmlMessage(text) {
      const lower = text.toLowerCase();
      return lower.includes('html formátumot támogató levelező kliens szükséges');
    }

    function findTextPart(part) {
      if (!part) return null;
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        const text = Buffer.from(part.body.data, 'base64').toString('utf8');
        if (isUnsupportedHtmlMessage(text)) {
          return 'A levelező nem tudja megnyitni a levél teljes tartalmát (valószínűleg spam vagy hírlevél).';
        }
        return text;
      }
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf8');
        const text = htmlToTextWithTables(html);
        if (isUnsupportedHtmlMessage(text)) {
          return 'A levelező nem tudja megnyitni a levél teljes tartalmát (valószínűleg spam vagy hírlevél).';
        }
        return text;
      }
      if (part.parts && Array.isArray(part.parts)) {
        for (const subPart of part.parts) {
          const found = findTextPart(subPart);
          if (found) return found;
        }
      }
      return null;
    }

    const found = findTextPart(payload);
    if (found) return found;
    if (payload.body && payload.body.data) {
      const decoded = Buffer.from(payload.body.data, 'base64').toString('utf8');
      const text = payload.mimeType === 'text/html' ? htmlToText(decoded) : decoded;
      if (isUnsupportedHtmlMessage(text)) {
        return 'A levelező nem tudja megnyitni a levél teljes tartalmát (valószínűleg spam vagy hírlevél).';
      }
      return text;
    }
    return '(nincs tartalom)';
  }

  const detailed = await Promise.all(
    messages.map(async (msg) => {
      // Fetch full message so we can extract the body
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = (full.data.payload.headers || []).reduce((acc, h) => {
        acc[h.name] = h.value;
        return acc;
      }, {});

      const body = extractBodyFromPayload(full.data.payload);

      // Helper: process saved attachment -> extract text, create embedding, then remove file
  async function processAndEmbedAttachment(filePath, filename, mimeType, sourceId = null) {
        try {
          // Extract text depending on extension/mime
          const lower = (filename || '').toLowerCase();
          let text = '';
          if (lower.endsWith('.pdf')) {
            try {
              const data = fs.readFileSync(filePath);
              const parsed = await pdfParse(data);
              text = parsed && parsed.text ? String(parsed.text) : '';
            } catch (e) {
              console.error('[AIServiceApp][gmail.js] pdf parse error:', e && e.message ? e.message : e);
            }
          } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
            try {
              const wb = XLSX.readFile(filePath, { cellDates: true });
              const sheets = wb.SheetNames || [];
              const parts = [];
              const cellKBs = [];
              for (const s of sheets) {
                try {
                  const sheet = wb.Sheets[s];
                  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
                  parts.push(`Sheet: ${s}\n` + csv);

                  // iterate rows/cells to create per-cell KB entries
                  const rows = XLSX.utils.sheet_to_json(sheet || {}, { header: 1, raw: false, defval: '' });
                  for (let r = 0; r < rows.length; r++) {
                    const row = rows[r] || [];
                    for (let c = 0; c < row.length; c++) {
                      try {
                        const val = row[c];
                        if (val === null || val === undefined) continue;
                        const sval = String(val).trim();
                        if (!sval) continue;
                        let addr = null;
                        try { addr = XLSX.utils.encode_cell({ r, c }); } catch (ea) { addr = `${r + 1}:${c + 1}`; }
                        // compute column letter
                        let col = c + 1;
                        let colLetter = '';
                        while (col > 0) {
                          const rem = (col - 1) % 26;
                          colLetter = String.fromCharCode(65 + rem) + colLetter;
                          col = Math.floor((col - 1) / 26);
                        }
                        const cellId = `${sourceId || messageId || Date.now()}-att-${path.basename(filePath)}-sheet-${s}-cell-${addr}`;
                        const cellAddress = `${s}!${colLetter}${r + 1}`;
                        const kbEmail = {
                          id: cellId,
                          from: headers['From'] || '',
                          subject: (headers['Subject'] ? decodeRFC2047(headers['Subject']) : '') || `Attachment: ${path.basename(filePath)} [${s} ${addr}]`,
                          date: headers['Date'] || new Date().toISOString(),
                          body: sval,
                          sheet: s,
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
              text = parts.join('\n\n');

              try {
                if (cellKBs.length) {
                  await kbManager.addEmails(cellKBs);
                }
              } catch (kbErr) {
                console.error('[AIServiceApp][gmail.js] failed to add per-cell KB entries:', kbErr && kbErr.message ? kbErr.message : kbErr);
              }
            } catch (e) {
              console.error('[AIServiceApp][gmail.js] excel parse error:', e && e.message ? e.message : e);
            }
          } else if (lower.endsWith('.docx')) {
            try {
              const buffer = fs.readFileSync(filePath);
              const res = await mammoth.extractRawText({ buffer });
              text = res && res.value ? String(res.value) : '';
            } catch (e) {
              console.error('[AIServiceApp][gmail.js] docx parse error:', e && e.message ? e.message : e);
            }
          } else if (lower.endsWith('.eml') || mimeType === 'message/rfc822') {
            try {
              const raw = fs.readFileSync(filePath);
              const parsed = await simpleParser(raw);
              text = parsed && parsed.text ? String(parsed.text) : '';
            } catch (e) {
              console.error('[AIServiceApp][gmail.js] eml parse error:', e && e.message ? e.message : e);
            }
          }

          if (!text || String(text).trim().length === 0) {
            // nothing to embed
            try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
            return null;
          }

          // Create embeddings using the chunked embeddings helper (handles very long texts)
          try {
            const helperPath = path.join(process.cwd(), 'src', 'backend', 'embeddings-helper.js');
            const { pathToFileURL } = await import('url');
            const helperUrl = pathToFileURL(helperPath).href;
            const { createAndStoreEmbeddingsForLongText } = await import(helperUrl);
            const stored = await createAndStoreEmbeddingsForLongText(text, { filename, sourceId: sourceId || null, maxTokens: 2000 });
            if (!stored) {
              console.warn('[AIServiceApp][gmail.js] no embeddings were stored for attachment', filename);
            }
          } catch (e) {
            console.error('[AIServiceApp][gmail.js] embedding creation failed (chunked helper):', e && e.message ? e.message : e);
          }

          // Remove local file after processing
          try { fs.unlinkSync(filePath); } catch (e) { /* ignore deletion errors */ }
          return true;
        } catch (err) {
          console.error('[AIServiceApp][gmail.js] processAndEmbedAttachment error:', err && err.message ? err.message : err);
          try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
          return null;
        }
      }

      // Extract attachments (pdf, xlsx, xls) from payload. Save to attachments/ and include metadata.
      async function extractAttachments(payload, gmail, messageId) {
        const atts = [];
        async function walk(part) {
          if (!part) return;
          // If part has a filename it may be an attachment
          const filename = part.filename || '';
          const hasAttachmentId = part.body && part.body.attachmentId;
          const hasData = part.body && part.body.data;
          // Handle named attachments (pdf, xlsx, xls, doc, docx, eml) as well as
          // inline attached messages (mimeType 'message/rfc822'). Some providers
          // set a filename, others don't — so we check mimeType as well.
          const lower = (filename || '').toLowerCase();
          const mt = (part.mimeType || '').toLowerCase();
          const looksLikeAttachment = filename && (hasAttachmentId || hasData) || mt === 'message/rfc822';
          if (looksLikeAttachment) {
            if (lower.endsWith('.pdf') || lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.eml') || mt === 'message/rfc822') {
              try {
                let b64 = null;
                if (hasData && part.body.data) {
                  b64 = part.body.data;
                } else if (hasAttachmentId) {
                  const attRes = await gmail.users.messages.attachments.get({
                    userId: 'me',
                    messageId: messageId,
                    id: part.body.attachmentId,
                  });
                  b64 = attRes.data && attRes.data.data ? attRes.data.data : null;
                }
                // For message/rfc822 the raw message may be in part.body.data even without filename
                if (b64 || mt === 'message/rfc822') {
                  // If no explicit base64 content (message/rfc822), try to read raw subpart data
                  if (!b64 && part.body && part.body.data) b64 = part.body.data;
                  // Convert to classic base64 (pad) then save file
                  if (!b64) {
                    // nothing to save
                    // This is inside the async `walk` function — use `return` to exit
                    // the current invocation instead of `continue` which targets loops
                    // and would generate a "jump target cannot cross function boundary" error.
                    return;
                  }
                  let s = b64.replace(/-/g, '+').replace(/_/g, '/');
                  while (s.length % 4 !== 0) s += '=';
                  const buffer = Buffer.from(s, 'base64');
                  const attsDir = path.resolve(process.cwd(), 'fromAttachments');
                  if (!fs.existsSync(attsDir)) fs.mkdirSync(attsDir, { recursive: true });
                  // Ensure unique filename
                  const baseName = filename && filename.length ? filename : (mt === 'message/rfc822' ? 'attached-email.eml' : `attachment`);
                  const safeName = `${messageId}-${Date.now()}-${baseName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                  const filePath = path.join(attsDir, safeName);
                  fs.writeFileSync(filePath, buffer);
                  atts.push({ filename: filename || safeName, mimeType: part.mimeType || 'application/octet-stream', path: filePath, base64: s });
                  // Process and embed now, then delete file (processAndEmbedAttachment will delete)
                  try {
                    await processAndEmbedAttachment(filePath, filename || safeName, part.mimeType || 'application/octet-stream', messageId);
                  } catch (pe) {
                    console.error('[AIServiceApp][gmail.js] processAndEmbedAttachment failed:', pe && pe.message ? pe.message : pe);
                    // ensure deletion if it wasn't removed
                    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
                  }
                }
              } catch (e) {
                console.error('[AIServiceApp][gmail.js] attachment extract error:', e && e.message ? e.message : e);
              }
            }
          }
          if (part.parts && Array.isArray(part.parts)) {
            for (const p of part.parts) await walk(p);
          }
        }
        await walk(payload);
        return atts;
      }

      let attachments = [];
      try {
        attachments = await extractAttachments(full.data.payload, gmail, msg.id);
      } catch (e) {
        console.error('[AIServiceApp][gmail.js] extractAttachments failed:', e && e.message ? e.message : e);
      }

      return {
        id: msg.id,
        from: headers['From'],
        subject: headers['Subject'] ? decodeRFC2047(headers['Subject']) : '',
        date: headers['Date'],
        body,
        // Use the extracted full body as snippet so the client receives the complete content (no truncation)
        snippet: body,
        attachments // array of { filename, mimeType, path, base64 }
      };
    })
  );

  return detailed;
}

export async function sendEmail({ to, subject, body }) {
  const auth = await authorize();
  const gmail = google.gmail({ version: 'v1', auth });

  // RFC 2047 szerinti subject encoding (Base64-es UTF-8)
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;

  const rawMessage = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\n');

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });

  return res.data;
}

export async function getEmailById(id) {
  const auth = await authorize();
  const gmail = google.gmail({ version: 'v1', auth });

  const res = await gmail.users.messages.get({
    userId: 'me',
    id,
    format: 'full',
  });

  // MIME-struktúra logolása (rekurzív, csak a partok szerkezete)
  function logParts(part, depth = 0) {
    const indent = '  '.repeat(depth);
    if (!part) return;
    console.log(`${indent}[AIServiceApp][gmail.js] partId: ${part.partId || ''}, mimeType: ${part.mimeType || ''}, filename: ${part.filename || ''}, body.data: ${!!(part.body && part.body.data)}, body.attachmentId: ${part.body && part.body.attachmentId ? part.body.attachmentId : ''}`);
    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(subPart => logParts(subPart, depth + 1));
    }
  }
  logParts(res.data.payload);

  const headers = res.data.payload.headers.reduce((acc, h) => {
    acc[h.name] = h.value;
    return acc;
  }, {});

function extractBody(payload) {
  function isUnsupportedHtmlMessage(text) {
    const lower = text.toLowerCase();
    return lower.includes('html formátumot támogató levelező kliens szükséges');
  }

  // Rekurzív keresés a partokban
  function findTextPart(part) {
    if (!part) return null;
    // Először text/plain
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      const text = Buffer.from(part.body.data, 'base64').toString('utf8');
      if (isUnsupportedHtmlMessage(text)) {
        return 'A levelező nem tudja megnyitni a levél teljes tartalmát (valószínűleg spam vagy hírlevél).';
      }
      return text;
    }
    // Utána text/html
    if (part.mimeType === 'text/html' && part.body && part.body.data) {
      const html = Buffer.from(part.body.data, 'base64').toString('utf8');
      const text = htmlToTextWithTables(html);
      if (isUnsupportedHtmlMessage(text)) {
        return 'A levelező nem tudja megnyitni a levél teljes tartalmát (valószínűleg spam vagy hírlevél).';
      }
      return text;
    }
    // Ha vannak további partok, rekurzívan keresünk bennük
    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        const found = findTextPart(subPart);
        if (found) return found;
      }
    }
    return null;
  }

  // Először próbáljuk a rekurzív keresést
  const foundText = findTextPart(payload);
  if (foundText) return foundText;

  // Ha nincs part, de van body.data
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf8');
    const text = payload.mimeType === 'text/html' ? htmlToText(decoded) : decoded;
    if (isUnsupportedHtmlMessage(text)) {
      return 'A levelező nem tudja megnyitni a levél teljes tartalmát (valószínűleg spam vagy hírlevél).';
    }
    return text;
  }
  return '(nincs tartalom)';
}

  const body = extractBody(res.data.payload);

  // Base64 konverzió OpenAI kompatibilis formára
  function toClassicBase64(b64) {
    let s = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    return s;
  }

  // Képek kinyerése (mostantól aszinkron, attachmentId-t is kezel)
  async function extractImages(payload, gmail, messageId) {
    let images = [];
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType && part.mimeType.startsWith('image/')) {
          if (part.body && part.body.data) {
            images.push({
              mimeType: part.mimeType,
              data: toClassicBase64(part.body.data) // base64
            });
          } else if (part.body && part.body.attachmentId) {
            // attachmentId alapján lekérjük az adatot
            try {
              const attachment = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: messageId,
                id: part.body.attachmentId,
              });
              images.push({
                mimeType: part.mimeType,
                data: toClassicBase64(attachment.data.data) // base64
              });
            } catch (e) {
              console.error('[AIServiceApp][gmail.js] Hiba attachment letöltésekor:', e.message);
            }
          }
        }
        // rekurzívan keresünk további partokat
        if (part.parts) {
          const subImages = await extractImages(part, gmail, messageId);
          images = images.concat(subImages);
        }
      }
    }
    return images;
  }
  const images = await extractImages(res.data.payload, gmail, id);
  console.log(`[AIServiceApp][gmail.js] Kinyert képek száma: ${images.length}`);
  images.forEach((img, idx) => {
    console.log(`[AIServiceApp][gmail.js] Kép #${idx + 1} MIME-típus: ${img.mimeType}, base64 hossz: ${img.data.length}`);
  });

  // Képek továbbítása az OpenAI Vision API-nak
  async function sendImageToOpenAI(base64Image, mimeType) {
  const apiKey = await getSecret('OpenAPIKey');
  if (!apiKey) {
    throw new Error('OpenAPIKey nincs beállítva Keytarban!');
  }
    if (!apiKey) throw new Error('Nincs megadva OpenAI API kulcs!');
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Mit látsz ezen a képen?' },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 300
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`[AIServiceApp][gmail.js] OpenAI válasz (${mimeType}, base64 hossz: ${base64Image.length}):`, JSON.stringify(response.data));
      return response.data;
    } catch (err) {
      console.error(`[AIServiceApp][gmail.js] OpenAI API hiba (${mimeType}, base64 hossz: ${base64Image.length}):`, err.response ? err.response.data : err.message);
      return { error: true, details: err.response ? err.response.data : err.message };
    }
  }

  let aiImageResponses = [];
  if (images.length > 0) {
    aiImageResponses = await Promise.all(
      images.map(img => sendImageToOpenAI(img.data, img.mimeType))
    );
  }

  return {
    id,
    from: headers['From'],
    subject: headers['Subject'] ? decodeRFC2047(headers['Subject']) : '',
    date: headers['Date'],
    body,
    images, // képek tömbje
    aiImageResponses, // OpenAI válaszok tömbje
  };
}

