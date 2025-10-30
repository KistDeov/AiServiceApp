import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { OpenAI } from 'openai';
import { getSecret } from '../utils/keytarHelper.js';
import { chunkText as losslessChunkText } from './embeddings-helper.js';

// Simple file-based embeddings KB. Stores array of entries:
// { id: `${msgId}-${chunkIndex}`, docId: msgId, chunkIndex, text, subject, from, date, embedding }

const KB_FILENAME = path.join(app.getPath('userData'), 'embeddings_kb.json');
// Use a chunk size that aims to maximize per-chunk context while staying
// comfortably within typical embedding token limits. This value is in
// characters (conservative char->token heuristic: ~4 chars/token).
const DEFAULT_CHUNK_CHARS = 16000;
const BATCH_EMBED_SIZE = 100;
const LOG_FILENAME = path.join(app.getPath('userData'), 'kb_manager.log');

function appendLog(line) {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(LOG_FILENAME, `[${ts}] ${line}\n`, 'utf8');
  } catch (e) {
    // fallback to console if file write fails
    console.log('[kb-manager][log-fallback]', line);
  }
}

async function getOpenAI() {
  const key = await getSecret('OpenAPIKey');
  if (!key) throw new Error('OpenAPIKey not set in keytar');
  return new OpenAI({ apiKey: key });
}

function loadKB() {
  try {
    if (fs.existsSync(KB_FILENAME)) {
      const raw = fs.readFileSync(KB_FILENAME, 'utf8');
      return JSON.parse(raw || '[]');
    }
  } catch (e) {
    console.error('[kb-manager] loadKB error:', e.message);
  }
  return [];
}

function saveKB(kb) {
  try {
    fs.writeFileSync(KB_FILENAME, JSON.stringify(kb, null, 2), 'utf8');
  } catch (e) {
    console.error('[kb-manager] saveKB error:', e.message);
  }
}

// Use centralized lossless chunker from embeddings-helper to avoid data loss.
// `losslessChunkText` returns array of { text, start, end } objects.

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] || 0) * (b[i] || 0);
    na += (a[i] || 0) * (a[i] || 0);
    nb += (b[i] || 0) * (b[i] || 0);
  }
  na = Math.sqrt(na); nb = Math.sqrt(nb);
  return na && nb ? dot / (na * nb) : 0;
}

