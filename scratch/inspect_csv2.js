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
  const text = await fetchUrl(url);
  const lines = text.split(/\r?\n/);
  console.log('Total lines:', lines.length);
  // Show first 10 lines
  for (let i = 0; i < 10; i++) {
    console.log(`Line ${i+1}:`, JSON.stringify(lines[i].substring(0, 200)));
  }
}
main().catch(console.error);
