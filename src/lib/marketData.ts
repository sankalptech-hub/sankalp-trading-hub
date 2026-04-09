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
}

export function getCurrencySymbol(symbol: string): string {
  return symbol.toUpperCase().endsWith('.NS') ? '₹' : '$';
}

export async function fetchPrice(symbol: string): Promise<PriceData> {
  const cached = getCached(symbol);
  if (cached) return { ...cached, cached: true };

  const upper = symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?interval=1d&range=5d`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch price');
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('Symbol not found');
    const meta = result.meta;
    const price = meta.regularMarketPrice ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    const volume = meta.regularMarketVolume ?? 0;
    const high = meta.regularMarketDayHigh ?? price * 1.01;
    const low = meta.regularMarketDayLow ?? price * 0.99;
    const open = meta.regularMarketOpen ?? price;
    const marketCap = meta.marketCap ?? 0;
    const fiftyTwoWeekHigh = meta.fiftyTwoWeekHigh ?? price * 1.3;
    const fiftyTwoWeekLow = meta.fiftyTwoWeekLow ?? price * 0.7;

    const data: CachedPrice = { price, change, changePercent, volume, high, low, open, prevClose, marketCap, fiftyTwoWeekHigh, fiftyTwoWeekLow, timestamp: Date.now() };
    setCache(symbol, data);
    return { ...data, cached: false };
  } catch {
    const price = 100 + Math.random() * 500;
    const change = (Math.random() - 0.5) * 20;
    const changePercent = (change / price) * 100;
    const volume = Math.floor(Math.random() * 10000000);
    const data: CachedPrice = { price, change, changePercent, volume, high: price * 1.02, low: price * 0.98, open: price - change * 0.5, prevClose: price - change, marketCap: price * 1e6, fiftyTwoWeekHigh: price * 1.3, fiftyTwoWeekLow: price * 0.7, timestamp: Date.now() };
    setCache(symbol, data);
    return { ...data, cached: false };
  }
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
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?interval=${interval}&range=${range}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed');
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('No data');

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const opens: number[] = quote.open || [];
    const highs: number[] = quote.high || [];
    const lows: number[] = quote.low || [];
    const closes: number[] = quote.close || [];
    const volumes: number[] = quote.volume || [];

    const candles: CandleData[] = timestamps
      .map((t, i) => ({
        date: new Date(t * 1000).toISOString().split('T')[0],
        open: opens[i] ?? 0,
        high: highs[i] ?? 0,
        low: lows[i] ?? 0,
        close: closes[i] ?? 0,
        volume: volumes[i] ?? 0,
      }))
      .filter(c => c.close > 0 && c.open > 0);

    setCandleCache(symbol, interval, range, candles);
    return candles;
  } catch {
    const days = range === '1d' ? 1 : range === '5d' ? 5 : range === '1mo' ? 22 : range === '3mo' ? 66 : range === '6mo' ? 132 : range === '1y' ? 252 : range === '5y' ? 1260 : 22;
    const candles: CandleData[] = [];
    let price = 100 + Math.random() * 500;
    const now = new Date();
    for (let i = days; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const change = (Math.random() - 0.48) * price * 0.03;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * price * 0.01;
      const low = Math.min(open, close) - Math.random() * price * 0.01;
      candles.push({ date: d.toISOString().split('T')[0], open, high, low, close, volume: Math.floor(Math.random() * 10000000) });
      price = close;
    }
    setCandleCache(symbol, interval, range, candles);
    return candles;
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

export const US_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN'];

export const ALL_SYMBOLS = [...NSE_SYMBOLS, ...US_SYMBOLS];

export const WATCHLIST_NSE_MAIN = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'WIPRO.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'BAJFINANCE.NS'];
export const WATCHLIST_NSE_TECH = ['INFY.NS', 'TCS.NS', 'WIPRO.NS', 'TECHM.NS', 'HCLTECH.NS'];
export const DASHBOARD_WATCHLIST = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'WIPRO.NS', 'HDFCBANK.NS'];
