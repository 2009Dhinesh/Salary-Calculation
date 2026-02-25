const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeBB() {
  try {
    const res = await axios.get('https://www.bankbazaar.com/gold-rate-india.html', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html' }
    });
    console.log('BankBazaar Length:', res.data.length);
    const $ = cheerio.load(res.data);
    let success = false;
    $('.table').each((i, el) => {
        const text = $(el).text();
        if (text && text.includes('24 Karat')) {
            console.log('Found table:', text.substring(0, 200).replace(/\s+/g, ' '));
            success = true;
        }
    });
  } catch(e) {
    console.log('BB Failed:', e.message);
  }
}
scrapeBB();
