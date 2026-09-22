import { groww, toGrowwSymbol } from '@/lib/growwService';

// Mirrors the same fallback client.ts uses (src/integrations/supabase/client.ts)
// — this deployment's Vercel project has VITE_SUPABASE_ANON_KEY set, not
// VITE_SUPABASE_PUBLISHABLE_KEY, so reading only the latter here (as this
// file previously did) silently produced an empty string: an empty
// Authorization/apikey header, which Supabase's edge-function gateway
// rejects as UNAUTHORIZED_INVALID_JWT_FORMAT. Also strips stray wrapping
// quotes/whitespace defensively in case the value is ever pasted in dirty.
function getAnonKey(): string {
  const raw = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  return raw.trim().replace(/^['"]|['"]$/g, '');
}

const CACHE_DURATION = 60000;

interface CachedPrice {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  marketCap: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  timestamp: number;
  source: 'groww' | 'yahoo';
}

function getCacheKey(symbol: string) {
  return `yf_price_${symbol.toUpperCase()}`;
}

function getCached(symbol: string): CachedPrice | null {
  try {
    const raw = localStorage.getItem(getCacheKey(symbol));
    if (!raw) return null;
    const cached: CachedPrice = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_DURATION) return null;
    return cached;
  } catch {
    return null;
  }
}

function setCache(symbol: string, data: CachedPrice) {
  localStorage.setItem(getCacheKey(symbol), JSON.stringify(data));
}

export interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  marketCap: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  cached: boolean;
  /** Real live data from the user's connected Groww account, or Yahoo's ~15min-delayed feed as fallback */
  source: 'groww' | 'yahoo';
}

export function getCurrencySymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.NS') || upper.endsWith('.BO')) return '₹';
  if (upper.endsWith('.L')) return '£';
  if (upper.endsWith('.DE')) return '€';
  if (upper.endsWith('.AX')) return 'A$';
  if (upper.endsWith('.HK')) return 'HK$';
  if (upper.endsWith('.SI')) return 'S$';
  return '$';
}

export class PriceFetchError extends Error {
  constructor(message: string, public symbol: string) {
    super(message);
    this.name = 'PriceFetchError';
  }
}

async function fetchPriceFromGroww(upper: string): Promise<CachedPrice | null> {
  const growwSymbol = toGrowwSymbol(upper);
  if (!growwSymbol) return null; // not an NSE/BSE symbol — Groww can't serve it
  try {
    const res = await groww.quote(growwSymbol.exchange, growwSymbol.tradingSymbol);
    if (res.error || !res.data || typeof res.data.last_price !== 'number') return null;
    const q = res.data;
    const price = q.last_price;
    const change = q.day_change ?? 0;
    return {
      price,
      change,
      changePercent: q.day_change_perc ?? 0,
      volume: q.volume ?? 0,
      high: q.ohlc?.high ?? price,
      low: q.ohlc?.low ?? price,
      open: q.ohlc?.open ?? price,
      prevClose: price - change,
      marketCap: q.market_cap ?? 0,
      fiftyTwoWeekHigh: q.week_52_high ?? price,
      fiftyTwoWeekLow: q.week_52_low ?? price,
      timestamp: Date.now(),
      source: 'groww',
    };
  } catch {
    return null;
  }
}

