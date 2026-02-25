const MetalAsset = require('../models/MetalAsset');
const MetalRate = require('../models/MetalRate');
const axios = require('axios');

// ─── Constants ─────────────────────────────────────────────────
const TROY_OZ_TO_GRAMS = 31.1035;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const API_TIMEOUT = 8000;

// ─── In-Memory Cache ───────────────────────────────────────────
let priceCache = {
  gold: { price24k: 0, price22k: 0, price18k: 0, price14k: 0 },
  silver: { price999: 0, price925: 0 },
  timestamp: 0,
  updatedAt: null,
  source: 'none',
};

const getDateStr = (d = new Date()) => d.toISOString().split('T')[0];

// ─── MULTI-SOURCE WATERFALL PRICE FETCHER ──────────────────────
// Tries multiple APIs in order, returns first successful result

// Source 1: metals.dev (OFFICIAL IBJA RATES — Standard for India)
const tryMetalsDevIBJA = async () => {
  const key = process.env.METALS_DEV_API_KEY;
  if (!key) return null;

  try {
    const res = await axios.get('https://api.metals.dev/v1/metal/authority', {
      params: { api_key: key, authority: 'ibja', unit: 'g' },
      timeout: API_TIMEOUT,
    });

    const goldRate = res.data?.metals?.ibja_gold || res.data?.metals?.gold;
    const silverRate = res.data?.metals?.ibja_silver || res.data?.metals?.silver;

    if (goldRate) {
      const goldPerGram = Math.round(goldRate);
      const silverPerGram = silverRate ? Math.round(silverRate) : 100; // Fallback silver
      return {
        gold: {
          price24k: goldPerGram,
          price22k: Math.round(goldPerGram * 0.916),
          price18k: Math.round(goldPerGram * 0.75),
          price14k: Math.round(goldPerGram * 0.585),
        },
        silver: {
          price999: silverPerGram,
          price925: Math.round(silverPerGram * 0.925),
        },
        source: 'metals.dev (ibja)',
      };
    }
  } catch (err) {
    console.error(`❌ Metals.dev IBJA Source failed: ${err.message}`);
  }
  return null;
};

// Source 2: metals.dev (SPOT RATES — gives price per gram in INR directly)
const tryMetalsDev = async () => {
  const key = process.env.METALS_DEV_API_KEY;
  if (!key) return null;

  const res = await axios.get('https://api.metals.dev/v1/latest', {
    params: { api_key: key, currency: 'INR', unit: 'g' },
    timeout: API_TIMEOUT,
  });

  if (res.data?.metals?.gold && res.data?.metals?.silver) {
    const goldPerGram = Math.round(res.data.metals.gold); // Already INR/gram
    const silverPerGram = Math.round(res.data.metals.silver);
    return {
      gold: {
        price24k: goldPerGram,
        price22k: Math.round(goldPerGram * 0.916), // 22K = 91.6% pure
        price18k: Math.round(goldPerGram * 0.75),  // 18K = 75% pure
        price14k: Math.round(goldPerGram * 0.585),  // 14K = 58.5% pure
      },
      silver: {
        price999: silverPerGram,
        price925: Math.round(silverPerGram * 0.925),
      },
      source: 'metals.dev',
    };
  }
  return null;
};

// Source 2: GoldAPI.io (gives price_gram_22k etc directly)
const tryGoldApi = async () => {
  const key = process.env.GOLD_API_KEY;
  if (!key) return null;

  const [goldRes, silverRes] = await Promise.allSettled([
    axios.get('https://www.goldapi.io/api/XAU/INR', {
      headers: { 'x-access-token': key }, timeout: API_TIMEOUT,
    }),
    axios.get('https://www.goldapi.io/api/XAG/INR', {
      headers: { 'x-access-token': key }, timeout: API_TIMEOUT,
    }),
  ]);

  let gold = null, silver = null;

  if (goldRes.status === 'fulfilled' && goldRes.value?.data?.price_gram_24k) {
    const g = goldRes.value.data;
    gold = {
      price24k: Math.round(g.price_gram_24k),
      price22k: Math.round(g.price_gram_22k || g.price_gram_24k * 0.916),
      price18k: Math.round(g.price_gram_18k || g.price_gram_24k * 0.75),
      price14k: Math.round(g.price_gram_24k * 0.585),
    };
  }

  if (silverRes.status === 'fulfilled' && silverRes.value?.data?.price_gram_24k) {
    const s = silverRes.value.data;
    silver = {
      price999: Math.round(s.price_gram_24k),
      price925: Math.round(s.price_gram_24k * 0.925),
    };
  }

  if (gold || silver) {
    return { gold, silver, source: 'goldapi.io' };
  }
  return null;
};

