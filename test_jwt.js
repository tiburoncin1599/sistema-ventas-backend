const jwt = require('jsonwebtoken');
const http = require('http');

const token = new Promise((resolve, reject) => {
  const r = http.request({ hostname: 'localhost', port: 3001, path: '/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => { try { resolve(JSON.parse(d).token); } catch(e) { reject(e); } });
  });
  r.write(JSON.stringify({ email: 'aaas@gmail.com', password: 'aaas1599' }));
  r.end();
});

token.then(t => {
  console.log('Token:', t);
  // Try to decode
  try {
    const d = jwt.decode(t);
    console.log('Decoded (no verify):', JSON.stringify(d));
  } catch(e) { console.log('Decode error:', e.message); }
  
  // Try with secrets
  for (const secret of ['aaas1599', 'secreto123', 'aaas1599 ']) {
    try {
      const v = jwt.verify(t, secret);
      console.log('VALID with "' + secret + '":', JSON.stringify(v));
    } catch(e) {
      console.log('FAIL with "' + secret + '":', e.message);
    }
  }
});
