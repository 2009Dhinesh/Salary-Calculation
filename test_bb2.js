const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeBB() {
  try {
    const res = await axios.get('https://www.bankbazaar.com/gold-rate-india.html', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(res.data);
    let success = false;
    
    // BankBazaar usually has <div class="price"> or tables
    const table22k = $('table').filter((i, el) => $(el).text().includes('22 Karat'));
    console.log('22K text:', table22k.first().text().substring(0, 300).replace(/\s+/g, ' '));
    
    const table24k = $('table').filter((i, el) => $(el).text().includes('24 Karat'));
    console.log('24K text:', table24k.first().text().substring(0, 300).replace(/\s+/g, ' '));

  } catch(e) {
    console.log('BB Failed:', e.message);
  }
}
scrapeBB();
