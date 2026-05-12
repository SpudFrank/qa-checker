/**
 * QA Checker — Combined Server
 *
 * Serves the HTML page AND proxies Baidu Cloud OCR API on the same origin,
 * so there's no CORS issue. One command to start everything.
 *
 * Usage:
 *   node server.js
 *   Then open http://localhost:3456 in your browser.
 *
 * To share with friends on the same network:
 *   node server.js
 *   They visit http://<your-ip>:3456
 *
 * No npm install required — uses only Node.js built-in modules.
 */

const https = require('https');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const BAIDU_HOST = 'aip.baidubce.com';

// Read the HTML file once at startup
const htmlPath = path.join(__dirname, 'qa-checker.html');
let htmlContent = '';
try {
  htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  console.log('  Loaded qa-checker.html');
} catch (e) {
  console.error('  ERROR: qa-checker.html not found in the same directory as server.js');
  process.exit(1);
}

// Helper: make an HTTPS request to Baidu
function baiduRequest(method, baiduPath, headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BAIDU_HOST,
      port: 443,
      path: baiduPath,
      method: method,
      headers: { ...headers, 'Host': BAIDU_HOST },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', (err) => {
      reject(new Error('Baidu API unreachable: ' + err.message));
    });

    if (body) req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // --- Collect body for POST requests ---
  let body = '';
  if (req.method === 'POST') {
    req.on('data', (chunk) => { body += chunk; });
  }

  const handleRequest = async () => {
    try {
      // Route: serve the HTML page
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlContent);
        return;
      }

      // Route: Baidu token proxy
      if (pathname === '/baidu-token') {
        const { ak, sk } = parsed.query;
        if (!ak || !sk) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ak or sk' }));
          return;
        }
        const result = await baiduRequest('GET',
          '/oauth/2.0/token?grant_type=client_credentials&client_id=' +
          encodeURIComponent(ak) + '&client_secret=' + encodeURIComponent(sk),
          {}
        );
        res.writeHead(result.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
        return;
      }

      // Route: Baidu OCR proxy
      if (pathname === '/baidu-ocr') {
        const { access_token } = parsed.query;
        if (!access_token) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error_code: 1, error_msg: 'Missing access_token' }));
          return;
        }
        if (!body) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error_code: 1, error_msg: 'Missing POST body' }));
          return;
        }
        const result = await baiduRequest('POST',
          '/rest/2.0/ocr/v1/accurate_basic?access_token=' + encodeURIComponent(access_token),
          { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        );
        res.writeHead(result.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
        return;
      }

      // Route: health check
      if (pathname === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch (err) {
      console.error('Server error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  };

  if (req.method === 'POST') {
    req.on('end', handleRequest);
  } else {
    handleRequest();
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║  物料质量检查系统                              ║');
  console.log('  ║                                              ║');
  console.log('  ║  Local:  http://localhost:' + PORT + '              ║');
  console.log('  ║  Share:  http://<你的IP>:' + PORT + '             ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('  Tip: Share the URL with friends on the same WiFi/LAN.');
  console.log('  Each friend will need their own Baidu Cloud API credentials.');
  console.log('');
});