// Source 3: metals-api.com (gives rate in base currency per 1 XAU)
const tryMetalsApi = async () => {
  const key = process.env.METALS_API_KEY;
  if (!key) return null;

  const res = await axios.get('https://metals-api.com/api/latest', {
    params: { access_key: key, base: 'INR', symbols: 'XAU,XAG' },
    timeout: API_TIMEOUT,
  });

  if (res.data?.success && res.data?.rates) {
    const xauRate = res.data.rates?.XAU;
    const xagRate = res.data.rates?.XAG;

    if (xauRate && xagRate) {
      const goldPerGram24k = Math.round(xauRate / TROY_OZ_TO_GRAMS);
      const silverPerGram999 = Math.round(xagRate / TROY_OZ_TO_GRAMS);

      return {
        gold: {
          price24k: goldPerGram24k,
          price22k: Math.round(goldPerGram24k * 0.916),
          price18k: Math.round(goldPerGram24k * 0.75),
          price14k: Math.round(goldPerGram24k * 0.585),
        },
        silver: {
          price999: silverPerGram999,
          price925: Math.round(silverPerGram999 * 0.925),
        },
        source: 'metals-api.com',
      };
    }
  }
  return null;
};

// Source 3.5: Free Open Currency API (Spot Rate converted to Indian Retail)
const tryOpenCurrencyApi = async () => {
  try {
    const res = await axios.get('https://latest.currency-api.pages.dev/v1/currencies/inr.json', { timeout: API_TIMEOUT });
    if (res.data?.inr?.xau && res.data?.inr?.xag) {
      const xauToInr = 1 / res.data.inr.xau; // 1 oz Gold in INR
      const xagToInr = 1 / res.data.inr.xag; // 1 oz Silver in INR
      
      const spotGoldPerGram = xauToInr / 31.1035;
      const spotSilverPerGram = xagToInr / 31.1035;

      // Indian Retail Premium including Custom Duty + GST + Making Charge overheads
      // Based on comparison, Indian 24K is roughly 6.63% above global spot
      const retailGoldPerGram = spotGoldPerGram * 1.0663;

      const price24k = Math.round(retailGoldPerGram);
      const price22k = Math.round(retailGoldPerGram * 0.916);
      const price18k = Math.round(retailGoldPerGram * 0.75);
      const price14k = Math.round(retailGoldPerGram * 0.585);

      // Silver in India has a slightly different premium
      const price999 = Math.round(spotSilverPerGram * 1.15) > 85 ? Math.round(spotSilverPerGram * 1.15) : 105; 
      
      return {
        gold: { price24k, price22k, price18k, price14k },
        silver: { price999, price925: Math.round(price999 * 0.925) },
        source: 'Currency-API (Market Spot + Premium)'
      };
    }
  } catch (err) {
    console.error(`❌ Currency API Source failed: ${err.message}`);
  }
  return null;
};

// Source 4: Database fallback (last stored rate)
const tryDatabaseFallback = async () => {
  const [goldRate, silverRate] = await Promise.all([
    MetalRate.findOne({ metalType: 'gold' }).sort({ date: -1, createdAt: -1 }),
    MetalRate.findOne({ metalType: 'silver' }).sort({ date: -1, createdAt: -1 }),
  ]);

  if (goldRate || silverRate) {
    return {
      gold: goldRate ? {
        price24k: goldRate.rate24k || goldRate.rate,
        price22k: goldRate.rate22k || Math.round((goldRate.rate24k || goldRate.rate) * 0.916),
        price18k: goldRate.rate18k || Math.round((goldRate.rate24k || goldRate.rate) * 0.75),
        price14k: Math.round((goldRate.rate24k || goldRate.rate) * 0.585),
      } : null,
      silver: silverRate ? {
        price999: silverRate.rate999 || silverRate.rate,
        price925: silverRate.rate925 || Math.round((silverRate.rate999 || silverRate.rate) * 0.925),
      } : null,
      source: `db-fallback (${goldRate?.date || silverRate?.date})`,
    };
  }
  return null;
};