async function fetchPriceFromYahoo(upper: string): Promise<CachedPrice> {
  // Call the edge function URL directly with query params (functions.invoke doesn't
  // pass query strings cleanly for GET requests).
  const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-price`;
  const anonKey = getAnonKey();

  try {
    const resp = await fetch(`${functionsUrl}?symbol=${encodeURIComponent(upper)}&mode=quote`, {
      headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    });
    const json = await resp.json();

    if (!resp.ok || json.error) {
      throw new PriceFetchError(json.error ?? `Request failed (${resp.status})`, upper);
    }

    return {
      price: json.price,
      change: json.change,
      changePercent: json.changePercent,
      volume: json.volume,
      high: json.high,
      low: json.low,
      open: json.open,
      prevClose: json.prevClose,
      marketCap: json.marketCap,
      fiftyTwoWeekHigh: json.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: json.fiftyTwoWeekLow,
      timestamp: Date.now(),
      source: 'yahoo',
    };
  } catch (e) {
    if (e instanceof PriceFetchError) throw e;
    throw new PriceFetchError(`Network error fetching ${upper}`, upper);
  }
}

// Real data from the user's own connected Groww account when possible (NSE/BSE
// symbols only); falls back to Yahoo's ~15min-delayed feed for everyone else
// (not connected, or a non-Indian symbol Groww can't serve).
export async function fetchPrice(symbol: string): Promise<PriceData> {
  const cached = getCached(symbol);
  if (cached) return { ...cached, cached: true };

  const upper = symbol.toUpperCase();
  const data = (await fetchPriceFromGroww(upper)) ?? (await fetchPriceFromYahoo(upper));
  setCache(symbol, data);
  return { ...data, cached: false };
}

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const CANDLE_CACHE_DURATION = 60000;

function getCandleCacheKey(symbol: string, interval: string, range: string) {
  return `yf_candle_${symbol.toUpperCase()}_${interval}_${range}`;
}

function getCachedCandles(symbol: string, interval: string, range: string): CandleData[] | null {
  try {
    const raw = localStorage.getItem(getCandleCacheKey(symbol, interval, range));
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CANDLE_CACHE_DURATION) return null;
    return data;
  } catch {
    return null;
  }
}

function setCandleCache(symbol: string, interval: string, range: string, data: CandleData[]) {
  localStorage.setItem(getCandleCacheKey(symbol, interval, range), JSON.stringify({ data, timestamp: Date.now() }));
}

// Groww's range params are absolute start/end timestamps, not Yahoo-style
// range buckets — approximate each Yahoo range as a number of trailing days.
const RANGE_TO_DAYS: Record<string, number> = {
  '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180,
  '1y': 365, '2y': 730, '5y': 1825, '10y': 3650, 'ytd': 365, 'max': 3650,
};

function growwTimeWindow(range: string): { startTime: string; endTime: string } {
  const days = RANGE_TO_DAYS[range] ?? 90;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { startTime: fmt(start), endTime: fmt(end) };
}

async function fetchCandlesFromGroww(upper: string, interval: string, range: string): Promise<CandleData[] | null> {
  if (interval !== '1d') return null; // only daily candles are wired up
  const growwSymbol = toGrowwSymbol(upper);
  if (!growwSymbol) return null;
  try {
    const { startTime, endTime } = growwTimeWindow(range);
    const res = await groww.candles(growwSymbol.exchange, growwSymbol.tradingSymbol, startTime, endTime, 1440);
    if (res.error || !res.data?.candles?.length) return null;
    return res.data.candles.map(([ts, open, high, low, close, volume]) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      open, high, low, close, volume,
    }));
  } catch {
    return null;
  }
}

// Real data from the user's own connected Groww account when possible (daily
// candles, NSE/BSE symbols only); falls back to Yahoo otherwise.
export async function fetchCandleData(
  symbol: string,
  interval = '1d',
  range = '1mo',
  forceRefresh = false
): Promise<CandleData[]> {
  if (!forceRefresh) {
    const cached = getCachedCandles(symbol, interval, range);
    if (cached) return cached;
  }

  const upper = symbol.toUpperCase();

  const growwCandles = await fetchCandlesFromGroww(upper, interval, range);
  if (growwCandles) {
    setCandleCache(symbol, interval, range, growwCandles);
    return growwCandles;
  }

  const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-price`;
  const anonKey = getAnonKey();

  try {
    const resp = await fetch(
      `${functionsUrl}?symbol=${encodeURIComponent(upper)}&mode=candles&interval=${interval}&range=${range}`,
      { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } }
    );
    const json = await resp.json();

    if (!resp.ok || json.error) {
      throw new PriceFetchError(json.error ?? `Request failed (${resp.status})`, upper);
    }

    const candles: CandleData[] = json.candles ?? [];
    setCandleCache(symbol, interval, range, candles);
    return candles;
  } catch (e) {
    if (e instanceof PriceFetchError) throw e;
    throw new PriceFetchError(`Network error fetching candles for ${upper}`, upper);
  }
}

export async function fetchPriceHistory(symbol: string, range = '1mo'): Promise<{ close: number; date: string }[]> {
  const candles = await fetchCandleData(symbol, '1d', range);
  return candles.map(c => ({ close: c.close, date: c.date }));
}

// Technical indicator computations
export function computeSMA(data: CandleData[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((s, c) => s + c.close, 0) / period;
  });
}

export function computeEMA(closes: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  result[0] = closes[0];
  for (let i = 1; i < closes.length; i++) result[i] = closes[i] * k + result[i - 1] * (1 - k);
  return result;
}

