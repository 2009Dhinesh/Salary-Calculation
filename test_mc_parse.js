const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeMC() {
  try {
    const res = await axios.get('https://www.moneycontrol.com/news/tags/gold-rate.html', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const $ = cheerio.load(res.data);
    // Let's just grab any numbers closely related to gold if possible. 
    // Actually moneycontrol commodities page is better:
  } catch(e) {}
}

async function scrapeMCCommodity() {
  try {
    const res = await axios.get('https://www.moneycontrol.com/commodity/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const $ = cheerio.load(res.data);
    
    // We want the current gold price. Moneycontrol shows MCX Gold (which is per 10 gram 24K)
    const goldText = $('a:contains("GOLD")').closest('tr').text().replace(/\s+/g, ' ');
    const silverText = $('a:contains("SILVER")').closest('tr').text().replace(/\s+/g, ' ');
    
    console.log('Gold Row:', goldText);
    console.log('Silver Row:', silverText);
  } catch(e) {
    console.log('MC Failed:', e.message);
  }
}

scrapeMCCommodity();
