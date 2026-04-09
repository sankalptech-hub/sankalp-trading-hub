export interface ExchangeInfo {
  name: string;
  timezone: string;
  open: string;
  close: string;
  days: number[];
  currency: string;
  flag: string;
  currencySymbol: string;
}

export const EXCHANGES: Record<string, ExchangeInfo> = {
  NSE: { name: 'NSE India', timezone: 'Asia/Kolkata', open: '09:15', close: '15:30', days: [1,2,3,4,5], currency: 'INR', flag: '🇮🇳', currencySymbol: '₹' },
  BSE: { name: 'BSE India', timezone: 'Asia/Kolkata', open: '09:15', close: '15:30', days: [1,2,3,4,5], currency: 'INR', flag: '🇮🇳', currencySymbol: '₹' },
  NYSE: { name: 'New York Stock Exchange', timezone: 'America/New_York', open: '09:30', close: '16:00', days: [1,2,3,4,5], currency: 'USD', flag: '🇺🇸', currencySymbol: '$' },
  NASDAQ: { name: 'NASDAQ', timezone: 'America/New_York', open: '09:30', close: '16:00', days: [1,2,3,4,5], currency: 'USD', flag: '🇺🇸', currencySymbol: '$' },
  TSX: { name: 'Toronto Stock Exchange', timezone: 'America/Toronto', open: '09:30', close: '16:00', days: [1,2,3,4,5], currency: 'CAD', flag: '🇨🇦', currencySymbol: '$' },
  LSE: { name: 'London Stock Exchange', timezone: 'Europe/London', open: '08:00', close: '16:30', days: [1,2,3,4,5], currency: 'GBP', flag: '🇬🇧', currencySymbol: '£' },
  ASX: { name: 'Australian Securities Exchange', timezone: 'Australia/Sydney', open: '10:00', close: '16:00', days: [1,2,3,4,5], currency: 'AUD', flag: '🇦🇺', currencySymbol: 'A$' },
  HKEX: { name: 'Hong Kong Exchange', timezone: 'Asia/Hong_Kong', open: '09:30', close: '16:00', days: [1,2,3,4,5], currency: 'HKD', flag: '🇭🇰', currencySymbol: 'HK$' },
  XETR: { name: 'Frankfurt/XETRA', timezone: 'Europe/Berlin', open: '09:00', close: '17:30', days: [1,2,3,4,5], currency: 'EUR', flag: '🇩🇪', currencySymbol: '€' },
  SGX: { name: 'Singapore Exchange', timezone: 'Asia/Singapore', open: '09:00', close: '17:00', days: [1,2,3,4,5], currency: 'SGD', flag: '🇸🇬', currencySymbol: 'S$' },
  FOREX: { name: 'Forex Market', timezone: 'UTC', open: '00:00', close: '23:59', days: [1,2,3,4,5], currency: 'USD', flag: '🌐', currencySymbol: '$' },
};

function getTimeInTimezone(tz: string): { hours: number; minutes: number; dayOfWeek: number } {
  const now = new Date();
  const str = now.toLocaleString('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short' });
  const parts = str.split(', ');
  const timeParts = (parts[1] || parts[0]).split(':');
  const dayStr = parts.length > 1 ? parts[0] : '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  
  const hours = parseInt(timeParts[0]) || 0;
  const minutes = parseInt(timeParts[1]) || 0;
  const dayOfWeek = dayMap[dayStr] ?? now.getDay();
  
  return { hours, minutes, dayOfWeek };
}

export function isMarketOpen(exchange: string): boolean {
  const ex = EXCHANGES[exchange];
  if (!ex) return false;
  
  const { hours, minutes, dayOfWeek } = getTimeInTimezone(ex.timezone);
  if (!ex.days.includes(dayOfWeek)) return false;
  
  const [openH, openM] = ex.open.split(':').map(Number);
  const [closeH, closeM] = ex.close.split(':').map(Number);
  
  const currentMinutes = hours * 60 + minutes;
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

export interface MarketStatus {
  exchange: string;
  status: 'open' | 'closed' | 'pre-open';
  localTime: string;
  opensInMinutes?: number;
  closesInMinutes?: number;
  info: ExchangeInfo;
}

export function getMarketStatus(exchange: string): MarketStatus {
  const ex = EXCHANGES[exchange];
  if (!ex) return { exchange, status: 'closed', localTime: '', info: EXCHANGES.NSE };
  
  const { hours, minutes, dayOfWeek } = getTimeInTimezone(ex.timezone);
  const localTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  
  const [openH, openM] = ex.open.split(':').map(Number);
  const [closeH, closeM] = ex.close.split(':').map(Number);
  
  const currentMinutes = hours * 60 + minutes;
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  
  if (!ex.days.includes(dayOfWeek)) {
    return { exchange, status: 'closed', localTime, info: ex };
  }
  
  if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    return { exchange, status: 'open', localTime, closesInMinutes: closeMinutes - currentMinutes, info: ex };
  }
  
  if (currentMinutes < openMinutes && currentMinutes >= openMinutes - 15) {
    return { exchange, status: 'pre-open', localTime, opensInMinutes: openMinutes - currentMinutes, info: ex };
  }
  
  const opensIn = currentMinutes < openMinutes ? openMinutes - currentMinutes : (24 * 60 - currentMinutes) + openMinutes;
  return { exchange, status: 'closed', localTime, opensInMinutes: opensIn, info: ex };
}

export function getExchangeForSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.NS')) return 'NSE';
  if (upper.endsWith('.BO')) return 'BSE';
  if (upper.endsWith('.L')) return 'LSE';
  if (upper.endsWith('.AX')) return 'ASX';
  if (upper.endsWith('.TO')) return 'TSX';
  if (upper.endsWith('.HK')) return 'HKEX';
  if (upper.endsWith('.DE')) return 'XETR';
  if (upper.endsWith('.SI')) return 'SGX';
  if (upper.includes('_') || upper.includes('/')) return 'FOREX';
  return 'NASDAQ'; // default US
}

export function getCurrencySymbolForExchange(exchange: string): string {
  return EXCHANGES[exchange]?.currencySymbol || '$';
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
