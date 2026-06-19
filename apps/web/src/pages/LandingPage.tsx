import { Link } from 'react-router-dom';
import HawkAnimations from '../components/HawkAnimations';
import { useScrollReveal } from '../hooks/useScrollReveal';

export default function LandingPage() {
  const containerRef = useScrollReveal();

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
            Fully Customizable Social Media<br />
            <span className="gradient-text">Creation and Tracking</span>
            <br />for Trade Professionals
          </h2>
          <p className="text-lg text-slate-400 mb-8 max-w-2xl mx-auto animate-fade-up" style={{ animationDelay: '0.2s', opacity: 0 }}>
            HawkEye-Cue helps roofers, contractors, agents, and tradespeople generate leads, create content, and track opportunities — all with the precision of a hawk.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-up" style={{ animationDelay: '0.3s', opacity: 0 }}>
            <Link to="/register" className="btn-primary px-8 py-3 text-lg font-bold shadow-lg shadow-blue-600/25 btn-shimmer">
              Get Started Free
            </Link>
            <a href="#pricing" className="btn-secondary px-8 py-3 text-lg font-medium">
              View Pricing
            </a>
          </div>
          <p className="text-sm text-amber-400 mt-6 animate-fade-up" style={{ animationDelay: '0.4s', opacity: 0 }}>🔥 First 5 beta testers get 3 months FREE</p>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20 max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-12 reveal">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-8 stagger-children">
          <div className="text-center glass-card hover:-translate-y-1 transition-transform duration-300">
            <div className="text-4xl mb-4">1️⃣</div>
            <h4 className="font-bold text-lg mb-2">Select Your Trade</h4>
            <p className="text-sm text-slate-400">Choose from 15 trades — roofing, HVAC, real estate, insurance, and more. Everything gets tailored to your industry.</p>
          </div>
          <div className="text-center glass-card hover:-translate-y-1 transition-transform duration-300">
            <div className="text-4xl mb-4">2️⃣</div>
            <h4 className="font-bold text-lg mb-2">Create & Schedule</h4>
            <p className="text-sm text-slate-400">AI generates posts in your tone for Facebook, Instagram, LinkedIn, and TikTok. Schedule them and forget about it.</p>
          </div>
          <div className="text-center glass-card hover:-translate-y-1 transition-transform duration-300">
            <div className="text-4xl mb-4">3️⃣</div>
            <h4 className="font-bold text-lg mb-2">Detect & Connect</h4>
            <p className="text-sm text-slate-400">Our hawk watches for keywords and tags while you scroll. Get notified of leads and thank people who mention you.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 relative">
        {/* Subtle section background */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/0 via-slate-900/50 to-slate-900/0 pointer-events-none"></div>
        <div className="max-w-2xl mx-auto relative z-10">
          <h3 className="text-2xl font-bold text-center mb-12 reveal">Features</h3>
          <div className="grid md:grid-cols-2 gap-6 stagger-children">
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">✨</div>
              <h4 className="font-bold text-lg mb-2">Customizable Content Creation</h4>
              <p className="text-sm text-slate-400">Create trade-specific posts your way — write your own, use templates, or let AI generate them for you if you choose. Adapted for each platform with the right tone.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">📅</div>
              <h4 className="font-bold text-lg mb-2">Post Scheduling</h4>
              <p className="text-sm text-slate-400">Schedule posts across all platforms from one calendar. Never miss a day of content again.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">🦅</div>
              <h4 className="font-bold text-lg mb-2">Keyword Tracking</h4>
              <p className="text-sm text-slate-400">Our hawk icon appears when someone posts about needing your services. Detect leads while you scroll social media.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">🙏</div>
              <h4 className="font-bold text-lg mb-2">Appreciations</h4>
              <p className="text-sm text-slate-400">Track who tags you in posts. Thank them, collaborate, and build lasting referral partnerships.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">🤝</div>
              <h4 className="font-bold text-lg mb-2">Collaborate</h4>
              <p className="text-sm text-slate-400">Network with other trades. Roofers meet insurance agents, realtors meet contractors. Referrals flow naturally.</p>
            </div>
            <div className="glass-card-strong gradient-border hover:-translate-y-1 transition-transform duration-300">
              <div className="text-2xl mb-3">🎯</div>
              <h4 className="font-bold text-lg mb-2">Lead Management</h4>
              <p className="text-sm text-slate-400">Every opportunity tracked in one place. Follow up, convert, and see your stats grow.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-4 reveal">Pricing</h3>
        <p className="text-center text-slate-400 mb-12 reveal">Simple plans that grow with your business</p>

        <div className="grid md:grid-cols-3 gap-6 stagger-children">
          {/* Beta Tester */}
          <div className="glass-card-strong border-amber-500/40 relative hover:-translate-y-2 transition-transform duration-300">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-xs font-bold px-3 py-1 rounded-full shadow-lg shadow-amber-500/20">LIMITED — 5 SPOTS</div>
            <h4 className="text-xl font-bold text-amber-300 mt-2">Beta Tester</h4>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-extrabold text-white">$0</span>
              <span className="text-slate-400 text-sm">/mo for 3 months</span>
            </div>
            <ul className="text-sm text-slate-300 space-y-2 mb-6">
              <li>✓ Full Growth access</li>
              <li>✓ All features unlocked</li>
              <li>✓ Help shape the product</li>
              <li>✓ Priority support</li>
            </ul>
            <Link to="/register" className="block text-center bg-gradient-to-r from-amber-500 to-orange-500 text-black py-2.5 rounded-lg font-bold hover:shadow-lg hover:shadow-amber-500/25 hover:-translate-y-0.5 active:scale-95 transition-all duration-200">
              Claim Spot
            </Link>
          </div>

          {/* Base */}
          <div className="glass-card-strong relative hover:-translate-y-2 transition-transform duration-300">
            <h4 className="text-xl font-bold text-white">Base</h4>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-extrabold text-white">$9.99</span>
              <span className="text-slate-400 text-sm">/mo</span>
            </div>
            <ul className="text-sm text-slate-300 space-y-2 mb-6">
              <li>✓ AI-powered post creation</li>
              <li>✓ Post scheduling & calendar</li>
              <li>✓ Track all your posts</li>
              <li>✓ Trade-specific suggestions</li>
              <li>✓ Multi-platform support</li>
            </ul>
            <Link to="/register" className="block text-center btn-primary py-2.5 btn-shimmer">
              Get Started
            </Link>
          </div>

          {/* Growth */}
          <div className="glass-card-strong gradient-border relative hover:-translate-y-2 transition-transform duration-300">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg shadow-blue-500/20">MOST POPULAR</div>
            <h4 className="text-xl font-bold text-white mt-2">Growth</h4>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-extrabold text-white">$19.99</span>
              <span className="text-slate-400 text-sm">/mo</span>
            </div>
            <ul className="text-sm text-slate-300 space-y-2 mb-6">
              <li>✓ Everything in Base</li>
              <li>🦅 Keyword tracking while scrolling</li>
              <li>🦅 Hawk icon alerts on matches</li>
              <li>🦅 Appreciations tracking</li>
              <li>🦅 Connection tracking</li>
              <li>🦅 Browser extension</li>
            </ul>
            <Link to="/register" className="block text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2.5 rounded-lg font-medium hover:shadow-lg hover:shadow-purple-500/25 hover:-translate-y-0.5 active:scale-95 transition-all duration-200 btn-shimmer">
              Upgrade to Growth
            </Link>
          </div>
        </div>

        {/* Team Tier */}
        <div className="glass-card-strong gradient-border mt-6 relative reveal hover:-translate-y-1 transition-transform duration-300">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg shadow-purple-500/20">FOR TEAMS</div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h4 className="text-xl font-bold text-white mt-2">Team</h4>
              <div className="mt-1 mb-2">
                <span className="text-3xl font-extrabold text-white">$79.99</span>
                <span className="text-slate-400 text-sm">/mo</span>
              </div>
              <p className="text-sm text-slate-400">Up to 5 team members on one account</p>
            </div>
            <ul className="text-sm text-slate-300 space-y-2 flex-1 md:px-8">
              <li>✓ Everything in Growth</li>
              <li>👥 Up to 5 team members on one account</li>
              <li>👥 Shared keyword tracking & leads</li>
              <li>👥 Team collaboration on content</li>
              <li>👥 Shared calendar & scheduling</li>
              <li>👥 Team analytics dashboard</li>
            </ul>
            <div className="md:w-40">
              <Link to="/register" className="block text-center bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-medium hover:shadow-lg hover:shadow-pink-500/25 hover:-translate-y-0.5 active:scale-95 transition-all duration-200 btn-shimmer">
                Get Team Plan
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-6 py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/0 via-slate-900/50 to-slate-900/0 pointer-events-none"></div>
        <div className="max-w-2xl mx-auto relative z-10">
          <h3 className="text-2xl font-bold text-center mb-12 reveal">What Beta Testers Say</h3>
          <div className="grid md:grid-cols-3 gap-6 stagger-children">
            <div className="glass-card-strong hover:-translate-y-1 transition-transform duration-300">
              <p className="text-sm text-slate-300 italic mb-4">"I used to spend 2 hours a day on social media. Now HawkEye-Cue handles my posts and finds me leads while I'm on the job."</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-sm font-bold">M</div>
                <div>
                  <div className="text-sm font-semibold">Mike R.</div>
                  <div className="text-xs text-slate-400">Roofing Contractor</div>
                </div>
              </div>
            </div>
            <div className="glass-card-strong hover:-translate-y-1 transition-transform duration-300">
              <p className="text-sm text-slate-300 italic mb-4">"The keyword tracking is a game changer. I get notified the second someone in my area needs insurance help."</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center text-sm font-bold">S</div>
                <div>
                  <div className="text-sm font-semibold">Sarah T.</div>
                  <div className="text-xs text-slate-400">Insurance Agent</div>
                </div>
              </div>
            </div>
            <div className="glass-card-strong hover:-translate-y-1 transition-transform duration-300">
              <p className="text-sm text-slate-300 italic mb-4">"The Collaborate tab connected me with 3 roofers who now send me referrals every week. Worth every penny."</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-700 rounded-full flex items-center justify-center text-sm font-bold">J</div>
                <div>
                  <div className="text-sm font-semibold">Jake L.</div>
                  <div className="text-xs text-slate-400">General Contractor</div>
                </div>
              </div>
            </div>
          </div>
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
            <p className="text-sm text-slate-400 mt-3">We support 15 trades: Roofing, General Contractor, Insurance Agent, Real Estate Agent, HVAC, Electrician, Plumber, Landscaper, Junk Removal, Mortgage Lender, Pool Service, Auto Repair, Auto Broker, Cosmetologist, and Esthetician.</p>
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
              What's the Beta Tester deal?
              <span className="text-slate-500 group-open:rotate-45 transition-transform duration-200 text-xl">+</span>
            </summary>
            <p className="text-sm text-slate-400 mt-3">The first 5 users get full Growth access completely free for 3 months. You help us improve the product with feedback, and you get all features at no cost. After 3 months, you can choose any plan.</p>
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
        <p>© 2025 HawkEye-Cue. All rights reserved.</p>
      </footer>
    </div>
  );
}
