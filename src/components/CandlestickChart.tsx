import { useMemo } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { CandleData, getCurrencySymbol } from '@/lib/marketData';

interface Props {
  data: CandleData[];
  symbol: string;
  height?: number;
  showVolume?: boolean;
}

interface CandleBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bodyTop: number;
  bodyBottom: number;
  wickTop: number;
  wickBottom: number;
  bullish: boolean;
}

const CandlestickChart = ({ data, symbol, height = 400, showVolume = true }: Props) => {
  const cur = getCurrencySymbol(symbol);

  const chartData: CandleBar[] = useMemo(() =>
    data.map(c => ({
      ...c,
      bodyTop: Math.max(c.open, c.close),
      bodyBottom: Math.min(c.open, c.close),
      wickTop: c.high,
      wickBottom: c.low,
      bullish: c.close >= c.open,
    })),
  [data]);

  const [minPrice, maxPrice] = useMemo(() => {
    if (!chartData.length) return [0, 100];
    const lows = chartData.map(c => c.low);
    const highs = chartData.map(c => c.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const pad = (max - min) * 0.05;
    return [min - pad, max + pad];
  }, [chartData]);

  const maxVol = useMemo(() => Math.max(...chartData.map(c => c.volume), 1), [chartData]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        No candle data available
      </div>
    );
  }

  const CustomCandle = (props: any) => {
    const { x, y, width, payload } = props;
    if (!payload) return null;
    const { open, high, low, close, bullish } = payload;
    const yScale = (val: number) => {
      const range = maxPrice - minPrice;
      const chartHeight = height * 0.75;
      return 20 + ((maxPrice - val) / range) * chartHeight;
    };

    const bodyTop = yScale(Math.max(open, close));
    const bodyBottom = yScale(Math.min(open, close));
    const wickTopY = yScale(high);
    const wickBottomY = yScale(low);
    const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
    const candleWidth = Math.max(width * 0.7, 2);
    const cx = x + width / 2;

    const color = bullish ? 'hsl(152, 69%, 53%)' : 'hsl(0, 84%, 60%)';

    return (
      <g>
        {/* Wick */}
        <line x1={cx} y1={wickTopY} x2={cx} y2={bodyTop} stroke={color} strokeWidth={1} />
        <line x1={cx} y1={bodyBottom} x2={cx} y2={wickBottomY} stroke={color} strokeWidth={1} />
        {/* Body */}
        <rect
          x={cx - candleWidth / 2}
          y={bodyTop}
          width={candleWidth}
          height={bodyHeight}
          fill={bullish ? color : color}
          stroke={color}
          strokeWidth={0.5}
          opacity={bullish ? 0.9 : 0.9}
        />
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl space-y-1">
        <p className="font-semibold text-foreground">{d.date}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
          <span>Open</span><span className="font-mono text-foreground">{cur}{d.open.toFixed(2)}</span>
          <span>High</span><span className="font-mono text-foreground">{cur}{d.high.toFixed(2)}</span>
          <span>Low</span><span className="font-mono text-foreground">{cur}{d.low.toFixed(2)}</span>
          <span>Close</span><span className={`font-mono ${d.bullish ? 'text-emerald-400' : 'text-red-400'}`}>{cur}{d.close.toFixed(2)}</span>
          <span>Volume</span><span className="font-mono text-foreground">{(d.volume / 1000000).toFixed(2)}M</span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="date"
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
            tickFormatter={v => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }}
            interval={Math.max(Math.floor(chartData.length / 8), 0)}
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
            tickFormatter={v => `${cur}${v.toFixed(0)}`}
            width={65}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Invisible bar to drive the candle rendering */}
          <Bar dataKey="close" shape={<CustomCandle />} isAnimationActive={false}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill="transparent" />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
      {showVolume && (
        <ResponsiveContainer width="100%" height={80}>
          <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={[0, maxVol * 2]} />
            <Bar dataKey="volume" isAnimationActive={false}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.bullish ? 'hsla(152, 69%, 53%, 0.4)' : 'hsla(0, 84%, 60%, 0.4)'} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default CandlestickChart;
