const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  try {
    const res = await axios.get('https://www.goodreturns.in/gold-rates/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(res.data);
    let g24 = null;
    let g22 = null;
    let g18 = null;
    let s999 = null;

    // Looking for the table that has rates
    // GoodReturns structure usually has tables with class .money-bill or similar
    // We can extract text or specific divs. Let's just dump some text.
    console.log('Success!', res.data.substring(0, 200));
  } catch(e) {
    console.log('Failed:', e.message);
  }
}
test();
