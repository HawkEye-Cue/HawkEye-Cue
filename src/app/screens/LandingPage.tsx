import { useState } from 'react';
import { HEButton, HECard } from '../components/DesignSystem';
import {
  Calendar,
  Target,
  TrendingUp,
  Users,
  CheckCircle,
  Star,
  MapPin,
  FileText,
  Search,
  Zap,
  Shield,
  Clock,
  ArrowRight,
  Play
} from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
  onViewPricing: () => void;
}

export function LandingPage({ onGetStarted, onViewPricing }: LandingPageProps) {
  const [playingVideo, setPlayingVideo] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F8FAFC]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-[#E2E8F0]">
        <div className="max-w-[390px] mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🦅</span>
            <span className="text-lg font-bold text-[#0F172A]">HawkEye-Cue</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onViewPricing}
              className="text-sm text-[#64748B] hover:text-[#0F172A] font-medium"
            >
              Pricing
            </button>
            <HEButton variant="primary" onClick={onGetStarted}>
              Start Free
            </HEButton>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-4 pt-12 pb-16 text-center">
        <div className="inline-block px-3 py-1 bg-[#DBEAFE] text-[#1D4ED8] rounded-full text-xs font-semibold mb-4">
          🎉 7-Day Free Trial • No Credit Card Required
        </div>

        <h1 className="text-4xl font-bold text-[#0F172A] mb-4 leading-tight">
          Never Miss a Lead on Facebook Again
        </h1>

        <p className="text-lg text-[#64748B] mb-6 px-4 leading-relaxed">
          The social media scheduler built for{' '}
          <strong className="text-[#0F172A]">local businesses</strong> that helps you{' '}
          know what to post, when to post, and how to turn it into opportunities.
        </p>

        <div className="flex flex-col gap-3 mb-8">
          <HEButton variant="primary" onClick={onGetStarted} className="w-full text-base py-3">
            Start Your Free Trial
            <ArrowRight className="w-5 h-5 ml-2" />
          </HEButton>
          <button
            onClick={() => setPlayingVideo(true)}
            className="flex items-center justify-center gap-2 text-[#1D4ED8] font-medium text-sm"
          >
            <Play className="w-4 h-4" />
            Watch 60-second demo
          </button>
        </div>

        {/* Social Proof */}
        <div className="flex flex-col items-center gap-2 text-sm text-[#64748B]">
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-4 h-4 fill-[#F59E0B] text-[#F59E0B]" />
            ))}
          </div>
          <p>Trusted by 500+ local business owners</p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-4 py-12 bg-white">
        <h2 className="text-2xl font-bold text-[#0F172A] text-center mb-2">
          Everything You Need to Grow
        </h2>
        <p className="text-sm text-[#64748B] text-center mb-8 px-4">
          Built specifically for roofers, plumbers, contractors, and local service businesses
        </p>

        <div className="grid gap-4">
          <FeatureCard
            icon={Search}
            title="Facebook Keyword Tracking"
            description="Monitor Facebook groups for keywords like 'need a roofer' and capture leads automatically with our Chrome extension."
            color="#1D4ED8"
          />
          <FeatureCard
            icon={Zap}
            title="AI-Powered Post Creation"
            description="Generate engaging posts tailored to your trade. Adapt content for all platforms with one click."
            color="#22C55E"
          />
          <FeatureCard
            icon={Calendar}
            title="Smart Scheduling"
            description="Daily cues tell you exactly what to post today. Never stare at a blank screen again."
            color="#8B5CF6"
          />
          <FeatureCard
            icon={Target}
            title="Opportunities Tracking"
            description="Captured leads from Facebook automatically saved. Track, follow up, and close deals."
            color="#F59E0B"
          />
          <FeatureCard
            icon={MapPin}
            title="Territory Management"
            description="Track where you've worked with interactive maps. Perfect for door-to-door canvassing."
            color="#EF4444"
          />
          <FeatureCard
            icon={TrendingUp}
            title="Advanced Analytics"
            description="See what's working. Track post performance, engagement, and lead conversion."
            color="#06B6D4"
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="px-4 py-12">
        <h2 className="text-2xl font-bold text-[#0F172A] text-center mb-8">
          How It Works
        </h2>

        <div className="space-y-6">
          <StepCard
            number={1}
            title="Choose Your Trade"
            description="Select your industry from 57 trades. Get pre-loaded keywords and post templates."
          />
          <StepCard
            number={2}
            title="Install Extension"
            description="Add our Chrome extension to monitor Facebook groups for leads automatically."
          />
          <StepCard
            number={3}
            title="Create & Schedule"
            description="Use AI to generate posts, adapt for all platforms, and schedule when to post."
          />
          <StepCard
            number={4}
            title="Capture Leads"
            description="Extension highlights matching posts. Leads saved automatically to Opportunities."
          />
          <StepCard
            number={5}
            title="Follow Up & Close"
            description="Track territories, manage opportunities, and turn leads into customers."
          />
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-4 py-12 bg-gradient-to-r from-[#F0F9FF] to-[#F0FDF4]">
        <h2 className="text-2xl font-bold text-[#0F172A] text-center mb-8">
          What Business Owners Say
        </h2>

        <div className="space-y-4">
          <TestimonialCard
            quote="I was spending 2 hours a day on Facebook looking for leads. Now the extension finds them for me while I work. Game changer!"
            author="Mike R."
            role="Roofing Contractor"
            location="Denver, CO"
          />
          <TestimonialCard
            quote="The AI posts are so good, my customers think I hired a marketing agency. Booked 5 jobs last month from Facebook alone."
            author="Sarah L."
            role="Plumber"
            location="Austin, TX"
          />
          <TestimonialCard
            quote="Finally, a tool that actually understands local businesses. No fluff, just features that help me get more customers."
            author="James K."
            role="HVAC Technician"
            location="Miami, FL"
          />
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="px-4 py-12">
        <h2 className="text-2xl font-bold text-[#0F172A] text-center mb-2">
          Simple, Transparent Pricing
        </h2>
        <p className="text-sm text-[#64748B] text-center mb-8">
          Start with 7 days free. No credit card required.
        </p>

        <div className="grid gap-4 mb-6">
          <PricingPreviewCard
            name="Starter"
            price={29}
            description="Perfect for solo business owners"
            features={['1 Business', 'Calendar & Scheduling', 'Daily Cues', 'Basic Analytics']}
          />
          <PricingPreviewCard
            name="Growth"
            price={49}
            description="Most popular for active businesses"
            badge="🔥 MOST POPULAR"
            features={['Everything in Starter', 'Keyword Tracking + Extension', 'Unlimited AI', 'Advanced Analytics']}
          />
        </div>

        <HEButton variant="secondary" onClick={onViewPricing} className="w-full">
          View All Plans & Features
        </HEButton>
      </section>

      {/* FAQ */}
      <section className="px-4 py-12 bg-white">
        <h2 className="text-2xl font-bold text-[#0F172A] text-center mb-8">
          Frequently Asked Questions
        </h2>

        <div className="space-y-4">
          <FAQItem
            question="Do I need technical skills to use HawkEye-Cue?"
            answer="Not at all! If you can use Facebook, you can use HawkEye-Cue. We've designed it specifically for local business owners who want simple, powerful tools."
          />
          <FAQItem
            question="How does the Chrome extension work?"
            answer="Install it in one click. It monitors Facebook as you browse and highlights posts with your keywords (like 'need a roofer'). Leads are automatically saved to your Opportunities."
          />
          <FAQItem
            question="Can I try it free?"
            answer="Yes! Every plan includes a 7-day free trial. No credit card required to start. Try all features risk-free."
          />
          <FAQItem
            question="What trades do you support?"
            answer="We support 57 trades including roofers, plumbers, electricians, contractors, HVAC, landscaping, pool service, auto shops, realtors, insurance agents, travel agents, and many more."
          />
          <FAQItem
            question="Can I cancel anytime?"
            answer="Absolutely. No contracts, no commitments. Cancel with one click from your account settings."
          />
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 py-16 bg-gradient-to-r from-[#1D4ED8] to-[#22C55E] text-white">
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Never Miss Another Lead?
          </h2>
          <p className="text-lg mb-6 opacity-90">
            Join 500+ local businesses using HawkEye-Cue to grow
          </p>
          <HEButton
            variant="secondary"
            onClick={onGetStarted}
            className="w-full bg-white text-[#1D4ED8] hover:bg-gray-50"
          >
            Start Your 7-Day Free Trial
            <ArrowRight className="w-5 h-5 ml-2" />
          </HEButton>
          <p className="text-sm mt-4 opacity-75">
            No credit card required • Setup in 2 minutes
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-8 bg-[#0F172A] text-white">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-2xl">🦅</span>
            <span className="text-lg font-bold">HawkEye-Cue</span>
          </div>
          <p className="text-sm text-[#94A3B8]">
            Social media scheduling for local businesses
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <h4 className="font-semibold mb-2">Product</h4>
            <ul className="space-y-1 text-[#94A3B8]">
              <li><a href="#features">Features</a></li>
              <li><a href="#pricing" onClick={onViewPricing}>Pricing</a></li>
              <li><a href="#extension">Extension</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Company</h4>
            <ul className="space-y-1 text-[#94A3B8]">
              <li><a href="#about">About</a></li>
              <li><a href="#contact">Contact</a></li>
              <li><a href="#support">Support</a></li>
            </ul>
          </div>
        </div>

        <div className="text-center text-xs text-[#94A3B8] space-y-2">
          <div className="flex justify-center gap-4">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
          </div>
          <p>© 2026 HawkEye-Cue. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, color }: any) {
  return (
    <HECard className="flex items-start gap-3">
      <div
        className="p-2 rounded-lg flex-shrink-0"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div className="flex-1">
        <h3 className="text-base font-semibold text-[#0F172A] mb-1">{title}</h3>
        <p className="text-sm text-[#64748B] leading-relaxed">{description}</p>
      </div>
    </HECard>
  );
}

function StepCard({ number, title, description }: any) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-[#1D4ED8] to-[#22C55E] text-white flex items-center justify-center font-bold">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="text-base font-semibold text-[#0F172A] mb-1">{title}</h3>
        <p className="text-sm text-[#64748B]">{description}</p>
      </div>
    </div>
  );
}

