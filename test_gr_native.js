const https = require('https');
const cheerio = require('cheerio');

async function scrapeGR() {
  const options = {
    hostname: 'www.goodreturns.in',
    path: '/gold-rates/',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      if (res.statusCode === 200) {
        const $ = cheerio.load(data);
        const firstRow = $('.gold_silver_table td').first().text();
        console.log('Got GR data:', firstRow);
      }
    });
  });

  req.on('error', (e) => console.error(e));
  req.end();
}
scrapeGR();
