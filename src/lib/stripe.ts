import { loadStripe } from '@stripe/stripe-js'

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

if (!stripePublishableKey) {
  throw new Error('Missing Stripe publishable key')
}

export const stripePromise = loadStripe(stripePublishableKey)

// Stripe Price IDs - You'll need to create these in Stripe Dashboard
export const STRIPE_PRICES = {
  beta: 'price_beta', // Replace with actual Price ID from Stripe
  starter: 'price_starter', // Replace with actual Price ID from Stripe
  growth: 'price_growth', // Replace with actual Price ID from Stripe
  team: 'price_team', // Replace with actual Price ID from Stripe
}

// Plan types
export type PlanType = 'free' | 'beta' | 'starter' | 'growth' | 'team'

// Check if user has access to a feature
export const hasFeatureAccess = (userPlan: PlanType, requiredPlan: PlanType): boolean => {
  const planHierarchy: Record<PlanType, number> = {
    free: 0,
    beta: 2,
    starter: 1,
    growth: 3,
    team: 4,
  }

  return planHierarchy[userPlan] >= planHierarchy[requiredPlan]
}
