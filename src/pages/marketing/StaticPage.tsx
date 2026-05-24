import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TradeSphereLogo from '@/components/marketing/TradeSphereLogo';

type Slug = 'privacy' | 'terms' | 'refund';

const CONTENT: Record<Slug, { title: string; body: { h: string; p: string }[] }> = {
  privacy: {
    title: 'Privacy Policy',
    body: [
      { h: '1. Information we collect', p: 'We collect account information (email, name), broker API credentials you connect, and usage telemetry to operate the platform. Broker keys are encrypted at rest using AES-256.' },
      { h: '2. How we use your data', p: 'Your data is used solely to deliver TradeSphere services — order routing to your connected brokers, analytics on your account, and support. We do not sell personal data.' },
      { h: '3. Sharing', p: 'We share data with brokers you connect (for trade execution), with sub-processors (cloud hosting, email delivery), and where legally required.' },
      { h: '4. Retention & deletion', p: 'You can request export or deletion of your data at any time via Settings → Account, or by emailing support.' },
      { h: '5. Contact', p: 'Privacy questions: privacy@tradesphere.tech.' },
    ],
  },
  terms: {
    title: 'Terms of Service',
    body: [
      { h: '1. Acceptance', p: 'By signing up, you agree to these Terms. If you do not agree, do not use TradeSphere.' },
      { h: '2. Service description', p: 'TradeSphere provides trading automation tooling, dashboards, analytics, EAs and broker connectors. We do not provide financial advice or guarantee profits.' },
      { h: '3. Account responsibility', p: 'You are responsible for your credentials, broker API keys, and all activity under your account.' },
      { h: '4. Risk', p: 'Trading involves substantial risk. You may lose more than your initial deposit. You assume all risk of trades placed via TradeSphere or its automations.' },
      { h: '5. Limitation of liability', p: 'TradeSphere is not liable for trading losses, broker outages, market data errors, or downstream service failures, to the maximum extent permitted by law.' },
    ],
  },
  refund: {
    title: 'Payment & Refund Policy',
    body: [
      { h: '1. Subscriptions', p: 'Licenses are billed monthly or annually. Renewals are automatic until cancelled.' },
      { h: '2. Refund window', p: 'You may request a full refund within 7 days of initial purchase if you have not actively used the platform.' },
      { h: '3. Partner commissions', p: 'Partner network commissions are paid weekly to verified associates and are non-refundable once disbursed.' },
      { h: '4. Disputes', p: 'Contact billing@tradesphere.tech for any payment dispute before initiating a chargeback.' },
    ],
  },
};

const SLUG_MAP: Record<string, Slug> = {
  'privacy-policy': 'privacy',
  'terms-of-service': 'terms',
  'payment-refund-policy': 'refund',
};

const StaticPage = ({ slug }: { slug?: Slug }) => {
  const params = useParams();
  const resolved: Slug = slug ?? SLUG_MAP[(params['*'] ?? '') as string] ?? 'privacy';
  const content = CONTENT[resolved];

  return (
    <div className="min-h-screen bg-[#0B1020] text-white">
      <header className="px-6 lg:px-12 pt-7 flex items-center justify-between">
        <TradeSphereLogo />
        <Link to="/" className="inline-flex items-center gap-2 text-[13px] text-white/65 hover:text-amber-300 transition-colors">
          <ArrowLeft size={14} /> Back to Home
        </Link>
      </header>
      <article className="px-6 lg:px-12 pt-10 pb-16 max-w-[860px]">
        <div className="text-[11px] tracking-[0.22em] uppercase text-amber-400/80 font-mono mb-4">— Legal</div>
        <h1 className="text-[44px] sm:text-[56px] leading-[1] font-extrabold tracking-tight mb-8">{content.title}</h1>
        <div className="space-y-7">
          {content.body.map((s) => (
            <section key={s.h}>
              <h2 className="text-[18px] font-semibold text-amber-300 mb-2">{s.h}</h2>
              <p className="text-[14.5px] leading-relaxed text-white/75">{s.p}</p>
            </section>
          ))}
        </div>
        <div className="mt-12 text-[11.5px] text-white/35">Last updated: May 2026</div>
      </article>
    </div>
  );
};

export default StaticPage;