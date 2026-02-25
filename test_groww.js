const axios = require('axios');

async function testGrow() {
  try {
    const res = await axios.get('https://groww.in/v1/api/stocks_data/v1/misc/gold_price/current', {
      headers: { 'User-Agent': 'Mozilla/5.0' } // simple UA is sometimes enough
    });
    console.log('Groww JSON:', res.data);
  } catch(e) {
    console.log('Groww Failed:', e.message);
  }
}
testGrow();
