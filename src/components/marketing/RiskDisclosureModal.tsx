import { AlertTriangle, X } from 'lucide-react';
import { RISK_DISCLOSURES } from '@/lib/marketingData';

export const RiskDisclosureModal = ({ onAccept }: { onAccept: () => void }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onAccept} aria-hidden="true" />
    <div className="relative w-full max-w-xl rounded-2xl border border-amber-500/20 bg-[#0B1020]/95 p-7 shadow-2xl">
      <button
        onClick={onAccept}
        className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors"
        aria-label="close"
      >
        <X size={20} />
      </button>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
          <AlertTriangle size={18} className="text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-white tracking-tight">
          Risk disclosures on automated trading
        </h2>
      </div>
      <ul className="space-y-3 mb-6 text-[14px] leading-relaxed text-white/75">
        {RISK_DISCLOSURES.map((d, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0" />
            <span>{d}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onAccept}
        className="w-full py-3 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-[#0B1020] font-semibold text-[14px] tracking-wide hover:brightness-110 transition-all"
      >
        I understand — Continue
      </button>
    </div>
  </div>
);

export default RiskDisclosureModal;