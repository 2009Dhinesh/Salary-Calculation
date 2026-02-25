const axios = require('axios');
const cheerio = require('cheerio');

async function testLiveChennai() {
  try {
    const res = await axios.get('https://www.livechennai.com/gold_silverrate.asp', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(res.data);
    const tbl = $('.table-price').first();
    console.log('LiveChennai Text:', tbl.text().replace(/\s+/g, ' ').substring(0, 200));
  } catch(e) {
    console.log('LiveChennai Failed:', e.message);
  }
}
testLiveChennai();