export function computeRSI(data: CandleData[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period + 1) return rsi;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

export function computeMACD(data: CandleData[]) {
  const closes = data.map(c => c.close);
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = computeEMA(macdLine, 9);
  return data.map((_, i) => ({
    macd: i >= 25 ? macdLine[i] : null,
    signal: i >= 33 ? signal[i] : null,
    histogram: i >= 33 ? macdLine[i] - signal[i] : null,
  }));
}

export function computeBollingerBands(data: CandleData[], period = 20, stdDevMultiplier = 2) {
  return data.map((_, i) => {
    if (i < period - 1) return { upper: null, middle: null, lower: null };
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, c) => s + c.close, 0) / period;
    const variance = slice.reduce((s, c) => s + Math.pow(c.close - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return {
      upper: mean + stdDevMultiplier * stdDev,
      middle: mean,
      lower: mean - stdDevMultiplier * stdDev,
    };
  });
}

export function computeVWAP(data: CandleData[]) {
  let cumVolPrice = 0;
  let cumVol = 0;
  return data.map(c => {
    const tp = (c.high + c.low + c.close) / 3;
    cumVolPrice += tp * c.volume;
    cumVol += c.volume;
    return cumVol > 0 ? cumVolPrice / cumVol : null;
  });
}

export function computeATR(data: CandleData[], period = 14): (number | null)[] {
  const trueRanges: number[] = data.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = data[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = trueRanges.slice(i - period + 1, i + 1);
    return slice.reduce((s, v) => s + v, 0) / period;
  });
}

export function computeStochastic(data: CandleData[], period = 14): { k: number | null; d: number | null }[] {
  const kValues: (number | null)[] = data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    const low = Math.min(...slice.map(c => c.low));
    const high = Math.max(...slice.map(c => c.high));
    if (high === low) return 50;
    return ((data[i].close - low) / (high - low)) * 100;
  });
  const dValues: (number | null)[] = kValues.map((_, i) => {
    if (i < period + 1) return null;
    const slice = kValues.slice(i - 2, i + 1).filter(v => v !== null) as number[];
    return slice.length === 3 ? slice.reduce((s, v) => s + v, 0) / 3 : null;
  });
  return data.map((_, i) => ({ k: kValues[i], d: dValues[i] }));
}

export function findSupportResistance(data: CandleData[], lookback = 20): { supports: number[]; resistances: number[] } {
  if (data.length < lookback) return { supports: [], resistances: [] };
  const recent = data.slice(-lookback);
  const prices = recent.flatMap(c => [c.high, c.low]);
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: number[][] = [];
  let cluster: number[] = [sorted[0]];
  const threshold = (sorted[sorted.length - 1] - sorted[0]) * 0.02;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] < threshold) cluster.push(sorted[i]);
    else { clusters.push(cluster); cluster = [sorted[i]]; }
  }
  clusters.push(cluster);
  const levels = clusters
    .filter(c => c.length >= 3)
    .map(c => c.reduce((s, v) => s + v, 0) / c.length);
  const lastClose = data[data.length - 1].close;
  return {
    supports: levels.filter(l => l < lastClose).slice(-3),
    resistances: levels.filter(l => l > lastClose).slice(0, 3),
  };
}

export const NSE_SYMBOLS = [
  'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'WIPRO.NS',
  'HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS',
  'BAJFINANCE.NS', 'HCLTECH.NS', 'TECHM.NS',
];

export const US_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'NVDA', 'META'];

export const GLOBAL_SYMBOLS = [
  ...NSE_SYMBOLS, ...US_SYMBOLS,
  'SHOP.TO', 'RY.TO', 'TD.TO',
  'VOD.L', 'BP.L', 'AZN.L',
  'BHP.AX', 'CBA.AX',
];

export const ALL_SYMBOLS = GLOBAL_SYMBOLS;

export const WATCHLIST_NSE_MAIN = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'WIPRO.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'BAJFINANCE.NS'];
export const WATCHLIST_NSE_TECH = ['INFY.NS', 'TCS.NS', 'WIPRO.NS', 'TECHM.NS', 'HCLTECH.NS'];
export const WATCHLIST_US_TECH = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA'];
export const WATCHLIST_US_FINANCE = ['JPM', 'BAC', 'GS', 'V', 'MA'];
export const WATCHLIST_CANADA_TSX = ['SHOP.TO', 'RY.TO', 'TD.TO'];
export const WATCHLIST_UK_LSE = ['VOD.L', 'BP.L', 'AZN.L'];
export const WATCHLIST_GLOBAL_ETFS = ['SPY', 'QQQ'];
export const DASHBOARD_WATCHLIST = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'WIPRO.NS', 'HDFCBANK.NS'];

export const FOREX_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CAD', 'AUD/USD', 'USD/INR'];