// ─── Main Price Fetcher (Waterfall & Smart DB Logic) ──────────
// This function strictly follows: API 1 -> API 2 -> API 3 -> DB Fallback
const updateMetalRates = async (forceSync = false) => {
  const today = getDateStr();
  
  // 1. Check if today's data already exists in DB (Smart Optimization)
  if (!forceSync) {
    const todayGold = await MetalRate.findOne({ metalType: 'gold', date: today });
    const todaySilver = await MetalRate.findOne({ metalType: 'silver', date: today });
    
    if (todayGold && todaySilver) {
      console.log(`✅ Today's rates (${today}) already exist in DB. Skipping API calls.`);
      return {
        gold: { price24k: todayGold.rate24k, price22k: todayGold.rate22k, price18k: todayGold.rate18k, price14k: todayGold.rate14k || Math.round(todayGold.rate24k * 0.585) },
        silver: { price999: todaySilver.rate999, price925: todaySilver.rate925 },
        source: todayGold.source,
        updatedAt: todayGold.updatedAt
      };
    }
  }

  console.log(`🔄 [${new Date().toLocaleTimeString()}] Fetching new rates for ${today}...`);

  // 2. Waterfall API Strategy
  const sources = [
    { name: 'metals.dev (ibja)', fn: tryMetalsDevIBJA },
    { name: 'metals.dev (spot)', fn: tryMetalsDev },
    { name: 'goldapi.io', fn: tryGoldApi },
    { name: 'metals-api.com', fn: tryMetalsApi },
    { name: 'open-currency-api', fn: tryOpenCurrencyApi }, // Reliable FREE LIVE provider
    { name: 'database', fn: tryDatabaseFallback }, // Final safety fallback
  ];

  let result = null;
  for (const src of sources) {
    try {
      result = await src.fn();
      if (result) {
        console.log(`✅ Success Source: ${src.name}`);
        break;
      }
    } catch (err) {
      console.error(`❌ Source failed (${src.name}): ${err.message}`);
    }
  }

  if (!result) {
    console.error('🚨 ALL metal sources failed. System using hardcoded emergency safety values.');
    result = {
      // Rates as of Feb 24, 2026 (Coimbatore Market)
      gold: { price24k: 16244, price22k: 14890, price18k: 12730, price14k: 9503 },
      silver: { price999: 105, price925: 97 },
      source: 'Coimbatore Market'
    };
  }

  // 3. Store in DB (Upsert)
  await Promise.allSettled([
    MetalRate.findOneAndUpdate(
      { metalType: 'gold', date: today },
      {
        metalType: 'gold', date: today, source: result.source,
        rate: result.gold.price22k,
        rate24k: result.gold.price24k,
        rate22k: result.gold.price22k,
        rate18k: result.gold.price18k,
        rate14k: result.gold.price14k,
      },
      { upsert: true, new: true }
    ),
    MetalRate.findOneAndUpdate(
      { metalType: 'silver', date: today },
      {
        metalType: 'silver', date: today, source: result.source,
        rate: result.silver.price999,
        rate999: result.silver.price999,
        rate925: result.silver.price925,
      },
      { upsert: true, new: true }
    ),
  ]);

  return { ...result, updatedAt: new Date().toISOString() };
};

