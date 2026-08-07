import { useState } from 'react';
import { Link } from 'react-router-dom';
import HawkAnimations from '../components/HawkAnimations';
import ProductDemo from '../components/ProductDemo';
import LeadDetectionExplainer from '../components/LeadDetectionExplainer';
import { useScrollReveal } from '../hooks/useScrollReveal';

export default function LandingPage() {
  const containerRef = useScrollReveal();
  const [showDemo, setShowDemo] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      <HawkAnimations />

      {/* Nav */}
      <nav className="flex flex-col items-center px-6 py-4 max-w-2xl mx-auto gap-2 animate-fade-in">
        <h1 className="text-3xl font-extrabold tracking-wider uppercase gradient-text">HawkEye-Cue</h1>
        <div className="flex gap-3">
          <Link to="/login" className="text-sm text-slate-300 hover:text-white px-4 py-2 transition-colors">Log In</Link>
          <Link to="/register" className="text-sm btn-primary px-4 py-2 btn-shimmer">Sign Up Free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative text-center px-6 py-16 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-3xl animate-pulse-glow pointer-events-none"></div>
        <div className="max-w-2xl mx-auto relative z-10">
          <div className="text-5xl mb-3 animate-fade-up">🦅</div>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-3 leading-tight animate-fade-up" style={{ animationDelay: '0.1s', opacity: 0 }}>
            From Scroll to Sale<br />
            <span className="gradient-text text-xl md:text-2xl">Fully Customizable Social Media Creation & Tracking</span>
            <br /><span className="text-xl md:text-2xl">for Trade Professionals</span>
          </h2>
          <p className="text-base text-slate-400 mb-6 max-w-xl mx-auto animate-fade-up" style={{ animationDelay: '0.2s', opacity: 0 }}>
            Generate leads, create content, and track opportunities — all with the precision of a hawk.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-up" style={{ animationDelay: '0.3s', opacity: 0 }}>
            <Link to="/register" className="btn-primary px-8 py-3 text-lg font-bold shadow-lg shadow-blue-600/25 btn-shimmer">
              Get Started Free
            </Link>
            <button onClick={() => setShowDemo(true)} className="btn-secondary px-8 py-3 text-lg font-medium">
              ▶ See How It Works
            </button>
          </div>
        </div>
      </section>

      {/* Algorithm Tagline */}
      <div className="text-center px-6 py-6 reveal">
        <p className="text-lg md:text-xl font-semibold text-amber-300 max-w-xl mx-auto">🦅 Use HawkEye-Cue to train your algorithm to put more leads in front of you on social media</p>
      </div>

      {/* Our Story */}
      <section className="px-6 py-10 max-w-3xl mx-auto">
        <details className="glass-card-strong gradient-border p-6 reveal cursor-pointer">
          <summary className="font-bold text-white text-center">Our Story — Built by Agency Owners</summary>
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-300 leading-relaxed">HawkEye-Cue was built by two agency owners who understand what it's like to grow a business without a large marketing budget. We focused on showing up consistently on social media, building relationships, and creating content that generated real conversations and opportunities.</p>
            <p className="text-sm text-slate-300 leading-relaxed">Those efforts helped us earn Toppers Club, become a Prime agency, and consistently rank among the top in our district during our first two years. The biggest challenge wasn't finding opportunities — it was staying organized enough to act on every one of them.</p>
            <p className="text-sm text-white font-semibold">That's why we created HawkEye-Cue.</p>
            <p className="text-sm text-slate-300 leading-relaxed">We built the platform we wished we had from day one, so other business owners can spend less time wondering what to do next and more time building relationships, serving customers, and growing their business.</p>
          </div>
        </details>
      </section>

      {/* How It Works */}
      <section className="px-6 py-10 max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-8 reveal">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-6 stagger-children">
          <div className="text-center glass-card p-4">
            <div className="text-3xl mb-2">1️⃣</div>
            <h4 className="font-bold mb-1">Select Your Trade</h4>
            <p className="text-xs text-slate-400">Choose from 57 trades. Everything tailors to your industry.</p>
          </div>
          <div className="text-center glass-card p-4">
            <div className="text-3xl mb-2">2️⃣</div>
            <h4 className="font-bold mb-1">Add Your Flocks</h4>
            <p className="text-xs text-slate-400">Add Facebook groups to your calendar. They repeat daily or weekly.</p>
          </div>
          <div className="text-center glass-card p-4">
            <div className="text-3xl mb-2">3️⃣</div>
            <h4 className="font-bold mb-1">Post, Engage, Track</h4>
            <p className="text-xs text-slate-400">Fly through groups with one tap each. Track leads and sales.</p>
          </div>
        </div>
      </section>

      {/* Features — condensed 2x4 grid */}
      <section className="px-6 py-10 max-w-4xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-8 reveal">Features</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
          <div className="glass-card p-4 text-center">
            <span className="text-2xl">🦅</span>
            <p className="text-xs font-bold text-white mt-2">Flocks</p>
            <p className="text-[10px] text-slate-400 mt-1">Copy & Open groups in one tap</p>
          </div>
          <div className="glass-card p-4 text-center">
            <span className="text-2xl">✨</span>
            <p className="text-xs font-bold text-white mt-2">AI Content</p>
            <p className="text-[10px] text-slate-400 mt-1">Trade-specific posts for every platform</p>
          </div>
          <div className="glass-card p-4 text-center">
            <span className="text-2xl">📅</span>
            <p className="text-xs font-bold text-white mt-2">Calendar</p>
            <p className="text-[10px] text-slate-400 mt-1">Hourly schedule + meeting invites</p>
          </div>
          <div className="glass-card p-4 text-center">
            <span className="text-2xl">🎯</span>
            <p className="text-xs font-bold text-white mt-2">Leads</p>
            <p className="text-[10px] text-slate-400 mt-1">Track from any source to converted</p>
          </div>
          <div className="glass-card p-4 text-center">
            <span className="text-2xl">💰</span>
            <p className="text-xs font-bold text-white mt-2">Sales Pipeline</p>
            <p className="text-[10px] text-slate-400 mt-1">Prospect to close with attribution</p>
          </div>
          <div className="glass-card p-4 text-center">
            <span className="text-2xl">🔑</span>
            <p className="text-xs font-bold text-white mt-2">Keywords</p>
            <p className="text-[10px] text-slate-400 mt-1">Auto-detect leads while scrolling</p>
            <button onClick={() => setShowExplainer(true)} className="text-[9px] text-blue-400 mt-1">How? →</button>
          </div>
          <div className="glass-card p-4 text-center">
            <span className="text-2xl">📊</span>
            <p className="text-xs font-bold text-white mt-2">Insights</p>
            <p className="text-[10px] text-slate-400 mt-1">Analytics on what makes you money</p>
          </div>
          <div className="glass-card p-4 text-center">
            <span className="text-2xl">🤝</span>
            <p className="text-xs font-bold text-white mt-2">Network</p>
            <p className="text-[10px] text-slate-400 mt-1">Referrals, Wingman, appreciations</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-12 max-w-5xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-3 reveal">Pricing</h3>
        <div className="text-center mb-8 reveal">
          <div className="inline-block bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 rounded-xl px-6 py-3">
            <p className="text-base font-bold text-amber-300">🎁 7-Day Free Trial on Soar & Summit</p>
            <p className="text-xs text-slate-400">No charge unless you upgrade. Returns to Nest (free) automatically.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 stagger-children items-start max-w-4xl mx-auto">
          {/* Nest */}
          <div className="glass-card-strong p-5">
            <h4 className="text-lg font-bold text-white">🪺 Nest</h4>
            <p className="text-2xl font-extrabold text-white mt-1">Free</p>
            <ul className="text-xs text-slate-300 space-y-1.5 my-4">
              <li>✓ AI posts (2/month)</li>
              <li>✓ Calendar & scheduling</li>
              <li>✓ 3 Copy & Open per day</li>
              <li>✓ Meeting invites</li>
              <li>✓ Network board</li>
            </ul>
            <Link to="/register" className="block text-center btn-primary py-2 text-sm btn-shimmer">Get Started Free</Link>
          </div>

          {/* Soar */}
          <div className="glass-card-strong gradient-border p-5 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[10px] font-bold px-3 py-0.5 rounded-full">MOST POPULAR</div>
            <h4 className="text-lg font-bold text-white mt-1">🚀 Soar</h4>
            <p className="text-2xl font-extrabold text-white mt-1">$24.99<span className="text-sm text-slate-400 font-normal">/mo</span></p>
            <p className="text-[10px] text-amber-300 font-medium">🎁 7-day free trial</p>
            <ul className="text-xs text-slate-300 space-y-1.5 my-4">
              <li>✓ Everything in Nest</li>
              <li>🦅 Unlimited Flocks</li>
              <li>🔑 Keyword tracking</li>
              <li>🎯 Lead management</li>
              <li>💰 Sales pipeline</li>
              <li>📊 Hawk Insights</li>
              <li>🙏 Appreciations</li>
              <li>🤝 Wingman</li>
            </ul>
            <Link to="/register" className="block text-center bg-gradient-to-r from-amber-500 to-orange-500 text-black py-2 rounded-lg text-sm font-bold btn-shimmer">Start Free Trial</Link>
          </div>

          {/* Summit */}
          <div className="glass-card-strong p-5 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full">FOR TEAMS</div>
            <h4 className="text-lg font-bold text-white mt-1">🏔️ Summit</h4>
            <p className="text-2xl font-extrabold text-white mt-1">$99.99<span className="text-sm text-slate-400 font-normal">/mo</span></p>
            <p className="text-[10px] text-purple-300 font-medium">🎁 7-day free trial</p>
            <ul className="text-xs text-slate-300 space-y-1.5 my-4">
              <li>✓ Everything in Soar</li>
              <li>👥 Up to 5 team members</li>
              <li>👥 Shared calendar & leads</li>
              <li>👥 Team leaderboard</li>
              <li>🎨 Custom member colors</li>
            </ul>
            <Link to="/register" className="block text-center bg-gradient-to-r from-purple-600 to-pink-600 text-white py-2 rounded-lg text-sm font-medium btn-shimmer">Start Free Trial</Link>
          </div>
        </div>
      </section>

      {/* FAQ — condensed */}
      <section className="px-6 py-10 max-w-2xl mx-auto">
        <h3 className="text-xl font-bold text-center mb-6 reveal">FAQ</h3>
        <div className="space-y-3 stagger-children">
          <details className="glass-card group cursor-pointer p-3">
            <summary className="font-medium text-white text-sm flex items-center justify-between">What trades are supported?<span className="text-slate-500 group-open:rotate-45 transition-transform text-lg">+</span></summary>
            <p className="text-xs text-slate-400 mt-2">57 trades including Roofing, Insurance, Real Estate, HVAC, Electrician, Plumber, Landscaper, Travel Agent, and many more.</p>
          </details>
          <details className="glass-card group cursor-pointer p-3">
            <summary className="font-medium text-white text-sm flex items-center justify-between">How does keyword tracking work?<span className="text-slate-500 group-open:rotate-45 transition-transform text-lg">+</span></summary>
            <p className="text-xs text-slate-400 mt-2">Our Chrome extension scans Facebook, Instagram, LinkedIn, and TikTok while you scroll. A hawk icon appears when someone needs your services — save them as a lead with one click.</p>
          </details>
          <details className="glass-card group cursor-pointer p-3">
            <summary className="font-medium text-white text-sm flex items-center justify-between">Can I cancel anytime?<span className="text-slate-500 group-open:rotate-45 transition-transform text-lg">+</span></summary>
            <p className="text-xs text-slate-400 mt-2">Yes. Cancel anytime, keep access until end of billing period. No contracts.</p>
          </details>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-12 text-center reveal">
        <h3 className="text-2xl font-extrabold mb-3">Ready to Hunt for Leads?</h3>
        <p className="text-slate-400 mb-6 text-sm">Join HawkEye-Cue and let AI do the heavy lifting.</p>
        <Link to="/register" className="btn-primary px-10 py-3 text-lg font-bold shadow-lg shadow-blue-600/25 inline-block btn-shimmer">
          Get Started Now
        </Link>
      </section>

      {/* Built for Your Trade */}
      <section className="px-6 py-10 max-w-3xl mx-auto reveal">
        <details className="glass-card-strong p-6 border border-blue-500/20 cursor-pointer">
          <summary className="font-bold text-white text-center">🦅 Built for Trade Professionals — Insurance, Roofing, Real Estate & 54 More</summary>
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-300 leading-relaxed">Whether you're an insurance agent, roofer, contractor, realtor, or any of our 57 supported trades — HawkEye-Cue was built by business owners who understand the daily grind of growing without a large marketing budget.</p>
            <p className="text-sm text-slate-300 leading-relaxed">Keyword detection finds people asking for your services. The calendar schedules daily group posts. The pipeline tracks every lead from first contact to close. Whether you're a solo operator or running a team — this is the system to grow without hiring a marketing department.</p>
            <div className="grid grid-cols-4 gap-2 mt-4">
              <div className="text-center p-2 bg-blue-500/10 rounded-lg"><p className="text-sm">📤</p><p className="text-[9px] text-slate-400">Post daily</p></div>
              <div className="text-center p-2 bg-amber-500/10 rounded-lg"><p className="text-sm">🎯</p><p className="text-[9px] text-slate-400">Detect leads</p></div>
              <div className="text-center p-2 bg-green-500/10 rounded-lg"><p className="text-sm">💰</p><p className="text-[9px] text-slate-400">Track to close</p></div>
              <div className="text-center p-2 bg-purple-500/10 rounded-lg"><p className="text-sm">🏔️</p><p className="text-[9px] text-slate-400">Team stats</p></div>
            </div>
          </div>
        </details>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 px-6 py-6 text-center text-sm text-slate-500">
        <p>© 2026 HawkEye-Cue. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2">
          <a href="/privacy.html" className="text-slate-500 hover:text-slate-300 transition-colors">Privacy Policy</a>
          <a href="mailto:briannafrashier@hawkeyecue.com" className="text-slate-500 hover:text-slate-300 transition-colors">Contact Us</a>
        </div>
      </footer>

      {showDemo && <ProductDemo onClose={() => setShowDemo(false)} />}
      {showExplainer && <LeadDetectionExplainer onClose={() => setShowExplainer(false)} />}
    </div>
  );
}
