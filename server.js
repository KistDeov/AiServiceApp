import http from 'http';
import url from 'url';

const server = http.createServer((req, res) => {
  const reqUrl = url.parse(req.url, true);
  if (reqUrl.pathname === '/' && reqUrl.query.code) {
    const authCode = reqUrl.query.code;
    console.log('Megkaptuk az authorization code-ot:', authCode);

    // Itt folytasd a token kérését a Google API-val (pl. getToken(authCode))

    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('Sikeresen bejelentkeztel! Bezarhatod ezt az ablakot.');
    server.close(); // bezárod a szervert, mert már nem kell tovább hallgatni
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(57113, () => {
  console.log('OAuth redirect URI szerver fut a http://localhost:57113 címen');
});
