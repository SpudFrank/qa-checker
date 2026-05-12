const https = require('https');

exports.handler = async function(event) {
  const { ak, sk } = event.queryStringParameters || {};
  if (!ak || !sk) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing ak or sk' }) };
  }

  return new Promise((resolve) => {
    const req = https.get(
      'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=' +
      encodeURIComponent(ak) + '&client_secret=' + encodeURIComponent(sk),
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: data,
          });
        });
      }
    );
    req.on('error', (err) => {
      resolve({
        statusCode: 502,
        body: JSON.stringify({ error: 'Baidu API unreachable: ' + err.message }),
      });
    });
  });
};
