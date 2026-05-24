import { Link } from 'react-router-dom';
import { ArrowLeft, Cpu, LineChart, Server, BarChart3, ShieldCheck, Users, TrendingUp, TrendingDown } from 'lucide-react';
import TradeSphereLogo from '@/components/marketing/TradeSphereLogo';
import { PRODUCT_FEATURES, PERFORMANCE_HIGHLIGHTS } from '@/lib/marketingData';

const iconMap: Record<string, any> = {
  cpu: Cpu, 'line-chart': LineChart, server: Server, 'bar-chart-3': BarChart3, 'shield-check': ShieldCheck, users: Users,
};

const Features = () => (
  <div className="min-h-screen bg-[#0B1020] text-white">
    <header className="px-6 lg:px-12 pt-7 flex items-center justify-between">
      <TradeSphereLogo />
      <Link to="/" className="inline-flex items-center gap-2 text-[13px] text-white/65 hover:text-amber-300 transition-colors">
        <ArrowLeft size={14} /> Back to Home
      </Link>
    </header>

    <section className="px-6 lg:px-12 pt-10 pb-6 max-w-[1240px]">
      <div className="text-[11px] tracking-[0.22em] uppercase text-amber-400/80 font-mono mb-4">— Platform Features</div>
      <h1 className="text-[44px] sm:text-[60px] leading-[1] font-extrabold tracking-tight">
        <span className="text-white">Every tool a serious </span>
        <span className="bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-transparent italic">trader</span>
        <span className="text-white"> needs.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/70">
        EAs, custom indicators, low-latency VPS, encrypted licenses and live analytics — engineered together.
      </p>
    </section>

    <section className="px-6 lg:px-12 pb-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {PERFORMANCE_HIGHLIGHTS.map((h, i) => (
        <div key={i} className="rounded-xl px-5 py-4 bg-white/[0.03] border border-white/10">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-white/55 mb-1">{h.label}</div>
          <div className="flex items-center gap-2">
            <div className="text-[28px] font-extrabold text-amber-300">{h.value}</div>
            {h.trend === 'up' ? <TrendingUp size={16} className="text-emerald-400" /> : <TrendingDown size={16} className="text-rose-400" />}
          </div>
        </div>
      ))}
    </section>

    <section className="px-6 lg:px-12 pb-16 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {PRODUCT_FEATURES.map((f) => {
        const Icon = iconMap[f.icon] ?? Cpu;
        return (
          <div key={f.id} className="rounded-xl p-5 bg-white/[0.03] border border-white/10 hover:border-amber-500/40 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Icon size={18} className="text-amber-400" />
              </div>
              <h3 className="text-[16px] font-semibold tracking-tight">{f.title}</h3>
            </div>
            <p className="text-[13.5px] leading-relaxed text-white/65 mb-4">{f.desc}</p>
            <ul className="space-y-1.5">
              {f.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-[12.5px] text-white/75">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-400/80 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>

    <footer className="px-6 lg:px-12 pb-8 text-center text-[11.5px] text-white/35">
      © 2026 TradeSphere Cloud Services. All rights reserved.
    </footer>
  </div>
);

export default Features;