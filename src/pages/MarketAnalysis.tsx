import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart as LineIcon, Globe } from 'lucide-react';

const TVWidget = ({ kind }: { kind: 'heatmap' | 'forex' | 'ticker' | 'screener' }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const c = document.createElement('div');
    c.className = 'tradingview-widget-container__widget';
    ref.current.appendChild(c);
    const script = document.createElement('script');
    const srcMap: Record<string,string> = {
      heatmap: 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js',
      forex: 'https://s3.tradingview.com/external-embedding/embed-widget-forex-cross-rates.js',
      ticker: 'https://s3.tradingview.com/external-embedding/embed-widget-tickers.js',
      screener: 'https://s3.tradingview.com/external-embedding/embed-widget-screener.js',
    };
    script.src = srcMap[kind]; script.async = true;
    const cfg: any = { colorTheme: 'dark', width: '100%', height: 420, locale: 'en' };
    if (kind === 'heatmap') Object.assign(cfg, { dataSource: 'SPX500', exchanges: [], grouping: 'sector', blockSize: 'market_cap_basic', blockColor: 'change' });
    if (kind === 'ticker') Object.assign(cfg, { symbols: [{ proName: 'NSE:NIFTY', title: 'NIFTY 50' }, { proName: 'NSE:BANKNIFTY', title: 'BANKNIFTY' }, { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' }, { proName: 'FOREXCOM:NSXUSD', title: 'Nasdaq' }] });
    if (kind === 'screener') Object.assign(cfg, { defaultColumn: 'overview', defaultScreen: 'general', market: 'india' });
    script.innerHTML = JSON.stringify(cfg);
    ref.current.appendChild(script);
  }, [kind]);
  return <div ref={ref} className="tradingview-widget-container" style={{ minHeight: 420 }}/>;
};

const MarketAnalysis = () => (
  <div className="p-6 space-y-6">
    <div>
      <h1 className="text-3xl font-bold flex items-center gap-2"><Globe className="h-7 w-7 text-primary"/>Market Analysis</h1>
      <p className="text-muted-foreground text-sm mt-1">Live cross-market overview powered by TradingView</p>
    </div>

    <Card><CardHeader><CardTitle>Market Tickers</CardTitle></CardHeader><CardContent><TVWidget kind="ticker"/></CardContent></Card>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><LineIcon className="h-4 w-4"/>S&P 500 Heatmap</CardTitle></CardHeader><CardContent><TVWidget kind="heatmap"/></CardContent></Card>
      <Card><CardHeader><CardTitle>Forex Cross Rates</CardTitle></CardHeader><CardContent><TVWidget kind="forex"/></CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Equity Screener · India</CardTitle></CardHeader><CardContent><TVWidget kind="screener"/></CardContent></Card>
  </div>
);
export default MarketAnalysis;