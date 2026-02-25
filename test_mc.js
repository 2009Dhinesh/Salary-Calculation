const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeGold() {
  try {
    const res = await axios.get('https://www.moneycontrol.com/news/tags/gold-rate.html', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    console.log('Money Control length:', res.data.length);
  } catch(e) {
    console.log('MoneyControl Failed:', e.message);
  }
}
scrapeGold();
