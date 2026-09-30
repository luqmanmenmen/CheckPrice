const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const url = 'https://5efxwburvir1yyoz.public.blob.vercel-storage.com/PQ/POWER%20QUERY%2029%20SEPTEMBER%202026.csv';
  console.log('Downloading...');
  const text = await fetchUrl(url);
  const lines = text.split(/\r?\n/);
  console.log('Total lines:', lines.length);
  console.log('Line 1 (header):', lines[0].substring(0, 300));
  console.log('\nLine 2 sample:', lines[1] ? lines[1].substring(0, 300) : 'EMPTY');
  console.log('\nDelimiter check:');
  console.log('Commas in header:', (lines[0].match(/,/g) || []).length);
  console.log('Semicolons in header:', (lines[0].match(/;/g) || []).length);
  console.log('Tabs in header:', (lines[0].match(/\t/g) || []).length);
  console.log('Pipes in header:', (lines[0].match(/\|/g) || []).length);
}
main().catch(console.error);
