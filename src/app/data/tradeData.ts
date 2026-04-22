export interface Trade {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
}

export const trades: Trade[] = [
  {
    id: 'roofer',
    name: 'Roofing',
    icon: '🏠',
    color: '#DC2626',
    bgColor: '#FEE2E2',
    description: 'Residential & Commercial Roofing',
  },
  {
    id: 'contractor',
    name: 'General Contractor',
    icon: '🔨',
    color: '#F59E0B',
    bgColor: '#FEF3C7',
    description: 'Construction & Remodeling',
  },
  {
    id: 'insurance',
    name: 'Insurance Agent',
    icon: '🛡️',
    color: '#1D4ED8',
    bgColor: '#DBEAFE',
    description: 'Life, Auto, Home & Business Insurance',
  },
  {
    id: 'realtor',
    name: 'Real Estate Agent',
    icon: '🏡',
    color: '#059669',
    bgColor: '#D1FAE5',
    description: 'Residential & Commercial Real Estate',
  },
  {
    id: 'junk-removal',
    name: 'Junk Removal',
    icon: '🚛',
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    description: 'Hauling & Waste Removal Services',
  },
  {
    id: 'lender',
    name: 'Mortgage Lender',
    icon: '💰',
    color: '#0891B2',
    bgColor: '#CFFAFE',
    description: 'Home Loans & Refinancing',
  },
  {
    id: 'hvac',
    name: 'HVAC Technician',
    icon: '❄️',
    color: '#0EA5E9',
    bgColor: '#E0F2FE',
    description: 'Heating, Cooling & Air Quality Services',
  },
  {
    id: 'electrician',
    name: 'Electrician',
    icon: '⚡',
    color: '#EAB308',
    bgColor: '#FEF9C3',
    description: 'Electrical Installation & Repair',
  },
  {
    id: 'plumber',
    name: 'Plumber',
    icon: '🔧',
    color: '#3B82F6',
    bgColor: '#DBEAFE',
    description: 'Plumbing & Water Systems',
  },
  {
    id: 'landscaper',
    name: 'Landscaper',
    icon: '🌿',
    color: '#10B981',
    bgColor: '#D1FAE5',
    description: 'Lawn Care & Landscape Design',
  },
  {
    id: 'pool-service',
    name: 'Pool Service',
    icon: '🏊',
    color: '#06B6D4',
    bgColor: '#CFFAFE',
    description: 'Pool Maintenance & Repair',
  },
  {
    id: 'auto-shop',
    name: 'Auto Repair Shop',
    icon: '🔩',
    color: '#DC2626',
    bgColor: '#FEE2E2',
    description: 'Auto Repair & Maintenance',
  },
  {
    id: 'auto-broker',
    name: 'Auto Broker',
    icon: '🚗',
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    description: 'Vehicle Sales & Financing',
  },
  {
    id: 'cosmetologist',
    name: 'Cosmetologist',
    icon: '💇',
    color: '#EC4899',
    bgColor: '#FCE7F3',
    description: 'Hair Styling & Color Services',
  },
  {
    id: 'esthetician',
    name: 'Esthetician',
    icon: '✨',
    color: '#A855F7',
    bgColor: '#F3E8FF',
    description: 'Skincare & Spa Services',
  },
];

export interface TradeContent {
  dailyCue: {
    postIdea: string;
    territory: string;
    action: string;
  };
  todaysCues: Array<{ text: string; time: string }>;
  territories: Array<{
    name: string;
    allowed: string;
    rules: string;
    nextPost: string;
  }>;
  notes: string[];
  samplePosts: Array<{
    platform: string;
    platformIcon: string;
    content: string;
  }>;
  opportunities: Array<{
    title: string;
    description: string;
  }>;
}

