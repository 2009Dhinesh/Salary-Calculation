const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeBankBazaar() {
  try {
    const res = await axios.get('https://www.bankbazaar.com/gold-rate-india.html', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000
    });
    
    const $ = cheerio.load(res.data);
    let gold24k = 0;
    let gold22k = 0;

    // BankBazaar usually stores 1 gram price in a table with text "1 gram"
    // We can search for all td elements
    const tds = $('td').toArray();
    for (let i = 0; i < tds.length; i++) {
        const text = $(tds[i]).text().trim();
        if (text === '1 Gram' || text === '1 gram') {
            // Check next siblings for 24K and 22K
            const nextVals = [
                $(tds[i+1]).text().trim(),
                $(tds[i+2]).text().trim(),
                $(tds[i+3]).text().trim()
            ];
            
            for (let val of nextVals) {
                if (val && val.includes('₹') && !val.includes('Karat')) {
                    const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
                    // 1 gram price should be around 12000 - 18000
                    if (num > 10000 && num < 20000) {
                        if (!gold24k) gold24k = num; // Usually 24K comes first
                        else if (!gold22k && num < gold24k) gold22k = num; // Then 22K which is lower
                    }
                }
            }
        }
    }
    console.log('BankBazaar Scraped:', { gold24k, gold22k });
  } catch(e) {
    console.log('Failed BB:', e.message);
  }
}
scrapeBankBazaar();
