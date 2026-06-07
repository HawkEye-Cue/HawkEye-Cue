import { Link } from 'react-router-dom';
import HawkAnimations from '../components/HawkAnimations';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <HawkAnimations />
      {/* Nav */}
      <nav className="flex flex-col items-center px-6 py-6 max-w-2xl mx-auto gap-3">
        <h1 className="text-3xl font-extrabold tracking-wider uppercase">HawkEye-Cue</h1>
        <div className="flex gap-3">
          <Link to="/login" className="text-sm text-slate-300 hover:text-white px-4 py-2">Log In</Link>
          <Link to="/register" className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">Sign Up Free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative text-center px-6 py-24 overflow-hidden">
        <div className="max-w-2xl mx-auto relative z-10">
        <div className="text-6xl mb-4">🦅</div>
        <h2 className="text-4xl md:text-5xl font-extrabold mb-4 leading-tight">
          Fully Customizable Social Media<br />Creation and Tracking for Trade Professionals
        </h2>
        <p className="text-lg text-slate-400 mb-8 max-w-2xl mx-auto">
          HawkEye-Cue helps roofers, contractors, agents, and tradespeople generate leads, create content, and track opportunities — all with the precision of a hawk.
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/register" className="bg-blue-600 text-white px-8 py-3 rounded-xl text-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20">
            Get Started Free
          </Link>
          <a href="#pricing" className="border border-slate-600 text-slate-300 px-8 py-3 rounded-xl text-lg font-medium hover:border-slate-400 hover:text-white">
            View Pricing
          </a>
        </div>
        <p className="text-sm text-amber-400 mt-4">🔥 First 5 beta testers get 3 months FREE</p>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20 max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-12">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-4xl mb-4">1️⃣</div>
            <h4 className="font-bold text-lg mb-2">Select Your Trade</h4>
            <p className="text-sm text-slate-400">Choose from 15 trades — roofing, HVAC, real estate, insurance, and more. Everything gets tailored to your industry.</p>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-4">2️⃣</div>
            <h4 className="font-bold text-lg mb-2">Create & Schedule</h4>
            <p className="text-sm text-slate-400">AI generates posts in your tone for Facebook, Instagram, LinkedIn, and TikTok. Schedule them and forget about it.</p>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-4">3️⃣</div>
            <h4 className="font-bold text-lg mb-2">Detect & Connect</h4>
            <p className="text-sm text-slate-400">Our hawk watches for keywords and tags while you scroll. Get notified of leads and thank people who mention you.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 bg-slate-900/50">
        <div className="max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-12">Features</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <div className="text-2xl mb-3">✨</div>
              <h4 className="font-bold text-lg mb-2">Customizable Content Creation</h4>
              <p className="text-sm text-slate-400">Create trade-specific posts your way — write your own, use templates, or let AI generate them for you if you choose. Adapted for each platform with the right tone.</p>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <div className="text-2xl mb-3">📅</div>
              <h4 className="font-bold text-lg mb-2">Post Scheduling</h4>
              <p className="text-sm text-slate-400">Schedule posts across all platforms from one calendar. Never miss a day of content again.</p>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <div className="text-2xl mb-3">🦅</div>
              <h4 className="font-bold text-lg mb-2">Keyword Tracking</h4>
              <p className="text-sm text-slate-400">Our hawk icon appears when someone posts about needing your services. Detect leads while you scroll social media.</p>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <div className="text-2xl mb-3">🙏</div>
              <h4 className="font-bold text-lg mb-2">Appreciations</h4>
              <p className="text-sm text-slate-400">Track who tags you in posts. Thank them, collaborate, and build lasting referral partnerships.</p>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <div className="text-2xl mb-3">🤝</div>
              <h4 className="font-bold text-lg mb-2">Collaborate</h4>
              <p className="text-sm text-slate-400">Network with other trades. Roofers meet insurance agents, realtors meet contractors. Referrals flow naturally.</p>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <div className="text-2xl mb-3">🎯</div>
              <h4 className="font-bold text-lg mb-2">Lead Management</h4>
              <p className="text-sm text-slate-400">Every opportunity tracked in one place. Follow up, convert, and see your stats grow.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-4">Pricing</h3>
        <p className="text-center text-slate-400 mb-12">Simple plans that grow with your business</p>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Beta Tester */}
          <div className="border border-amber-500/50 rounded-xl p-6 bg-amber-950/20 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-600 text-black text-xs font-bold px-3 py-1 rounded-full">LIMITED — 5 SPOTS</div>
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
            <Link to="/register" className="block text-center bg-amber-500 text-black py-2 rounded-lg font-bold hover:bg-amber-400">
              Claim Spot
            </Link>
          </div>

          {/* Base */}
          <div className="border border-slate-600 rounded-xl p-6">
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
            <Link to="/register" className="block text-center bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700">
              Get Started
            </Link>
          </div>

          {/* Growth */}
          <div className="border border-blue-500/50 rounded-xl p-6 bg-blue-950/20 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">MOST POPULAR</div>
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
            <Link to="/register" className="block text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 rounded-lg font-medium hover:opacity-90">
              Upgrade to Growth
            </Link>
          </div>
        </div>

        {/* Team Tier - full width below */}
        <div className="border border-purple-500/50 rounded-xl p-6 bg-purple-950/20 mt-6 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">FOR TEAMS</div>
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
              <Link to="/register" className="block text-center bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-medium hover:opacity-90">
                Get Team Plan
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-6 py-20 bg-slate-900/50">
        <div className="max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-12">What Beta Testers Say</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <p className="text-sm text-slate-300 italic mb-4">"I used to spend 2 hours a day on social media. Now HawkEye-Cue handles my posts and finds me leads while I'm on the job."</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-900 rounded-full flex items-center justify-center text-sm font-bold">M</div>
                <div>
                  <div className="text-sm font-semibold">Mike R.</div>
                  <div className="text-xs text-slate-400">Roofing Contractor</div>
                </div>
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <p className="text-sm text-slate-300 italic mb-4">"The keyword tracking is a game changer. I get notified the second someone in my area needs insurance help."</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-purple-900 rounded-full flex items-center justify-center text-sm font-bold">S</div>
                <div>
                  <div className="text-sm font-semibold">Sarah T.</div>
                  <div className="text-xs text-slate-400">Insurance Agent</div>
                </div>
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <p className="text-sm text-slate-300 italic mb-4">"The Collaborate tab connected me with 3 roofers who now send me referrals every week. Worth every penny."</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-900 rounded-full flex items-center justify-center text-sm font-bold">J</div>
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
        <h3 className="text-2xl font-bold text-center mb-12">FAQ</h3>
        <div className="space-y-4">
          <details className="bg-slate-800 rounded-xl border border-slate-700 p-4 group">
            <summary className="font-semibold cursor-pointer text-white">What trades does HawkEye-Cue support?</summary>
            <p className="text-sm text-slate-400 mt-2">We support 15 trades: Roofing, General Contractor, Insurance Agent, Real Estate Agent, HVAC, Electrician, Plumber, Landscaper, Junk Removal, Mortgage Lender, Pool Service, Auto Repair, Auto Broker, Cosmetologist, and Esthetician.</p>
          </details>
          <details className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <summary className="font-semibold cursor-pointer text-white">How does keyword tracking work?</summary>
            <p className="text-sm text-slate-400 mt-2">Our browser extension scans Facebook, Instagram, LinkedIn, and TikTok while you scroll. When someone posts about needing your services, a hawk icon appears and you can save them as a lead with one click.</p>
          </details>
          <details className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <summary className="font-semibold cursor-pointer text-white">Can I cancel anytime?</summary>
            <p className="text-sm text-slate-400 mt-2">Yes. Cancel anytime and you'll keep access until the end of your billing period. No contracts, no hidden fees.</p>
          </details>
          <details className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <summary className="font-semibold cursor-pointer text-white">What's the Beta Tester deal?</summary>
            <p className="text-sm text-slate-400 mt-2">The first 5 users get full Growth access completely free for 3 months. You help us improve the product with feedback, and you get all features at no cost. After 3 months, you can choose any plan.</p>
          </details>
          <details className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <summary className="font-semibold cursor-pointer text-white">Does it work on mobile?</summary>
            <p className="text-sm text-slate-400 mt-2">Yes! HawkEye-Cue is available as a web app, iOS app, and Android app. Create content, check leads, and manage your schedule from anywhere.</p>
          </details>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <h3 className="text-3xl font-extrabold mb-4">Ready to Hunt for Leads?</h3>
        <p className="text-slate-400 mb-8">Join HawkEye-Cue and let AI do the heavy lifting while you focus on your craft.</p>
        <Link to="/register" className="bg-blue-600 text-white px-10 py-4 rounded-xl text-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 inline-block">
          Get Started Now
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8 text-center text-sm text-slate-500">
        <p>© 2025 HawkEye-Cue. All rights reserved.</p>
      </footer>
    </div>
  );
}