// ─── Fundamentals ───────────────────────────────────────────────────────────

export interface FundamentalsData {
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  beta: number | null;
  marketCap: number | null;
  trailingEps: number | null;
  forwardEps: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  currentRatio: number | null;
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
  recommendationTrend: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
  sector: string | null;
  industry: string | null;
}

// Fundamentals change slowly (quarterly filings, analyst updates) — cache far
// longer than live price/candle data.
const FUNDAMENTALS_CACHE_DURATION = 4 * 60 * 60 * 1000;

function getFundamentalsCacheKey(symbol: string) {
  return `yf_fund_${symbol.toUpperCase()}`;
}

export async function fetchFundamentals(symbol: string): Promise<FundamentalsData> {
  const upper = symbol.toUpperCase();
  try {
    const raw = localStorage.getItem(getFundamentalsCacheKey(upper));
    if (raw) {
      const { data, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp < FUNDAMENTALS_CACHE_DURATION) return data;
    }
  } catch {
    // ignore cache read errors
  }

  const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-price`;
  const anonKey = getAnonKey();

  const resp = await fetch(`${functionsUrl}?symbol=${encodeURIComponent(upper)}&mode=fundamentals`, {
    headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
  });
  const json = await resp.json();
  if (!resp.ok || json.error) {
    throw new PriceFetchError(json.error ?? `Request failed (${resp.status})`, upper);
  }

  const data: FundamentalsData = json;
  try {
    localStorage.setItem(getFundamentalsCacheKey(upper), JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // ignore cache write errors (e.g. private browsing / storage full)
  }
  return data;
}

// ─── Financial statements (Income Statement / Balance Sheet / Cash Flow) ───

export interface FinancialsData {
  years: string[]; // fiscal year-end dates, ascending, aligned across all series below
  incomeStatement: {
    totalRevenue: (number | null)[];
    grossProfit: (number | null)[];
    operatingIncome: (number | null)[];
    ebitda: (number | null)[];
    netIncome: (number | null)[];
    dilutedEPS: (number | null)[];
  };
  balanceSheet: {
    totalAssets: (number | null)[];
    totalLiabilities: (number | null)[];
    stockholdersEquity: (number | null)[];
    totalDebt: (number | null)[];
    cashAndEquivalents: (number | null)[];
  };
  cashFlow: {
    operatingCashFlow: (number | null)[];
    investingCashFlow: (number | null)[];
    financingCashFlow: (number | null)[];
    capitalExpenditure: (number | null)[];
    freeCashFlow: (number | null)[];
  };
}

function getFinancialsCacheKey(symbol: string) {
  return `yf_financials_${symbol.toUpperCase()}`;
}

export async function fetchFinancials(symbol: string): Promise<FinancialsData> {
  const upper = symbol.toUpperCase();
  try {
    const raw = localStorage.getItem(getFinancialsCacheKey(upper));
    if (raw) {
      const { data, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp < FUNDAMENTALS_CACHE_DURATION) return data;
    }
  } catch {
    // ignore cache read errors
  }

  const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-price`;
  const anonKey = getAnonKey();

  const resp = await fetch(`${functionsUrl}?symbol=${encodeURIComponent(upper)}&mode=financials`, {
    headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
  });
  const json = await resp.json();
  if (!resp.ok || json.error) {
    throw new PriceFetchError(json.error ?? `Request failed (${resp.status})`, upper);
  }

  const data: FinancialsData = json;
  try {
    localStorage.setItem(getFinancialsCacheKey(upper), JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // ignore cache write errors
  }
  return data;
}

// ─── Peers ──────────────────────────────────────────────────────────────────

export const SECTOR_PEERS: Record<string, string[]> = {
  Banking: ['HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'KOTAKBANK.NS', 'AXISBANK.NS'],
  IT: ['TCS.NS', 'INFY.NS', 'WIPRO.NS', 'HCLTECH.NS', 'TECHM.NS'],
  Energy: ['RELIANCE.NS', 'ONGC.NS', 'IOC.NS', 'BPCL.NS'],
  Auto: ['MARUTI.NS', 'TATAMOTORS.NS', 'M&M.NS', 'BAJAJ-AUTO.NS', 'EICHERMOT.NS'],
  Pharma: ['SUNPHARMA.NS', 'DRREDDY.NS', 'CIPLA.NS', 'DIVISLAB.NS', 'APOLLOHOSP.NS'],
  FMCG: ['HINDUNILVR.NS', 'ITC.NS', 'NESTLEIND.NS', 'BRITANNIA.NS', 'DABUR.NS'],
  Metals: ['TATASTEEL.NS', 'JSWSTEEL.NS', 'HINDALCO.NS', 'VEDL.NS'],
  Telecom: ['BHARTIARTL.NS', 'IDEA.NS'],
  'Financial Services': ['BAJFINANCE.NS', 'BAJAJFINSV.NS', 'HDFCLIFE.NS', 'SBILIFE.NS'],
};

// Best-effort mapping from Yahoo's free-text sector/industry strings to our
// curated peer groups — not exhaustive, just enough to show a handful of
// relevant large-cap comparisons for the common NSE sectors.
export function getPeerSymbols(symbol: string, sector: string | null, industry: string | null): string[] {
  const upper = symbol.toUpperCase();
  const haystack = `${sector ?? ''} ${industry ?? ''}`.toLowerCase();
  let peers: string[] = [];
  if (haystack.includes('bank')) peers = SECTOR_PEERS.Banking;
  else if (haystack.includes('software') || haystack.includes('information technology') || haystack.includes('it services')) peers = SECTOR_PEERS.IT;
  else if (haystack.includes('oil') || haystack.includes('energy') || haystack.includes('gas')) peers = SECTOR_PEERS.Energy;
  else if (haystack.includes('auto')) peers = SECTOR_PEERS.Auto;
  else if (haystack.includes('pharma') || haystack.includes('healthcare') || haystack.includes('drug')) peers = SECTOR_PEERS.Pharma;
  else if (haystack.includes('consumer') || haystack.includes('fmcg') || haystack.includes('food') || haystack.includes('household')) peers = SECTOR_PEERS.FMCG;
  else if (haystack.includes('metal') || haystack.includes('steel') || haystack.includes('mining')) peers = SECTOR_PEERS.Metals;
  else if (haystack.includes('telecom')) peers = SECTOR_PEERS.Telecom;
  else if (haystack.includes('financial services')) peers = SECTOR_PEERS['Financial Services'];
  return peers.filter(p => p.toUpperCase() !== upper).slice(0, 5);
}

// ─── Fear & Greed (our own approximation) ──────────────────────────────────

export interface FearGreedResult {
  score: number; // 0-100
  label: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed';
  vix: number | null;
  niftyRsi: number | null;
  niftyVsSma: number | null; // % Nifty close is above(+)/below(-) its 50-day SMA
}

// There is no free, official "Fear & Greed Index" for Indian markets (CNN's
// index is US-only and proprietary). This is our own composite proxy built
// from real, freely available signals — India VIX level (volatility),
// Nifty 50's RSI(14) (momentum), and Nifty vs its 50-day SMA (trend) —
// using the same underlying idea as published fear/greed indices, not a
// reproduction of any specific one. Label it as an estimate wherever shown.
export async function fetchFearGreedIndex(): Promise<FearGreedResult> {
  const [vixData, niftyCandles] = await Promise.all([
    fetchPrice('^INDIAVIX').catch(() => null),
    fetchCandleData('^NSEI', '1d', '3mo').catch(() => [] as CandleData[]),
  ]);

  const vix = vixData?.price ?? null;
  // NSE VIX typically ranges ~10 (calm) to ~35+ (panic); lower VIX -> more greed.
  const vixScore = vix !== null ? Math.max(0, Math.min(100, 100 - ((vix - 10) / 25) * 100)) : 50;

  const rsiSeries = niftyCandles.length > 0 ? computeRSI(niftyCandles, 14) : [];
  const niftyRsi = rsiSeries.filter((v): v is number => v !== null).pop() ?? null;
  const rsiScore = niftyRsi ?? 50;

  const sma50 = niftyCandles.length > 0 ? computeSMA(niftyCandles, 50) : [];
  const lastSma = sma50.filter((v): v is number => v !== null).pop() ?? null;
  const lastClose = niftyCandles.length > 0 ? niftyCandles[niftyCandles.length - 1].close : null;
  const niftyVsSma = lastSma && lastClose ? ((lastClose - lastSma) / lastSma) * 100 : null;
  const momentumScore = niftyVsSma !== null ? Math.max(0, Math.min(100, 50 + niftyVsSma * 5)) : 50;

  const score = Math.round((vixScore + rsiScore + momentumScore) / 3);
  const label: FearGreedResult['label'] =
    score < 25 ? 'Extreme Fear' : score < 45 ? 'Fear' : score < 55 ? 'Neutral' : score < 75 ? 'Greed' : 'Extreme Greed';

  return { score, label, vix, niftyRsi, niftyVsSma };
}
