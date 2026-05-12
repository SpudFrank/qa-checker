const https = require('https');

exports.handler = async function(event) {
  const { access_token } = event.queryStringParameters || {};
  if (!access_token) {
    return { statusCode: 400, body: JSON.stringify({ error_code: 1, error_msg: 'Missing access_token' }) };
  }

  const body = event.body || '';
  if (!body) {
    return { statusCode: 400, body: JSON.stringify({ error_code: 1, error_msg: 'Missing POST body' }) };
  }

  return new Promise((resolve) => {
    const options = {
      hostname: 'aip.baidubce.com',
      port: 443,
      path: '/rest/2.0/ocr/v1/accurate_basic?access_token=' + encodeURIComponent(access_token),
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Host': 'aip.baidubce.com',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: { 'Content-Type': 'application/json' },
          body: data,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 502,
        body: JSON.stringify({ error_code: 1, error_msg: 'Baidu API unreachable: ' + err.message }),
      });
    });

    req.write(body);
    req.end();
  });
};