async function addEmails(emails = []) {
  if (!Array.isArray(emails) || emails.length === 0) return { added: 0 };
  // Quick kill-switch: read settings.json and respect enableKB flag
  try {
    const settingsPath = path.resolve(process.cwd(), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(raw || '{}');
      if (settings && settings.enableKB === false) {
        appendLog('KB.addEmails skipped because settings.enableKB is false');
        return { added: 0, skipped: true };
      }
    }
  } catch (e) {
    console.error('[kb-manager] settings read error (enableKB):', e && e.message ? e.message : e);
  }
  const kb = loadKB();
  const existingIds = new Set(kb.map(e => e.id));

  const toEmbed = [];
  for (const em of emails) {
    // Prefer stable identifiers: id (Gmail), uid (IMAP), messageId header, fallback to deterministic hash
    let msgId = em.id || em.uid || em.messageId || null;
    if (!msgId) {
      // deterministic fallback from from+subject+date
      const seed = `${em.from || ''}||${em.subject || ''}||${em.date || ''}`;
      // simple hash
      let h = 0;
      for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) - h) + seed.charCodeAt(i);
        h |= 0;
      }
      msgId = 'gen-' + Math.abs(h);
    } else {
      msgId = String(msgId);
    }
    const subject = em.subject || '';
    const from = em.from || '';
    const date = em.date || '';
    const body = em.body || em.text || '';
    const chunkObjs = losslessChunkText(body, DEFAULT_CHUNK_CHARS, Math.floor(DEFAULT_CHUNK_CHARS * 0.1));
    const totalChunks = chunkObjs.length;
    for (let ci = 0; ci < chunkObjs.length; ci++) {
      const cobj = chunkObjs[ci];
      const chunkText = (typeof cobj === 'string') ? cobj : (cobj.text || '');
      const chunkStart = (cobj && typeof cobj.start === 'number') ? cobj.start : null;
      const chunkEnd = (cobj && typeof cobj.end === 'number') ? cobj.end : null;
      const id = `${msgId}-${ci}`;
      if (existingIds.has(id)) continue;
      toEmbed.push({ id, docId: msgId, chunkIndex: ci, text: chunkText, subject, from, date, chunkStart, chunkEnd, totalChunks });
    }
  }

  if (!toEmbed.length) return { added: 0 };

  // Safety guard: previously this limited new chunks to 200 to avoid accidental
  // huge costs. Users may want to embed larger volumes; increase the cap
  // substantially to avoid losing data while still protecting against truly
  // unbounded runs. If you prefer no cap, set this to a very large number or
  // make it configurable via settings.
  const MAX_NEW_CHUNKS = 10000; // increased cap to keep more chunks
  if (toEmbed.length > MAX_NEW_CHUNKS) {
    console.warn(`[kb-manager] Large number of new chunks to embed: ${toEmbed.length}. Limiting to first ${MAX_NEW_CHUNKS} to avoid excessive cost.`);
  }

  let openai;
  try {
    openai = await getOpenAI();
  } catch (e) {
    console.error('[kb-manager] OpenAI init failed:', e && e.message ? e.message : e);
    appendLog(`OpenAI init failed: ${e && e.message ? e.message : e}`);
    return { added: 0, error: 'OpenAI init failed' };
  }
  // Batch embed
  const embeddings = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < Math.min(toEmbed.length, MAX_NEW_CHUNKS); i += BATCH_EMBED_SIZE) {
    const slice = toEmbed.slice(i, i + BATCH_EMBED_SIZE);
    // Send the full chunk text as embedding input. We generate chunks earlier
    // with `chunkText` (DEFAULT_CHUNK_CHARS), so no additional hard truncation
    // is necessary here. Try a batch call first; if the batch call fails (for
    // example due to very large inputs), fall back to per-entry embedding and
    // then to sub-chunk embedding + averaging so we don't lose data.
    const inputs = slice.map(s => String(s.text));
    let attempt = 0;
    const maxAttempts = 4;
    let batchSucceeded = false;
    while (attempt < maxAttempts && !batchSucceeded) {
      try {
        const resp = await openai.embeddings.create({ model: 'text-embedding-3-small', input: inputs });
        const data = (resp && resp.data) ? resp.data.map(d => d.embedding) : [];
        for (let j = 0; j < data.length; j++) {
          const entry = slice[j];
          kb.push({ id: entry.id, docId: entry.docId, chunkIndex: entry.chunkIndex, text: entry.text, subject: entry.subject, from: entry.from, date: entry.date, embedding: data[j], chunkStart: entry.chunkStart || null, chunkEnd: entry.chunkEnd || null, totalChunks: entry.totalChunks || null });
        }
        appendLog(`Embedded batch ${i}/${toEmbed.length} -> ${data.length} items`);
        await sleep(200);
        batchSucceeded = true;
        break;
      } catch (err) {
        attempt++;
        const wait = 500 * Math.pow(2, attempt);
        console.error('[kb-manager] embed batch error (attempt', attempt, '):', err && err.message ? err.message : err);
        appendLog(`embed batch error attempt ${attempt}: ${err && err.message ? err.message : err}`);
        if (attempt >= maxAttempts) {
          // Fall back to per-item embedding with further sub-chunking if needed
          appendLog(`Falling back to per-item embeddings for batch starting at ${i}`);
          for (let j = 0; j < slice.length; j++) {
            const entry = slice[j];
            try {
              // Try embedding the full chunk for this entry
              const singleResp = await openai.embeddings.create({ model: 'text-embedding-3-small', input: String(entry.text) });
              const emb = singleResp && singleResp.data && singleResp.data[0] ? singleResp.data[0].embedding : null;
              if (emb) {
                kb.push({ id: entry.id, docId: entry.docId, chunkIndex: entry.chunkIndex, text: entry.text, subject: entry.subject, from: entry.from, date: entry.date, embedding: emb, chunkStart: entry.chunkStart || null, chunkEnd: entry.chunkEnd || null, totalChunks: entry.totalChunks || null });
                appendLog(`Embedded single entry ${entry.id}`);
                await sleep(100);
                continue;
              }
            } catch (singleErr) {
              appendLog(`single embed failed for ${entry.id}: ${singleErr && singleErr.message ? singleErr.message : singleErr}`);
            }

            // If embedding the full chunk fails, split into smaller subchunks and
            // compute embeddings for each subchunk, then average the vectors.
            try {
              const SUB_CHUNK = 2000; // safe sub-chunk size
              const partObjs = losslessChunkText(String(entry.text), SUB_CHUNK, Math.floor(SUB_CHUNK * 0.1));
              const subEmbeddings = [];
              for (let p = 0; p < partObjs.length; p += BATCH_EMBED_SIZE) {
                const subSlice = partObjs.slice(p, p + BATCH_EMBED_SIZE).map(x => x.text || '');
                const subResp = await openai.embeddings.create({ model: 'text-embedding-3-small', input: subSlice });
                const subData = (subResp && subResp.data) ? subResp.data.map(d => d.embedding) : [];
                for (const sd of subData) subEmbeddings.push(sd);
                await sleep(100);
              }
                if (subEmbeddings.length) {
                // average vectors
                const len = subEmbeddings.length;
                const out = new Array(subEmbeddings[0].length).fill(0);
                for (const vec of subEmbeddings) {
                  for (let k = 0; k < vec.length; k++) out[k] += vec[k] || 0;
                }
                for (let k = 0; k < out.length; k++) out[k] = out[k] / len;
                kb.push({ id: entry.id, docId: entry.docId, chunkIndex: entry.chunkIndex, text: entry.text, subject: entry.subject, from: entry.from, date: entry.date, embedding: out, chunkStart: entry.chunkStart || null, chunkEnd: entry.chunkEnd || null, totalChunks: entry.totalChunks || null });
                appendLog(`Embedded entry ${entry.id} via subchunks`);
              } else {
                appendLog(`No sub-embeddings produced for ${entry.id}`);
              }
            } catch (subErr) {
              appendLog(`sub-embed failed for ${entry.id}: ${subErr && subErr.message ? subErr.message : subErr}`);
            }
          }
        } else {
          await sleep(wait);
        }
      }
    }
  }

  saveKB(kb);
  appendLog(`KB.addEmails finished. added=${Math.min(toEmbed.length, MAX_NEW_CHUNKS)} queued=${toEmbed.length} totalKB=${kb.length}`);
  return { added: Math.min(toEmbed.length, MAX_NEW_CHUNKS), totalQueued: toEmbed.length };
}

function queryByEmbedding(queryEmb, topN = 50) {
  const kb = loadKB();
  if (!kb.length) return [];
  const scored = kb.map(item => ({ score: cosine(queryEmb, item.embedding || []), item }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map(s => ({ score: s.score, id: s.item.id, text: s.item.text, docId: s.item.docId, subject: s.item.subject, from: s.item.from, date: s.item.date, chunkIndex: s.item.chunkIndex, chunkStart: s.item.chunkStart || null, chunkEnd: s.item.chunkEnd || null, totalChunks: s.item.totalChunks || null }));
}

function getAllEntries() {
  return loadKB();
}

export default {
  addEmails,
  queryByEmbedding,
  getAllEntries,
  KB_FILENAME
};
