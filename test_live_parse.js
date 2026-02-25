const axios = require('axios');
const cheerio = require('cheerio');

async function testLiveChennai() {
  try {
    const res = await axios.get('https://www.livechennai.com/gold_silverrate.asp', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(res.data);
    
    // We want the first table that contains "22 Carat" or "24 Carat"
    const tables = $('table').toArray();
    let result = null;
    tables.forEach(table => {
      const text = $(table).text();
      if (text.includes('22 Carat Gold') || text.includes('1 gram')) {
        console.log('TABLE MATCH:', text.replace(/\s+/g, ' ').substring(0, 300));
      }
    });

  } catch(e) {
    console.log('LiveChennai Failed:', e.message);
  }
}
testLiveChennai();
