const CACHE_DURATION = 60000; // 60 seconds

interface CachedPrice {
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

function getCacheKey(symbol: string) {
  return `symbol_price_${symbol.toUpperCase()}`;
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
  cached: boolean;
}

export async function fetchPrice(symbol: string, apiKey: string): Promise<PriceData> {
  const cached = getCached(symbol);
  if (cached) return { ...cached, cached: true };

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol.toUpperCase())}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch price');
  const json = await res.json();
  const quote = json['Global Quote'];
  if (!quote || !quote['05. price']) throw new Error('Symbol not found');

  const data: CachedPrice = {
    price: parseFloat(quote['05. price']),
    change: parseFloat(quote['09. change']),
    changePercent: parseFloat(quote['10. change percent']?.replace('%', '') || '0'),
    timestamp: Date.now(),
  };
  setCache(symbol, data);
  return { ...data, cached: false };
}
