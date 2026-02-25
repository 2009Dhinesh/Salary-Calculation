const axios = require('axios');

async function testApi() {
  const res = await axios.get('https://latest.currency-api.pages.dev/v1/currencies/inr.json');
  const inrToXau = res.data.inr.xau;
  const inrToXag = res.data.inr.xag;
  const inrToUsd = res.data.inr.usd;
  
  // 1 INR = inrToXau XAU
  // 1 XAU = 1 / inrToXau INR
  const xauInInr = 1 / inrToXau;
  const xagInInr = 1 / inrToXag;
  
  console.log('1 XAU in INR:', xauInInr);
  console.log('1 XAG in INR:', xagInInr);
  console.log('USD to INR:', 1 / inrToUsd);

  // Per gram
  const goldPerGram = xauInInr / 31.1035;
  const silverPerGram = xagInInr / 31.1035;
  console.log('24k Spot:', goldPerGram);
  console.log('Silver Spot:', silverPerGram);
}
testApi();
