import dotenv from 'dotenv';
import { findFile } from '../utils/findFile.js';
dotenv.config({ path: findFile('.env') });
import fs from 'fs/promises';
import { google } from 'googleapis';
import path from 'path';
import open from 'open';
import http from 'http';

const CREDENTIALS_PATH = findFile('credentials.json');
const TOKEN_PATH = findFile('token.json');

// Token generation lock to prevent multiple simultaneous token generations
let tokenGenerationPromise = null;

export async function authorize() {
  const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
  const credentials = JSON.parse(content).installed;

  const oAuth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uris[0] // például: http://localhost
  );

  try {
    const token = await fs.readFile(TOKEN_PATH, 'utf-8');
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } catch (err) {
    // If a token generation is already in progress, wait for it to complete
    if (tokenGenerationPromise) {
      console.log('Token generation already in progress, waiting...');
      await tokenGenerationPromise;
      // After the token is generated, try to read it again
      const token = await fs.readFile(TOKEN_PATH, 'utf-8');
      oAuth2Client.setCredentials(JSON.parse(token));
      return oAuth2Client;
    }

    // Start new token generation
    tokenGenerationPromise = getNewToken(oAuth2Client);
    try {
      await tokenGenerationPromise;
      return oAuth2Client;
    } finally {
      // Clear the promise when done (success or failure)
      tokenGenerationPromise = null;
    }
  }
}

async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify'
],
  });

  console.log('Starting new token generation process...');
  // Nyissuk meg a böngészőben (vagy használhatsz Electron BrowserWindow-ot is)
  await open(authUrl);

  const code = await waitForCodeFromLocalhost();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens), 'utf-8');
  console.log('Token successfully saved to:', TOKEN_PATH);

  return oAuth2Client;
}

function waitForCodeFromLocalhost() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const code = url.searchParams.get('code');
      if (code) {
        res.end('Sikeres hitelesítés! Visszatérhetsz az alkalmazásba.');
        server.close();
        resolve(code);
      } else {
        res.end('Hiba történt.');
        server.close();
        reject(new Error('Nem sikerült kódot kapni'));
      }
    });
    server.listen(3000);
  });
}
