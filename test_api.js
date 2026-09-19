import http from 'http';

http.get('http://localhost:3000/api/product/w', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Body:', data);
  });
}).on('error', (err) => {
  console.log('Error:', err.message);
});
