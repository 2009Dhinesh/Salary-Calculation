const axios = require('axios');

async function testCurrencyApi() {
  try {
    const res = await axios.get('https://latest.currency-api.pages.dev/v1/currencies/xau.json');
    const xauToInr = res.data.xau.inr;
    
    const resAg = await axios.get('https://latest.currency-api.pages.dev/v1/currencies/xag.json');
    const xagToInr = resAg.data.xag.inr;

    const gold24k = xauToInr / 31.1034768;
    const silver999 = xagToInr / 31.1034768;

    console.log('24K Gold/g (API):', gold24k);
    console.log('Silver/g (API):', silver999);
  } catch(e) {
    console.log('Failed:', e.message);
  }
}
testCurrencyApi();