function TestimonialCard({ quote, author, role, location }: any) {
  return (
    <HECard className="border-l-4 border-[#1D4ED8]">
      <p className="text-sm text-[#0F172A] mb-3 italic">"{quote}"</p>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#0F172A]">{author}</p>
          <p className="text-xs text-[#64748B]">{role} • {location}</p>
        </div>
        <div className="flex gap-0.5">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]" />
          ))}
        </div>
      </div>
    </HECard>
  );
}

function PricingPreviewCard({ name, price, description, features, badge }: any) {
  return (
    <HECard className={badge ? 'border-2 border-[#22C55E]' : ''}>
      {badge && (
        <div className="mb-2">
          <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#22C55E]/10 text-[#22C55E]">
            {badge}
          </span>
        </div>
      )}
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-xl font-bold text-[#0F172A]">{name}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-[#0F172A]">${price}</span>
          <span className="text-sm text-[#64748B]">/month</span>
        </div>
      </div>
      <p className="text-sm text-[#64748B] mb-3">{description}</p>
      <ul className="space-y-2">
        {features.map((feature: string, idx: number) => (
          <li key={idx} className="flex items-start gap-2 text-sm text-[#0F172A]">
            <CheckCircle className="w-4 h-4 text-[#22C55E] flex-shrink-0 mt-0.5" />
            {feature}
          </li>
        ))}
      </ul>
    </HECard>
  );
}

function FAQItem({ question, answer }: any) {
  const [open, setOpen] = useState(false);

  return (
    <HECard className="cursor-pointer" onClick={() => setOpen(!open)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#0F172A] flex-1">{question}</h3>
        <div className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          ▼
        </div>
      </div>
      {open && (
        <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{answer}</p>
      )}
    </HECard>
  );
}