// ─── Daily Change Calculation ──────────────────────────────────
const getDailyChange = async () => {
  const today = getDateStr();

  const [goldToday, goldPrev, silverToday, silverPrev] = await Promise.all([
    MetalRate.findOne({ metalType: 'gold', date: today }),
    MetalRate.findOne({ metalType: 'gold', date: { $lt: today } }).sort({ date: -1 }),
    MetalRate.findOne({ metalType: 'silver', date: today }),
    MetalRate.findOne({ metalType: 'silver', date: { $lt: today } }).sort({ date: -1 }),
  ]);

  const calcChange = (todayRate, prevRate) => {
    if (!todayRate || !prevRate) return { change: 0, changePercent: '0.0', direction: 'none', prevRate: 0 };
    const diff = todayRate.rate - prevRate.rate;
    const pct = prevRate.rate > 0 ? ((diff / prevRate.rate) * 100).toFixed(2) : '0.0';
    return {
      change: diff,
      changePercent: pct,
      direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'none',
      prevRate: prevRate.rate,
      prevDate: prevRate.date,
    };
  };

  return {
    gold: calcChange(goldToday, goldPrev),
    silver: calcChange(silverToday, silverPrev),
  };
};

// ─── Rate for specific purity ──────────────────────────────────
const getRateForAsset = (prices, metalType, purity) => {
  const gold = prices.gold || prices; // handle both object structures
  const silver = prices.silver || prices;

  if (metalType === 'gold') {
    switch (purity) {
      case '24K': return gold.price24k;
      case '22K': case '916': return gold.price22k;
      case '18K': return gold.price18k;
      case '14K': return gold.price14k;
      default: return gold.price22k;
    }
  } else {
    switch (purity) {
      case '925': return silver.price925;
      default: return silver.price999;
    }
  }
};

// ═══════════════════════════════════════════════════════════════
//  CONTROLLERS
// ═══════════════════════════════════════════════════════════════

// @desc    Get live prices + daily change + API status
// @route   GET /api/metals/prices (or /api/metals/today)
const getMetalPrices = async (req, res, next) => {
  try {
    const result = await updateMetalRates(); // Automatically checks DB first
    const dailyChange = await getDailyChange();

    const configuredSources = [];
    if (process.env.METALS_DEV_API_KEY) configuredSources.push('metals.dev');
    if (process.env.GOLD_API_KEY) configuredSources.push('goldapi.io');
    if (process.env.METALS_API_KEY) configuredSources.push('metals-api.com');

    res.json({
      success: true,
      gold: result.gold,
      silver: result.silver,
      updatedAt: result.updatedAt,
      source: result.source,
      configuredSources,
      hasApiKey: configuredSources.length > 0,
      dailyChange,
      date: getDateStr(),
    });
  } catch (error) { next(error); }
};

// @desc    Get rate history
// @route   GET /api/metals/history?days=7&metalType=gold
const getRateHistory = async (req, res, next) => {
  try {
    const { days = 7, metalType } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const startStr = getDateStr(startDate);

    const filter = { date: { $gte: startStr } };
    if (metalType) filter.metalType = metalType;

    const history = await MetalRate.find(filter).sort({ date: 1, metalType: 1 });

    res.json({
      success: true,
      gold: history.filter(h => h.metalType === 'gold').map(h => ({ date: h.date, rate: h.rate, rate24k: h.rate24k, rate22k: h.rate22k })),
      silver: history.filter(h => h.metalType === 'silver').map(h => ({ date: h.date, rate: h.rate, rate999: h.rate999, rate925: h.rate925 })),
      days: parseInt(days),
    });
  } catch (error) { next(error); }
};

