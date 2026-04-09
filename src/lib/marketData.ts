const CACHE_DURATION = 60000;

interface CachedPrice {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
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
  cached: boolean;
}

export function getCurrencySymbol(symbol: string): string {
  return symbol.toUpperCase().endsWith('.NS') ? '₹' : '$';
}

export async function fetchPrice(symbol: string): Promise<PriceData> {
  const cached = getCached(symbol);
  if (cached) return { ...cached, cached: true };

  const upper = symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?interval=1d&range=1d`;

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

    const data: CachedPrice = { price, change, changePercent, volume, timestamp: Date.now() };
    setCache(symbol, data);
    return { ...data, cached: false };
  } catch {
    // Fallback to demo data
    const price = 100 + Math.random() * 500;
    const change = (Math.random() - 0.5) * 20;
    const changePercent = (change / price) * 100;
    const volume = Math.floor(Math.random() * 10000000);
    const data: CachedPrice = { price, change, changePercent, volume, timestamp: Date.now() };
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
    // Generate mock candle data
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
