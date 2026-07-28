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
      <nav className="flex flex-col items-center px-6 py-6 max-w-2xl mx-auto gap-3 animate-fade-in">
        <h1 className="text-3xl font-extrabold tracking-wider uppercase gradient-text">HawkEye-Cue</h1>
        <div className="flex gap-3">
          <Link to="/login" className="text-sm text-slate-300 hover:text-white px-4 py-2 transition-colors">Log In</Link>
          <Link to="/register" className="text-sm btn-primary px-4 py-2 btn-shimmer">Sign Up Free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative text-center px-6 py-24 overflow-hidden">
        {/* Animated gradient orbs behind hero */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-3xl animate-pulse-glow pointer-events-none"></div>
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] rounded-full bg-purple-600/8 blur-3xl animate-pulse-glow pointer-events-none" style={{ animationDelay: '1.5s' }}></div>

        <div className="max-w-2xl mx-auto relative z-10">
          <div className="text-6xl mb-4 animate-fade-up">🦅</div>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 leading-tight animate-fade-up" style={{ animationDelay: '0.1s', opacity: 0 }}>
            From Scroll to Sale<br />
            <span className="gradient-text text-2xl md:text-3xl">Fully Customizable Social Media Creation & Tracking</span>
            <br /><span className="text-2xl md:text-3xl">for Trade Professionals</span>
          </h2>
          <p className="text-lg text-slate-400 mb-8 max-w-2xl mx-auto animate-fade-up" style={{ animationDelay: '0.2s', opacity: 0 }}>
            HawkEye-Cue helps roofers, contractors, agents, and tradespeople generate leads, create content, and track opportunities — all with the precision of a hawk.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-up" style={{ animationDelay: '0.3s', opacity: 0 }}>
            <Link to="/register" className="btn-primary px-8 py-3 text-lg font-bold shadow-lg shadow-blue-600/25 btn-shimmer">
              Get Started Free
            </Link>
            <button onClick={() => setShowDemo(true)} className="btn-secondary px-8 py-3 text-lg font-medium">
              ▶ See How It Works
            </button>
          </div>
          <p className="text-sm text-amber-400 mt-6 animate-fade-up" style={{ animationDelay: '0.4s', opacity: 0 }}>🦅 The CRM that connects your social media directly to your sales</p>
        </div>
      </section>

      {/* Our Story */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <div className="glass-card-strong gradient-border p-8 reveal">
          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            HawkEye-Cue was built by two agency owners who understand what it's like to grow a business without a large marketing budget. Early on, buying internet leads wasn't an option, and we hadn't yet built a strong referral network. Instead, we focused on showing up consistently on social media, building relationships, and creating valuable content that generated real conversations and opportunities.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            As we refined our process, those efforts helped us earn Toppers Club, become a Prime agency, and consistently rank among the top agencies in our district during our first two years in business.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            The biggest challenge wasn't finding opportunities. It was staying organized enough to act on every one of them.
          </p>
          <p className="text-sm text-white font-semibold mb-4">
            That's why we created HawkEye-Cue.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            HawkEye-Cue combines content creation, scheduling, lead tracking, sales management, insights, and daily cues into one platform, giving trade professionals a clear, repeatable system instead of relying on memory, spreadsheets, or multiple apps.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            We built the platform we wished we had from day one, so other business owners can spend less time wondering what to do next and more time building relationships, serving customers, and growing their business.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20 max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-12 reveal">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-8 stagger-children">
          <div className="text-center glass-card hover:-translate-y-1 transition-transform duration-300">
            <div className="text-4xl mb-4">1️⃣</div>
            <h4 className="font-bold text-lg mb-2">Select Your Trade</h4>
            <p className="text-sm text-slate-400">Choose from 57 trades — roofing, HVAC, real estate, insurance, travel agents, and more. Everything gets tailored to your industry.</p>
          </div>
          <div className="text-center glass-card hover:-translate-y-1 transition-transform duration-300">
            <div className="text-4xl mb-4">2️⃣</div>
            <h4 className="font-bold text-lg mb-2">Add Your Flocks</h4>
            <p className="text-sm text-slate-400">Add your Facebook groups to the calendar. Set them to repeat daily or weekly. Each morning, your flocks are ready to go.</p>
          </div>
          <div className="text-center glass-card hover:-translate-y-1 transition-transform duration-300">
            <div className="text-4xl mb-4">3️⃣</div>
            <h4 className="font-bold text-lg mb-2">Post, Engage, Track</h4>
            <p className="text-sm text-slate-400">Write or generate a post, fly through your flocks with one tap each, then come back to engage. Track leads, meetings, and sales all in one place.</p>
          </div>
        </div>
      </section>

      {/* Tagline */}
      <div className="text-center px-6 py-10 reveal">
        <p className="text-xl md:text-2xl font-semibold text-slate-200 italic max-w-xl mx-auto">"Know what to post tomorrow because you know what made you money yesterday."</p>
      </div>

      {/* Features */}
      <section className="px-6 py-20 relative">
        {/* Subtle section background */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/0 via-slate-900/50 to-slate-900/0 pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <h3 className="text-2xl font-bold text-center mb-12 reveal">Features</h3>
          <div className="grid md:grid-cols-2 gap-6 stagger-children">
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">🦅</div>
              <h4 className="font-bold text-lg mb-2">Flocks — Group Posting Made Easy</h4>
              <p className="text-sm text-slate-400">Add your Facebook groups to the calendar, then use "Copy & Open Next Flock" to fly through each one. One tap copies your post and opens the group. Done in minutes.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">✨</div>
              <h4 className="font-bold text-lg mb-2">AI Content Creation</h4>
              <p className="text-sm text-slate-400">Write your own post or let AI generate trade-specific content for Facebook, Instagram, LinkedIn, and TikTok. Different versions for each platform, right tone for your industry.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">📅</div>
              <h4 className="font-bold text-lg mb-2">Unified Calendar & Scheduling</h4>
              <p className="text-sm text-slate-400">Every calendar uses the same day view — Cues summary tiles (Posts, Meetings, Reminders) plus an hourly Schedule from 6 AM to 8 PM. Toggle between Month, Week, and Day views. Send meeting invites with Google and Outlook calendar links.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">🎯</div>
              <h4 className="font-bold text-lg mb-2">Lead Management</h4>
              <p className="text-sm text-slate-400">Add leads from any source — Facebook groups, cold calls, referrals, internet lead vendors. Track them from prospect to converted. See what's working.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">💰</div>
              <h4 className="font-bold text-lg mb-2">Sales Tracker & Analytics</h4>
              <p className="text-sm text-slate-400">Full pipeline from prospect to close. Track lead sources, see which groups generate the most business, and get flock completion analytics.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">🤝</div>
              <h4 className="font-bold text-lg mb-2">Network & Appreciations</h4>
              <p className="text-sm text-slate-400">Connect with trades in your area. Post referrals, log appreciations from people who recommend you, build partnerships that generate business.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">📊</div>
              <h4 className="font-bold text-lg mb-2">Hawk Insights</h4>
              <p className="text-sm text-slate-400">See your flock completion rate, which groups you miss most, peak posting times, lead source breakdown, and deal attribution — all in one dashboard.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">🔑</div>
              <h4 className="font-bold text-lg mb-2">Keyword Tracking</h4>
              <p className="text-sm text-slate-400">Our browser extension scans social media while you scroll. When someone posts about needing your services, a hawk icon appears and you save them as a lead.</p>
              <button onClick={() => setShowExplainer(true)} className="text-xs text-blue-400 hover:text-blue-300 mt-2">How does this work? →</button>
            </div>
          </div>
        </div>
      </section>

      {/* Tagline */}
      <div className="text-center px-6 py-10 reveal">
        <p className="text-xl md:text-2xl font-semibold text-slate-200 italic max-w-xl mx-auto">"Know exactly what pipeline makes you the most money."</p>
      </div>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 max-w-5xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-4 reveal">Pricing</h3>
        <p className="text-center text-slate-400 mb-6 reveal">Simple plans that grow with your business</p>

        {/* 7-Day Trial Banner */}
        <div className="text-center mb-10 reveal">
          <div className="inline-block bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-2 border-amber-500/40 rounded-2xl px-8 py-5">
            <p className="text-xl font-bold text-amber-300 mb-1">🎁 7-Day Free Soar Trial</p>
            <p className="text-sm text-white mb-2">Every new user gets full Soar access free for 7 days</p>
            <p className="text-xs text-slate-400">After your trial, you return to Nest (free) automatically. No charge unless you choose to upgrade.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 stagger-children items-start max-w-4xl mx-auto">
          {/* Nest (Free) */}
          <div className="glass-card-strong relative hover:-translate-y-2 transition-transform duration-300">
            <h4 className="text-xl font-bold text-white">🪺 Nest</h4>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-extrabold text-white">Free</span>
            </div>
            <ul className="text-sm text-slate-300 space-y-2 mb-6">
              <li>✓ AI-powered post creation (2/month)</li>
              <li>✓ Full calendar with scheduling</li>
              <li>✓ Flocks — 3 Copy & Open per day</li>
              <li>✓ Meeting invites with calendar links</li>
              <li>✓ Daily notes & reminders</li>
              <li>✓ Network board & contacts</li>
            </ul>
            <Link to="/register" className="block text-center btn-primary py-2.5 btn-shimmer">
              Get Started Free
            </Link>
          </div>

          {/* Soar */}
          <div className="glass-card-strong gradient-border relative hover:-translate-y-2 transition-transform duration-300">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-xs font-bold px-3 py-1 rounded-full shadow-lg shadow-amber-500/20">MOST POPULAR</div>
            <h4 className="text-xl font-bold text-white mt-2">🚀 Soar</h4>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-extrabold text-white">$24.99</span>
              <span className="text-slate-400 text-sm">/mo</span>
            </div>
            <p className="text-xs text-amber-300 mb-3 font-medium">🎁 7-day free trial included</p>
            <ul className="text-sm text-slate-300 space-y-2 mb-6">
              <li>✓ Everything in Nest</li>
              <li>🦅 Unlimited Flocks (Copy & Open)</li>
              <li>🦅 Keyword tracking & browser extension</li>
              <li>🎯 Lead detection & management</li>
              <li>💰 Sales Tracker & Pipeline</li>
              <li>📊 Hawk Insights & Flock Analytics</li>
              <li>🙏 Appreciations & AI thank-you replies</li>
              <li>🤝 Wingman — relationship builder</li>
              <li>🔗 Linked accounts & partner notifications</li>
              <li>💰 Lead source attribution & folio recaps</li>
            </ul>
            <Link to="/register" className="block text-center bg-gradient-to-r from-amber-500 to-orange-500 text-black py-2.5 rounded-lg font-bold hover:shadow-lg hover:shadow-amber-500/25 hover:-translate-y-0.5 active:scale-95 transition-all duration-200 btn-shimmer">
              Start 7-Day Free Trial
            </Link>
          </div>

          {/* Summit */}
          <div className="glass-card-strong relative hover:-translate-y-2 transition-transform duration-300">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg shadow-purple-500/20">FOR TEAMS</div>
            <h4 className="text-xl font-bold text-white mt-2">🏔️ Summit</h4>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-extrabold text-white">$99.99</span>
              <span className="text-slate-400 text-sm">/mo</span>
            </div>
            <p className="text-xs text-purple-300 mb-3 font-medium">🎁 7-day free trial included</p>
            <ul className="text-sm text-slate-300 space-y-2 mb-6">
              <li>✓ Everything in Soar</li>
              <li>👥 Up to 5 team members</li>
              <li>👥 Team leaderboard & stats</li>
              <li>👥 Shared leads & calendar</li>
              <li>👥 Team analytics dashboard</li>
              <li>🎨 Custom member colors on shared calendar</li>
              <li>📅 Color-coded meeting dots per team member</li>
            </ul>
            <Link to="/register" className="block text-center bg-gradient-to-r from-purple-600 to-pink-600 text-white py-2.5 rounded-lg font-medium hover:shadow-lg hover:shadow-pink-500/25 hover:-translate-y-0.5 active:scale-95 transition-all duration-200 btn-shimmer">
              Start 7-Day Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* Tagline */}
      <div className="text-center px-6 py-10 reveal">
        <p className="text-xl md:text-2xl font-semibold text-slate-200 italic max-w-xl mx-auto">"You already know how many sales you made. HawkEye-Cue tells you exactly why you made them."</p>
      </div>

      {/* Testimonials */}
      <section className="px-6 py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/0 via-slate-900/50 to-slate-900/0 pointer-events-none"></div>
        <div className="max-w-2xl mx-auto relative z-10">
          <h3 className="text-2xl font-bold text-center mb-6 reveal">Reviews</h3>
          <p className="text-center text-slate-400 mb-12 reveal">Check back soon for reviews!</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20 max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-12 reveal">FAQ</h3>
        <div className="space-y-4 stagger-children">
          <details className="glass-card group cursor-pointer">
            <summary className="font-semibold text-white flex items-center justify-between">
              What trades does HawkEye-Cue support?
              <span className="text-slate-500 group-open:rotate-45 transition-transform duration-200 text-xl">+</span>
            </summary>
            <p className="text-sm text-slate-400 mt-3">We support 57 trades including Roofing, General Contractor, Insurance Agent, Real Estate Agent, HVAC, Electrician, Plumber, Landscaper, Pool Service, Auto Repair, Painter, Travel Agent, Fence Company, Pressure Washer, Handyman, and many more. Select your trade in Settings to see the full list.</p>
          </details>
          <details className="glass-card group cursor-pointer">
            <summary className="font-semibold text-white flex items-center justify-between">
              How does keyword tracking work?
              <span className="text-slate-500 group-open:rotate-45 transition-transform duration-200 text-xl">+</span>
            </summary>
            <p className="text-sm text-slate-400 mt-3">Our browser extension scans Facebook, Instagram, LinkedIn, and TikTok while you scroll. When someone posts about needing your services, a hawk icon appears and you can save them as a lead with one click.</p>
          </details>
          <details className="glass-card group cursor-pointer">
            <summary className="font-semibold text-white flex items-center justify-between">
              Can I cancel anytime?
              <span className="text-slate-500 group-open:rotate-45 transition-transform duration-200 text-xl">+</span>
            </summary>
            <p className="text-sm text-slate-400 mt-3">Yes. Cancel anytime and you'll keep access until the end of your billing period. No contracts, no hidden fees.</p>
          </details>
          <details className="glass-card group cursor-pointer">
            <summary className="font-semibold text-white flex items-center justify-between">
              Does it work on mobile?
              <span className="text-slate-500 group-open:rotate-45 transition-transform duration-200 text-xl">+</span>
            </summary>
            <p className="text-sm text-slate-400 mt-3">Yes! HawkEye-Cue is available as a web app, iOS app, and Android app. Create content, check leads, and manage your schedule from anywhere.</p>
          </details>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center relative reveal">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[200px] rounded-full bg-blue-600/10 blur-3xl pointer-events-none"></div>
        <div className="relative z-10">
          <h3 className="text-3xl font-extrabold mb-4">Ready to Hunt for Leads?</h3>
          <p className="text-slate-400 mb-8">Join HawkEye-Cue and let AI do the heavy lifting while you focus on your craft.</p>
          <Link to="/register" className="btn-primary px-10 py-4 text-lg font-bold shadow-lg shadow-blue-600/25 inline-block btn-shimmer">
            Get Started Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 px-6 py-8 text-center text-sm text-slate-500">
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