// @desc    Get all metal holdings
// @route   GET /api/metals
const getMetalAssets = async (req, res, next) => {
  try {
    const filter = { user: req.user._id };
    if (req.query.metalType) filter.metalType = req.query.metalType;

    const assets = await MetalAsset.find(filter)
      .populate('account', 'name icon color bankName bankLogo')
      .sort({ purchaseDate: -1 });

    const prices = await updateMetalRates();
    const dailyChange = await getDailyChange();

    const enriched = assets.map(a => {
      const doc = a.toObject();
      const rate = getRateForAsset(prices, a.metalType, a.purity);
      doc.currentPricePerGram = rate;
      doc.currentValue = Math.round(a.weightGrams * rate);
      doc.profitLoss = doc.currentValue - a.purchasePrice;
      doc.profitLossPercent = a.purchasePrice > 0
        ? ((doc.profitLoss / a.purchasePrice) * 100).toFixed(1) : '0.0';
      return doc;
    });

    const goldSummary = {
      totalWeight: parseFloat(enriched.filter(a => a.metalType === 'gold').reduce((s, a) => s + a.weightGrams, 0).toFixed(3)),
      totalInvested: enriched.filter(a => a.metalType === 'gold').reduce((s, a) => s + a.purchasePrice, 0),
      totalCurrentValue: enriched.filter(a => a.metalType === 'gold').reduce((s, a) => s + a.currentValue, 0),
    };

    const silverSummary = {
      totalWeight: parseFloat(enriched.filter(a => a.metalType === 'silver').reduce((s, a) => s + a.weightGrams, 0).toFixed(3)),
      totalInvested: enriched.filter(a => a.metalType === 'silver').reduce((s, a) => s + a.purchasePrice, 0),
      totalCurrentValue: enriched.filter(a => a.metalType === 'silver').reduce((s, a) => s + a.currentValue, 0),
    };

    res.json({
      success: true,
      assets: enriched,
      summary: {
        gold: { ...goldSummary, totalProfitLoss: goldSummary.totalCurrentValue - goldSummary.totalInvested },
        silver: { ...silverSummary, totalProfitLoss: silverSummary.totalCurrentValue - silverSummary.totalInvested },
        combined: {
          totalInvested: goldSummary.totalInvested + silverSummary.totalInvested,
          totalCurrentValue: goldSummary.totalCurrentValue + silverSummary.totalCurrentValue,
          totalProfitLoss: (goldSummary.totalCurrentValue + silverSummary.totalCurrentValue) - (goldSummary.totalInvested + silverSummary.totalInvested),
          count: enriched.length,
        }
      },
      prices: {
        gold: prices.gold,
        silver: prices.silver,
        updatedAt: prices.updatedAt,
        source: prices.source,
      },
      dailyChange,
    });
  } catch (error) { next(error); }
};

// @desc    Add metal asset
const addMetalAsset = async (req, res, next) => {
  try {
    const asset = await MetalAsset.create({ ...req.body, user: req.user._id });
    await asset.populate('account', 'name icon color bankName bankLogo');
    res.status(201).json({ success: true, asset });
  } catch (error) { next(error); }
};

// @desc    Update metal asset
const updateMetalAsset = async (req, res, next) => {
  try {
    const asset = await MetalAsset.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    ).populate('account', 'name icon color bankName bankLogo');
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    res.json({ success: true, asset });
  } catch (error) { next(error); }
};

// @desc    Delete metal asset
const deleteMetalAsset = async (req, res, next) => {
  try {
    const asset = await MetalAsset.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    res.json({ success: true, message: 'Asset deleted' });
  } catch (error) { next(error); }
};

// @desc    Smart Calculator - Returns both Gold and Silver equivalents for an amount
const metalCalculator = async (req, res, next) => {
  try {
    const { amount } = req.query;
    if (!amount) return res.status(400).json({ success: false, message: 'Amount is required' });

    const prices = await updateMetalRates();

    // Gold Calculation (22K standard for calculation)
    const goldRate = getRateForAsset(prices, 'gold', '22K');
    const goldGrams = parseFloat(amount) / goldRate;

    // Silver Calculation (999 standard)
    const silverRate = getRateForAsset(prices, 'silver', '999');
    const silverGrams = parseFloat(amount) / silverRate;

    res.json({
      success: true,
      amount: parseFloat(amount),
      gold: {
        purity: '22K',
        pricePerGram: goldRate,
        grams: parseFloat(goldGrams.toFixed(3))
      },
      silver: {
        purity: '999',
        pricePerGram: silverRate,
        grams: parseFloat(silverGrams.toFixed(3))
      }
    });
  } catch (error) { next(error); }
};

module.exports = {
  updateMetalRates, // For Cron
  getMetalPrices, 
  getRateHistory, 
  getMetalAssets,
  addMetalAsset, 
  updateMetalAsset, 
  deleteMetalAsset, 
  metalCalculator,
};
