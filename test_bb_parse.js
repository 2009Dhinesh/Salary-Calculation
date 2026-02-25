const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeBB() {
  try {
    const res = await axios.get('https://www.bankbazaar.com/gold-rate-india.html', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(res.data);
    
    // BankBazaar usually has <div class="price"> or strong tags
    // Let's grab all strong tags or bold text with ₹
    const matches = [];
    $('td, strong, span, div').each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes('₹') && text.length < 20 && /\d/.test(text)) {
            matches.push(text);
        }
    });
    
    console.log('Unique ₹ matches:', [...new Set(matches)].slice(0, 20));
  } catch(e) {
    console.log('BB Failed:', e.message);
  }
}
scrapeBB();
