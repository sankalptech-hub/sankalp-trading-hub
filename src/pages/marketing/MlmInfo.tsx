import { Link } from 'react-router-dom';
import { ArrowLeft, Users, Wallet, TrendingUp, Crown, ArrowRight } from 'lucide-react';
import TradeSphereLogo from '@/components/marketing/TradeSphereLogo';
import { MLM_LEVELS } from '@/lib/marketingData';

const MlmInfo = () => (
  <div className="min-h-screen bg-[#0B1020] text-white">
    <header className="px-6 lg:px-12 pt-7 flex items-center justify-between">
      <TradeSphereLogo />
      <Link to="/" className="inline-flex items-center gap-2 text-[13px] text-white/65 hover:text-amber-300 transition-colors">
        <ArrowLeft size={14} /> Back to Home
      </Link>
    </header>

    <section className="px-6 lg:px-12 pt-10 pb-8 max-w-[1240px]">
      <div className="text-[11px] tracking-[0.22em] uppercase text-amber-400/80 font-mono mb-4">— Partner Network</div>
      <h1 className="text-[44px] sm:text-[60px] leading-[1] font-extrabold tracking-tight">
        <span className="text-white">Earn with our </span>
        <span className="bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-transparent italic">5-tier</span>
        <span className="text-white"> partner network.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/70">
        Refer traders to TradeSphere and earn from their license fees — direct and indirect, up to 5 levels deep, paid weekly.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/login" className="inline-flex items-center gap-2.5 px-5 py-3 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-[#0B1020] font-semibold text-[14px] hover:brightness-110 transition-all">
          <Users size={16} /> <span>Become a Partner</span> <ArrowRight size={15} />
        </Link>
      </div>
    </section>

    <section className="px-6 lg:px-12 pb-10 grid sm:grid-cols-3 gap-3">
      {[
        { Icon: Wallet, label: 'Weekly Payouts', value: 'Every Monday' },
        { Icon: TrendingUp, label: 'Max Direct Commission', value: '12%' },
        { Icon: Crown, label: 'Top-Tier Rank', value: 'Gold' },
      ].map(({ Icon, label, value }, i) => (
        <div key={i} className="rounded-xl px-5 py-4 bg-white/[0.03] border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Icon size={18} className="text-amber-400" />
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-white/55">{label}</div>
              <div className="text-[20px] font-bold text-amber-300">{value}</div>
            </div>
          </div>
        </div>
      ))}
    </section>

    <section className="px-6 lg:px-12 pb-16 max-w-[1240px]">
      <div className="text-[11px] tracking-[0.22em] uppercase text-amber-400/80 font-mono mb-4">— Commission Structure</div>
      <div className="rounded-xl overflow-hidden border border-white/10">
        <table className="w-full text-left">
          <thead className="bg-white/[0.04] text-white/55 text-[11px] uppercase tracking-wider font-mono">
            <tr>
              <th className="px-5 py-3">Tier</th>
              <th className="px-5 py-3">Network</th>
              <th className="px-5 py-3 text-right">Commission</th>
            </tr>
          </thead>
          <tbody>
            {MLM_LEVELS.map((l) => (
              <tr key={l.level} className="border-t border-white/5 hover:bg-amber-500/[0.03] transition-colors">
                <td className="px-5 py-4">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[12px] font-bold">{l.level}</span>
                </td>
                <td className="px-5 py-4 text-[14px] text-white/85">{l.label}</td>
                <td className="px-5 py-4 text-right text-[18px] font-extrabold text-amber-300">{l.percent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>

    <footer className="px-6 lg:px-12 pb-8 text-center text-[11.5px] text-white/35">
      © 2026 TradeSphere Cloud Services. All rights reserved.
    </footer>
  </div>
);

export default MlmInfo;