const axios = require('axios');
const cheerio = require('cheerio');

async function testAllOrigins() {
  try {
    const targetUrl = encodeURIComponent('https://www.goodreturns.in/gold-rates/');
    const res = await axios.get(`https://api.allorigins.win/get?url=${targetUrl}`);
    const html = res.data.contents;
    const $ = cheerio.load(html);
    
    // Scrape data
    // Assuming structure based on standard goodreturns tables
    console.log('HTML Length:', html.length);
    let success = false;
    $('.gold_silver_table').each((i, el) => {
        const text = $(el).text();
        if (text && text.includes('24K')) {
            console.log('Found table:', text.substring(0, 100).replace(/\s+/g, ' '));
            success = true;
        }
    });
    // Another selector:
    if (!success) {
      console.log('Trying .money-bill');
      console.log($('.gold_silver_table td').first().text());
    }
  } catch(e) {
    console.log('AllOrigins Failed:', e.message);
  }
}
testAllOrigins();
