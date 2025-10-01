import { authorize } from './src/backend/auth.js';
import { google } from 'googleapis';
import { htmlToText } from 'html-to-text';
import axios from 'axios';
import { getSecret } from './src/utils/keytarHelper.js';

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
      const text = htmlToText(html);
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

