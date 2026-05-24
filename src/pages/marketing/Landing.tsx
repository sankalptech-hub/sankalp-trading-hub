import { Link } from 'react-router-dom';
import { Zap, Lock, TrendingUp, BarChart2, Users, ArrowRight, AlertCircle, DollarSign, ArrowDownCircle } from 'lucide-react';
import TickerTape from '@/components/marketing/TickerTape';
import TradeSphereLogo from '@/components/marketing/TradeSphereLogo';
import { HERO_FEATURES, HERO_STAT_CARDS, WHAT_TRADERS_GET, SUPPORTED_BROKERS, FOOTER_LINKS } from '@/lib/marketingData';
import { useAuth } from '@/contexts/AuthContext';

const iconMap: Record<string, any> = { zap: Zap, lock: Lock, 'trending-up': TrendingUp, 'bar-chart-2': BarChart2 };

const FLOATING_STATS = [
  { label: 'TOTAL DEPOSITS', value: '$9.17M', Icon: DollarSign },
  { label: 'TOTAL WITHDRAWALS', value: '$4.80M', Icon: ArrowDownCircle },
];

const Landing = () => {
  const { session } = useAuth();
  const ctaHref = session ? '/dashboard' : '/login';
  const ctaLabel = session ? 'Open Dashboard' : 'Get Started';

  return (
    <div className="min-h-screen bg-[#0B1020] text-white">
      <TickerTape />
      <main className="relative">
        {/* Header */}
        <header className="relative z-30 px-6 lg:px-12 pt-7 flex items-center justify-between">
          <TradeSphereLogo />
          <nav className="flex items-center gap-4">
            <Link to="/features" className="hidden sm:inline-flex text-[13px] text-white/65 hover:text-amber-300 transition-colors font-medium">Features & Analysis</Link>
            <Link to="/mlm-info" className="hidden sm:inline-flex text-[13px] text-white/65 hover:text-amber-300 transition-colors font-medium">Partner Network</Link>
            <Link to={ctaHref} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/30">
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-emerald-300 animate-pulse">{session ? 'Open App' : 'Sign In'}</span>
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="relative w-full overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-cover bg-center opacity-[0.55]" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1578920103364-21678e392488?crop=entropy&cs=srgb&fm=jpg&q=85&w=1800')" }} />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B1020] via-[#0B1020]/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B1020] via-transparent to-[#0B1020]/50" />
          </div>
          <div className="relative px-6 lg:px-12 pt-10 pb-24">
            <div className="max-w-[1240px]">
              <div className="text-[11px] tracking-[0.22em] uppercase text-amber-400/80 font-mono mb-6">— Algorithmic Trading Automation</div>
              <h1 className="text-[56px] sm:text-[72px] lg:text-[92px] leading-[0.95] font-extrabold tracking-tight">
                <span className="text-white">Automate Your</span>
                <br />
                <span className="bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-transparent italic">Trading Strategy</span>
              </h1>
              <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/70">
                Deploy institutional-grade MT5 Expert Advisors with secure license management.
                Precision execution, zero emotion — your portfolio runs 24/7.
              </p>
              <div className="mt-7 flex flex-wrap gap-2.5">
                {HERO_FEATURES.map((f) => {
                  const Icon = iconMap[f.icon];
                  return (
                    <div key={f.label} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-amber-500/[0.06] border border-amber-500/30 text-amber-300/95 text-[12.5px] font-medium font-mono backdrop-blur-sm">
                      <Icon size={13} />
                      <span>{f.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/mlm-info" className="inline-flex items-center gap-2.5 px-5 py-3 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-[#0B1020] font-semibold text-[14px] hover:brightness-110 transition-all">
                  <Users size={16} /> <span>Join Partner Network</span> <ArrowRight size={15} />
                </Link>
                <Link to={ctaHref} className="inline-flex items-center gap-2.5 px-5 py-3 rounded-lg bg-white/[0.04] border border-white/10 text-white/85 hover:bg-white/[0.08] hover:border-white/20 transition-all font-medium text-[14px]">
                  <span>{ctaLabel}</span> <ArrowRight size={15} />
                </Link>
              </div>
              <div className="mt-10 grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl">
                {HERO_STAT_CARDS.map((c, i) => (
                  <div key={i} className="rounded-xl px-4 py-5 bg-white/[0.03] border border-white/10 hover:border-amber-500/40 transition-colors">
                    <div className="text-[26px] sm:text-[30px] font-extrabold text-amber-400 leading-none">{c.topLabel}</div>
                    <div className="mt-2 font-mono text-[10px] tracking-[0.14em] uppercase text-white/55">{c.subLabel}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden lg:flex absolute right-12 top-32 flex-col gap-4 z-10">
              {FLOATING_STATS.map(({ label, value, Icon }, i) => (
                <div key={i} className="rounded-lg px-4 py-3 min-w-[200px] bg-white/[0.04] border border-amber-500/20 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] tracking-[0.12em] text-emerald-400/90">{i === 0 ? 'SYSTEM LIVE' : ''}</span>
                    <Icon size={13} className="text-amber-400/80" />
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-white/55 mb-1">{label}</div>
                  <div className="font-mono text-[22px] font-bold text-amber-300">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What traders get */}
        <section className="px-6 lg:px-12 pb-10">
          <div className="text-[11px] tracking-[0.22em] uppercase text-amber-400/80 font-mono mb-4">— What Traders Get</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {WHAT_TRADERS_GET.map((item, i) => (
              <div key={i} className="px-4 py-3.5 rounded-lg bg-white/[0.025] border border-amber-500/15 hover:border-amber-500/40 hover:bg-amber-500/[0.04] transition-all text-center text-[13px] font-medium text-amber-200/90">
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* Supported brokers */}
        <section className="px-6 lg:px-12 pb-8">
          <div className="text-[11px] tracking-[0.22em] uppercase text-amber-400/80 font-mono mb-4">— Supported Brokers</div>
          <div className="flex flex-wrap gap-3">
            {SUPPORTED_BROKERS.map((b, i) => (
              <div key={i} className="inline-flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-md bg-white/[0.025] border border-white/10">
                <div className="w-7 h-7 rounded bg-gradient-to-br from-amber-500/30 to-amber-700/20 border border-amber-500/30 flex items-center justify-center font-mono text-[10px] font-bold text-amber-300">{b.code}</div>
                <span className="text-[13px] font-medium text-white/80">{b.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Disclaimer + footer */}
        <section className="px-6 lg:px-12 pb-8">
          <div className="rounded-xl px-5 py-4 flex items-start gap-3 bg-white/[0.03] border border-amber-500/20">
            <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[13px] leading-relaxed text-white/75">
              <span className="text-amber-400 font-semibold">Important:</span>{' '}
              We provide trading automation tools only. Trading involves substantial risk. Use any tool at your own discretion.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-5 mt-6">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.path} to={l.path} className="text-[12px] text-white/45 hover:text-amber-300 transition-colors">{l.label}</Link>
            ))}
          </div>
          <div className="text-center text-[11.5px] text-white/35 mt-4">
            © 2026 TradeSphere Cloud Services. All rights reserved.
          </div>
        </section>
      </main>
    </div>
  );
};

export default Landing;