export const tradeContent: Record<string, TradeContent> = {
  roofer: {
    dailyCue: {
      postIdea: 'Share a before/after of a recent roof replacement and mention spring storm season prep',
      territory: 'Local Homeowners Group (Allowed Today)',
      action: 'Reply to 3 questions about roof maintenance',
    },
    todaysCues: [
      { text: 'Post storm damage prevention tips', time: '9:00 AM' },
      { text: 'Share customer testimonial video', time: '12:00 PM' },
      { text: 'Post in Hometown Homeowners FB group', time: 'Today' },
      { text: 'Follow up on 5 roof inspection leads', time: 'Today' },
    ],
    territories: [
      {
        name: 'Hometown Homeowners Association',
        allowed: 'Monday, Thursday',
        rules: 'Educational content only, no hard sells',
        nextPost: 'Tomorrow',
      },
      {
        name: 'Storm Damage Support Group',
        allowed: 'Any day',
        rules: 'Helpful tips welcome, promo allowed',
        nextPost: 'Friday',
      },
    ],
    notes: [
      '• Spring storm season = peak posting time',
      '• Before/after photos perform best',
      '• Mention warranties in every post',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'Spring storms are coming! Here are 3 signs your roof needs attention before the weather hits...',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'This roof went from damaged to beautiful in just 2 days! 🏠✨ #roofing #homemaintenance',
      },
      {
        platform: 'LinkedIn',
        platformIcon: '💼',
        content: 'As roofing professionals, we see many homeowners wait too long for repairs. Early detection saves thousands...',
      },
    ],
    opportunities: [
      {
        title: 'Roof Inspection Post',
        description: '4 homeowners requested free inspections',
      },
      {
        title: 'Storm Damage Guide',
        description: '12 people asked about insurance claims',
      },
    ],
  },
  contractor: {
    dailyCue: {
      postIdea: 'Share a kitchen remodel transformation with budget breakdown',
      territory: 'Local Home Improvement Group (Allowed Today)',
      action: 'Answer 3 questions about permit requirements',
    },
    todaysCues: [
      { text: 'Post current project progress photos', time: '9:00 AM' },
      { text: 'Share renovation tips on LinkedIn', time: '12:00 PM' },
      { text: 'Post in Home Remodeling Ideas group', time: 'Today' },
      { text: 'Follow up with 4 estimate requests', time: 'Today' },
    ],
    territories: [
      {
        name: 'Local Home Improvement Hub',
        allowed: 'Wednesday, Saturday',
        rules: 'Before/after photos encouraged, estimates OK',
        nextPost: 'Saturday',
      },
      {
        name: 'DIY vs Hire a Pro Discussion',
        allowed: 'Any day',
        rules: 'Expert advice welcome, no spam',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Progress photos build trust',
      '• Mention timeline and budget transparency',
      '• Customer testimonials = gold',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'This 1980s kitchen got a modern makeover in 3 weeks! Swipe to see the transformation →',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'From outdated to stunning 🔨✨ DM for free estimates #renovation #homeimprovement',
      },
      {
        platform: 'LinkedIn',
        platformIcon: '💼',
        content: 'Managing contractor schedules during material shortages: 5 strategies that actually work...',
      },
    ],
    opportunities: [
      {
        title: 'Kitchen Remodel Post',
        description: '7 people requested estimates',
      },
      {
        title: 'Bathroom Renovation Guide',
        description: '5 saved for future projects',
      },
    ],
  },
  insurance: {
    dailyCue: {
      postIdea: 'If your insurance rates went up this year, you are not alone',
      territory: 'Brighton Moms Group (Allowed Today)',
      action: 'Reply to 3 comments from yesterday',
    },
    todaysCues: [
      { text: 'Post to Facebook Feed', time: '9:00 AM' },
      { text: 'Post to LinkedIn', time: '12:00 PM' },
      { text: 'Post in Brighton Moms Group', time: 'Today' },
      { text: 'Reply to 3 comments', time: 'Today' },
    ],
    territories: [
      {
        name: 'Brighton Moms Group',
        allowed: 'Wednesday',
        rules: 'No links, value only',
        nextPost: 'Tomorrow',
      },
      {
        name: 'Small Business Owners Network',
        allowed: 'Mon, Fri',
        rules: 'Educational posts welcome',
        nextPost: 'Friday',
      },
    ],
    notes: [
      '• Brighton Moms = Wednesdays only',
      '• Try more life insurance posts',
      '• Rate increase posts perform well',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'If your rates went up this year, you are not alone. Let me help you find better coverage...',
      },
      {
        platform: 'LinkedIn',
        platformIcon: '💼',
        content: 'Many homeowners are seeing rate increases and need a policy review. Here\'s what to check...',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'If your insurance went up... you are not alone 👀 #insurance #savingmoney',
      },
    ],
    opportunities: [
      {
        title: 'Life Insurance Reminder',
        description: '3 people requested quotes',
      },
      {
        title: 'Auto Post',
        description: '2 opportunities from FB group',
      },
    ],
  },
  realtor: {
    dailyCue: {
      postIdea: 'Share a just-listed property with a virtual tour link',
      territory: 'First Time Home Buyers Group (Allowed Today)',
      action: 'Answer 3 questions about the current market',
    },
    todaysCues: [
      { text: 'Post new listing with virtual tour', time: '9:00 AM' },
      { text: 'Share market update on LinkedIn', time: '12:00 PM' },
      { text: 'Post in First Time Buyers group', time: 'Today' },
      { text: 'Follow up with 5 showing requests', time: 'Today' },
    ],
    territories: [
      {
        name: 'First Time Home Buyers Support',
        allowed: 'Tuesday, Thursday',
        rules: 'Educational content, listings OK on Thursday',
        nextPost: 'Thursday',
      },
      {
        name: 'Local Real Estate Market Watch',
        allowed: 'Any day',
        rules: 'Market insights welcome, no spam',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Virtual tours get 3x more engagement',
      '• Market updates position you as expert',
      '• Just sold posts build credibility',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'JUST LISTED! Stunning 3BR/2BA in the heart of downtown. Virtual tour in comments 👇',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'This dream home just hit the market! 😍🏡 DM for details #realestate #dreamhome',
      },
      {
        platform: 'LinkedIn',
        platformIcon: '💼',
        content: 'Q1 2026 market update: What buyers and sellers need to know about current rates and inventory...',
      },
    ],
    opportunities: [
      {
        title: 'New Listing Post',
        description: '8 people requested showing times',
      },
      {
        title: 'First Time Buyer Tips',
        description: '6 asked about pre-qualification',
      },
    ],
  },
  'junk-removal': {
    dailyCue: {
      postIdea: 'Share a dramatic before/after of a garage cleanout',
      territory: 'Local Moving & Storage Group (Allowed Today)',
      action: 'Reply to 3 people asking about pricing',
    },
    todaysCues: [
      { text: 'Post estate cleanout before/after', time: '9:00 AM' },
      { text: 'Share eco-friendly disposal tips', time: '12:00 PM' },
      { text: 'Post in Moving & Storage group', time: 'Today' },
      { text: 'Follow up on 4 estimate requests', time: 'Today' },
    ],
    territories: [
      {
        name: 'Moving & Storage Community',
        allowed: 'Monday, Thursday',
        rules: 'Before/afters welcome, pricing allowed',
        nextPost: 'Monday',
      },
      {
        name: 'Decluttering & Organizing Tips',
        allowed: 'Any day',
        rules: 'Helpful content only, soft promo OK',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Spring cleaning season = peak time',
      '• Before/after photos are essential',
      '• Mention eco-friendly disposal',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'From cluttered garage to clean space in just 2 hours! Same-day service available 🚛',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'This transformation though! 😱 Swipe to see the after → #junkremoval #declutter',
      },
      {
        platform: 'TikTok',
        platformIcon: '🎥',
        content: 'POV: We just cleared an entire estate in one day 🏠✨ #satisfying #cleanup',
      },
    ],
    opportunities: [
      {
        title: 'Garage Cleanout Post',
        description: '6 people requested estimates',
      },
      {
        title: 'Eco-Friendly Disposal Guide',
        description: '4 asked about donation options',
      },
    ],
  },
  lender: {
    dailyCue: {
      postIdea: 'Share current mortgage rates and what they mean for buyers',
      territory: 'First Time Home Buyers (Allowed Today)',
      action: 'Answer 3 questions about pre-approval',
    },
    todaysCues: [
      { text: 'Post weekly rate update', time: '9:00 AM' },
      { text: 'Share refinancing tips on LinkedIn', time: '12:00 PM' },
      { text: 'Post in Home Buyers group', time: 'Today' },
      { text: 'Follow up with 5 pre-qual leads', time: 'Today' },
    ],
    territories: [
      {
        name: 'First Time Home Buyers Network',
        allowed: 'Wednesday, Friday',
        rules: 'Educational content, no hard sells',
        nextPost: 'Friday',
      },
      {
        name: 'Real Estate Professionals Group',
        allowed: 'Any day',
        rules: 'Market insights welcome',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Rate updates = consistent engagement',
      '• Pre-approval education builds trust',
      '• Partner with realtors for referrals',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'Rates dropped this week! Here\'s what it means for your monthly payment on a $350k home...',
      },
      {
        platform: 'LinkedIn',
        platformIcon: '💼',
        content: '2026 lending landscape: What borrowers need to know about current rates and requirements...',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'Stop renting! 💰 You might qualify for a home loan easier than you think #mortgage #homebuyer',
      },
    ],
    opportunities: [
      {
        title: 'Rate Update Post',
        description: '9 people requested pre-qualification',
      },
      {
        title: 'First Time Buyer Guide',
        description: '7 asked about down payment assistance',
      },
    ],
  },
  hvac: {
    dailyCue: {
      postIdea: 'Share seasonal HVAC maintenance tips before summer hits',
      territory: 'Local Homeowners Association (Allowed Today)',
      action: 'Answer 3 questions about AC efficiency',
    },
    todaysCues: [
      { text: 'Post AC tune-up special offer', time: '9:00 AM' },
      { text: 'Share energy saving tips', time: '12:00 PM' },
      { text: 'Post in Homeowners group', time: 'Today' },
      { text: 'Follow up on 6 service requests', time: 'Today' },
    ],
    territories: [
      {
        name: 'Local Homeowners Association',
        allowed: 'Tuesday, Thursday',
        rules: 'Helpful tips welcome, seasonal offers OK',
        nextPost: 'Thursday',
      },
      {
        name: 'Home Maintenance & Repair Tips',
        allowed: 'Any day',
        rules: 'Educational content preferred',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Seasonal content performs best',
      '• Filter change reminders = engagement',
      '• Before/after energy bills work great',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'Summer is coming! Don\'t wait for your AC to fail. Book your tune-up now and save 20%...',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'This old unit was costing $300/mo in energy! New install = $120/mo ❄️💰 #hvac #energysavings',
      },
      {
        platform: 'TikTok',
        platformIcon: '🎥',
        content: 'POV: Your AC stops working on the hottest day of the year 🥵 Book maintenance NOW #hvac',
      },
    ],
    opportunities: [
      {
        title: 'AC Tune-Up Post',
        description: '11 homeowners requested appointments',
      },
      {
        title: 'Energy Savings Guide',
        description: '8 asked about new unit quotes',
      },
    ],
  },
  electrician: {
    dailyCue: {
      postIdea: 'Share electrical safety tips for spring home projects',
      territory: 'DIY Home Improvement Group (Allowed Today)',
      action: 'Answer 3 questions about electrical codes',
    },
    todaysCues: [
      { text: 'Post electrical safety checklist', time: '9:00 AM' },
      { text: 'Share panel upgrade benefits', time: '12:00 PM' },
      { text: 'Post in Home Improvement group', time: 'Today' },
      { text: 'Follow up with 4 quote requests', time: 'Today' },
    ],
    territories: [
      {
        name: 'DIY Home Improvement Tips',
        allowed: 'Monday, Wednesday, Friday',
        rules: 'Safety first, when to call a pro',
        nextPost: 'Friday',
      },
      {
        name: 'Smart Home Enthusiasts',
        allowed: 'Any day',
        rules: 'Tech tips and installations welcome',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Safety content builds trust',
      '• Smart home posts get great engagement',
      '• Before/after outlet/panel upgrades work',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: '5 signs your electrical panel needs an upgrade. #3 is a serious fire hazard...',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'From outdated fuse box to modern smart panel ⚡✨ #electrician #homeimprovement',
      },
      {
        platform: 'LinkedIn',
        platformIcon: '💼',
        content: 'As homes add more devices, many panels can\'t keep up. Here\'s what homeowners need to know...',
      },
    ],
    opportunities: [
      {
        title: 'Panel Upgrade Post',
        description: '7 homeowners requested inspections',
      },
      {
        title: 'Smart Home Installation Guide',
        description: '5 asked about whole-home automation',
      },
    ],
  },
  plumber: {
    dailyCue: {
      postIdea: 'Share water heater maintenance tips to prevent failures',
      territory: 'Homeowners Support Group (Allowed Today)',
      action: 'Answer 3 questions about leak detection',
    },
    todaysCues: [
      { text: 'Post spring plumbing checklist', time: '9:00 AM' },
      { text: 'Share water heater tips', time: '12:00 PM' },
      { text: 'Post in Homeowners group', time: 'Today' },
      { text: 'Follow up on 5 emergency calls', time: 'Today' },
    ],
    territories: [
      {
        name: 'Homeowners Support & Tips',
        allowed: 'Tuesday, Saturday',
        rules: 'Maintenance tips welcome, emergency services OK',
        nextPost: 'Saturday',
      },
      {
        name: 'Home Repair DIY vs Pro',
        allowed: 'Any day',
        rules: 'When to DIY vs call a plumber',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Emergency posts get fast response',
      '• Water damage photos = attention',
      '• Seasonal maintenance reminders work',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'Small leak = BIG problem! We fixed this before it caused $10k in damage. Know the warning signs...',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'This water heater was 15 years old. Replaced before it flooded the basement 🔧💧 #plumber',
      },
      {
        platform: 'TikTok',
        platformIcon: '🎥',
        content: 'POV: You hear dripping in your walls at midnight 😰 Call us 24/7 #plumbing #emergency',
      },
    ],
    opportunities: [
      {
        title: 'Leak Detection Post',
        description: '9 homeowners requested inspections',
      },
      {
        title: 'Water Heater Guide',
        description: '6 asked about replacement quotes',
      },
    ],
  },
  landscaper: {
    dailyCue: {
      postIdea: 'Share spring lawn care tips and seasonal services',
      territory: 'Local Garden Club (Allowed Today)',
      action: 'Answer 3 questions about lawn maintenance',
    },
    todaysCues: [
      { text: 'Post seasonal lawn care tips', time: '9:00 AM' },
      { text: 'Share landscape design ideas', time: '12:00 PM' },
      { text: 'Post in Garden Club group', time: 'Today' },
      { text: 'Follow up with 7 estimate requests', time: 'Today' },
    ],
    territories: [
      {
        name: 'Local Garden & Landscape Club',
        allowed: 'Wednesday, Saturday',
        rules: 'Tips welcome, before/afters encouraged',
        nextPost: 'Saturday',
      },
      {
        name: 'Outdoor Living & Patios',
        allowed: 'Any day',
        rules: 'Design ideas and inspiration welcome',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Before/after transformations = gold',
      '• Seasonal content is key',
      '• Time-lapse videos perform amazingly',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'Spring is here! Book your lawn aeration and fertilization now for a perfect summer lawn 🌿',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'Backyard transformation! Swipe to see this overgrown mess turn into a beautiful oasis 🌺✨',
      },
      {
        platform: 'TikTok',
        platformIcon: '🎥',
        content: 'Watch this overgrown yard transform in 60 seconds ⏰🌿 #landscaping #satisfying',
      },
    ],
    opportunities: [
      {
        title: 'Backyard Makeover Post',
        description: '12 people requested design consultations',
      },
      {
        title: 'Seasonal Lawn Care Tips',
        description: '8 asked about maintenance packages',
      },
    ],
  },
  'pool-service': {
    dailyCue: {
      postIdea: 'Share pool opening checklist for summer season',
      territory: 'Pool Owners Community (Allowed Today)',
      action: 'Answer 3 questions about pool chemistry',
    },
    todaysCues: [
      { text: 'Post pool opening special', time: '9:00 AM' },
      { text: 'Share water chemistry tips', time: '12:00 PM' },
      { text: 'Post in Pool Owners group', time: 'Today' },
      { text: 'Follow up with 6 service requests', time: 'Today' },
    ],
    territories: [
      {
        name: 'Pool Owners Community',
        allowed: 'Monday, Thursday',
        rules: 'Maintenance tips welcome, service offers OK',
        nextPost: 'Thursday',
      },
      {
        name: 'Backyard & Outdoor Living',
        allowed: 'Any day',
        rules: 'Pool care and design ideas welcome',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Seasonal opening/closing = peak time',
      '• Green pool before/afters work great',
      '• Water chemistry education builds trust',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'Don\'t let your pool turn green this summer! Book your weekly service now and get first month 20% off 🏊',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'This pool was GREEN yesterday! Crystal clear today 💎🏊 #poolservice #transformation',
      },
      {
        platform: 'TikTok',
        platformIcon: '🎥',
        content: 'Watch this disgusting pool transform in 24 hours 🤢➡️✨ #poolcleaning #satisfying',
      },
    ],
    opportunities: [
      {
        title: 'Pool Opening Post',
        description: '10 people requested seasonal service',
      },
      {
        title: 'Green Pool Recovery',
        description: '5 asked about emergency cleaning',
      },
    ],
  },
  'auto-shop': {
    dailyCue: {
      postIdea: 'Share common car maintenance mistakes that cost drivers money',
      territory: 'Car Enthusiasts Group (Allowed Today)',
      action: 'Answer 3 questions about warning lights',
    },
    todaysCues: [
      { text: 'Post seasonal maintenance reminder', time: '9:00 AM' },
      { text: 'Share diagnostic tips', time: '12:00 PM' },
      { text: 'Post in Car Owners group', time: 'Today' },
      { text: 'Follow up with 8 appointment requests', time: 'Today' },
    ],
    territories: [
      {
        name: 'Car Enthusiasts & Owners',
        allowed: 'Tuesday, Friday',
        rules: 'Helpful tips welcome, maintenance advice encouraged',
        nextPost: 'Friday',
      },
      {
        name: 'Local Auto Care Community',
        allowed: 'Any day',
        rules: 'Honest advice and fair pricing appreciated',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Educational content builds trust',
      '• Explain the "why" behind repairs',
      '• Before/after repair photos work',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'Ignoring that check engine light? Here are 5 reasons why that\'s costing you money...',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'This brake pad was GONE! 🚨 Don\'t wait for grinding sounds. Book your inspection today #autorepair',
      },
      {
        platform: 'TikTok',
        platformIcon: '🎥',
        content: 'Mechanics hate this simple trick that saves you $1000s 😂 JK - just change your oil regularly #cartips',
      },
    ],
    opportunities: [
      {
        title: 'Brake Service Post',
        description: '9 people booked inspections',
      },
      {
        title: 'Check Engine Light Guide',
        description: '11 asked about diagnostic services',
      },
    ],
  },
  'auto-broker': {
    dailyCue: {
      postIdea: 'Share how buyers can get dealer pricing without the hassle',
      territory: 'Car Buyers Network (Allowed Today)',
      action: 'Answer 3 questions about trade-in values',
    },
    todaysCues: [
      { text: 'Post current inventory highlights', time: '9:00 AM' },
      { text: 'Share financing tips on LinkedIn', time: '12:00 PM' },
      { text: 'Post in Car Buyers group', time: 'Today' },
      { text: 'Follow up with 5 pre-approval leads', time: 'Today' },
    ],
    territories: [
      {
        name: 'Car Buyers & Shoppers Network',
        allowed: 'Monday, Wednesday, Friday',
        rules: 'Buyer education welcome, fair deals appreciated',
        nextPost: 'Friday',
      },
      {
        name: 'Auto Financing & Leasing',
        allowed: 'Any day',
        rules: 'Transparent pricing and advice encouraged',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Transparency builds trust fast',
      '• Market insights = authority',
      '• Happy customer testimonials work',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'Stop negotiating with dealerships! We do the work and get you dealer pricing. No markup, no games 🚗',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'Just saved this client $4,200 on their dream car 🎉 DM for your free consultation #autobroker',
      },
      {
        platform: 'LinkedIn',
        platformIcon: '💼',
        content: '2026 auto market update: What buyers need to know about current inventory and pricing trends...',
      },
    ],
    opportunities: [
      {
        title: 'Buyer Education Post',
        description: '13 people requested consultations',
      },
      {
        title: 'Trade-In Value Guide',
        description: '7 asked about appraisals',
      },
    ],
  },
  cosmetologist: {
    dailyCue: {
      postIdea: 'Share spring hair trends and seasonal color transformations',
      territory: 'Local Beauty & Style Group (Allowed Today)',
      action: 'Answer 3 questions about hair care',
    },
    todaysCues: [
      { text: 'Post spring hair color trends', time: '9:00 AM' },
      { text: 'Share before/after transformation', time: '12:00 PM' },
      { text: 'Post in Beauty & Style group', time: 'Today' },
      { text: 'Follow up with 6 booking inquiries', time: 'Today' },
    ],
    territories: [
      {
        name: 'Local Beauty & Style Community',
        allowed: 'Tuesday, Thursday, Saturday',
        rules: 'Transformations welcome, booking links OK',
        nextPost: 'Thursday',
      },
      {
        name: 'Hair Care & Styling Tips',
        allowed: 'Any day',
        rules: 'Education and advice encouraged',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Before/after photos = highest engagement',
      '• Seasonal trends perform best',
      '• Client testimonials build trust',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'Spring is here! 🌸 Time for a fresh new look. Book your color transformation now - limited slots available!',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'From dull to WOW! ✨ Swipe to see this balayage transformation 💇‍♀️ #hairtransformation #balayage',
      },
      {
        platform: 'TikTok',
        platformIcon: '🎥',
        content: 'Watch this hair transformation from start to finish 😍 #hairstylist #beforeandafter #satisfying',
      },
    ],
    opportunities: [
      {
        title: 'Spring Color Transformation',
        description: '11 people requested consultations',
      },
      {
        title: 'Hair Care Tips Post',
        description: '8 asked about product recommendations',
      },
    ],
  },
  esthetician: {
    dailyCue: {
      postIdea: 'Share skincare routine tips for spring weather changes',
      territory: 'Skincare & Beauty Tips (Allowed Today)',
      action: 'Answer 3 questions about facials and treatments',
    },
    todaysCues: [
      { text: 'Post seasonal skincare tips', time: '9:00 AM' },
      { text: 'Share treatment before/afters', time: '12:00 PM' },
      { text: 'Post in Skincare group', time: 'Today' },
      { text: 'Follow up with 7 treatment inquiries', time: 'Today' },
    ],
    territories: [
      {
        name: 'Skincare & Beauty Tips Community',
        allowed: 'Monday, Wednesday, Friday',
        rules: 'Education first, service offers welcome',
        nextPost: 'Friday',
      },
      {
        name: 'Self-Care & Wellness Group',
        allowed: 'Any day',
        rules: 'Wellness tips and spa services OK',
        nextPost: 'Tomorrow',
      },
    ],
    notes: [
      '• Education builds authority',
      '• Seasonal skincare tips = engagement',
      '• Treatment results photos work great',
    ],
    samplePosts: [
      {
        platform: 'Facebook',
        platformIcon: '📘',
        content: 'Spring weather = skin changes! Here are 5 adjustments to make to your skincare routine now...',
      },
      {
        platform: 'Instagram',
        platformIcon: '📸',
        content: 'Glowing skin season ✨ Just look at these results after our signature facial 💆‍♀️ #esthetician #skincare',
      },
      {
        platform: 'TikTok',
        platformIcon: '🎥',
        content: 'POV: You finally booked that facial you\'ve been putting off 😌✨ #selfcare #skincareroutine',
      },
    ],
    opportunities: [
      {
        title: 'Seasonal Skincare Post',
        description: '14 people requested facial appointments',
      },
      {
        title: 'Anti-Aging Treatment Guide',
        description: '9 asked about microneedling services',
      },
    ],
  },
};
