import { useState, useEffect } from 'react';
import { EXCHANGES, getMarketStatus, formatMinutes, type MarketStatus } from '@/lib/marketHours';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';

interface Props {
  exchanges?: string[];
}

export function MarketStatusHeader({ exchanges }: Props) {
  const [statuses, setStatuses] = useState<MarketStatus[]>([]);
  
  const tracked = exchanges?.length ? exchanges : ['NSE', 'NYSE', 'LSE', 'NASDAQ'];
  
  useEffect(() => {
    const update = () => setStatuses(tracked.map(e => getMarketStatus(e)));
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [tracked.join(',')]);
  
  const openCount = statuses.filter(s => s.status === 'open').length;
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs hover:bg-accent transition-colors">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">Markets</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${openCount > 0 ? 'border-emerald-500/50 text-emerald-400' : 'border-muted'}`}>
            {openCount} open
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <p className="text-xs font-semibold mb-2 text-muted-foreground px-1">Market Hours</p>
        <div className="space-y-1">
          {statuses.map(s => (
            <div key={s.exchange} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 text-xs">
              <span>{s.info.flag}</span>
              <span className="font-medium w-14">{s.exchange}</span>
              <span className={`w-2 h-2 rounded-full ${s.status === 'open' ? 'bg-emerald-400' : s.status === 'pre-open' ? 'bg-yellow-400' : 'bg-muted-foreground/40'}`} />
              <span className={`flex-1 ${s.status === 'open' ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                {s.status === 'open' ? `OPEN` : s.status === 'pre-open' ? 'PRE-OPEN' : 'CLOSED'}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {s.status === 'open' && s.closesInMinutes ? `closes ${formatMinutes(s.closesInMinutes)}` : 
                 s.status === 'closed' && s.opensInMinutes ? `opens ${formatMinutes(s.opensInMinutes)}` :
                 `${s.info.open}-${s.info.close}`}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
