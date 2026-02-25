const axios = require('axios');

async function testGoldApi() {
  try {
    const res = await axios.get('https://api.gold-api.com/price/XAU');
    console.log('gold-api.com:', res.data);
  } catch(e) {
    console.log('gold-api Failed:', e.message);
  }
}
testGoldApi();
