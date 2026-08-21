const http = require('http');

const contentByHost = {
  'publisher1.local': 'google.com, pub-1111111111111111, DIRECT, f08c47fec0942fa0\n',
  'publisher2.local': 'google.com, pub-2222222222222222, RESELLER, f08c47fec0942fa0\n',
  'publisher3.local': 'google.com, pub-3333333333333333, DIRECT, f08c47fec0942fa0\n',
};

const server = http.createServer((req, res) => {
  if (req.url !== '/app-ads.txt') {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }

  const host = (req.headers.host || '').split(':')[0];
  const content = contentByHost[host] || 'google.com, pub-default, DIRECT, f08c47fec0942fa0\n';

  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(content);
});

server.listen(8080, '0.0.0.0', () => {
  process.stdout.write('mock publisher listening on :8080\n');
});
