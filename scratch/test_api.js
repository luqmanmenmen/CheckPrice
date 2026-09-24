const http = require('http');

http.get('http://localhost:3000/api/product/16626350', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log("Status:", res.statusCode);
    const j = JSON.parse(data);
    console.log("Product:", j.data.sku);
    console.log("Siblings count:", j.siblings ? j.siblings.length : 'undefined');
  });
});
