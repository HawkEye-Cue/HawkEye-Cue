# Requirements Document

## Introduction

A React-based web application for social media tracking and AI-assisted lead generation, designed for local trade businesses (roofers, contractors, insurance agents, realtors, etc.). The system allows users to authenticate, select their trade/industry, track social media interactions via a browser extension, generate AI-powered content, schedule posts, and identify lead opportunities from social media activity. User data is persisted in an AWS-hosted PostgreSQL database (Amazon RDS). The application includes subscription-based pricing tiers to gate advanced features.

## Glossary

- **Application**: The React web application for social media tracking and lead generation
- **User**: A registered trade professional using the application
- **Trade**: A specific industry or profession (e.g., Roofing, General Contractor, Insurance Agent, Plumber)
- **Authentication_Service**: The component responsible for user registration, login, and session management
- **Trade_Selector**: The component that allows users to choose and switch their industry/trade
- **Dashboard**: The main homepage view displaying trade-specific content, daily cues, and lead summaries
- **Lead**: A potential customer identified through social media interactions or keyword tracking
- **Opportunity**: A tracked social media interaction that indicates a potential lead
- **AI_Content_Generator**: The component that creates trade-specific social media post content using AI
- **Keyword_Tracker**: The component that monitors social media platforms for trade-relevant keywords
- **Browser_Extension**: A Chrome extension that detects keywords on social media pages and sends matches to the Application
- **Database**: Amazon RDS PostgreSQL instance storing user profiles, interactions, leads, and content
- **Social_Platform**: An external social media service (Facebook, Instagram, LinkedIn, TikTok)
- **Post_Scheduler**: The component that manages scheduling and publishing of social media posts
- **Subscription_Service**: The component that manages pricing tiers and feature access
- **Calendar**: The interface for viewing and managing scheduled posts over time
- **Mobile_App**: The React Native (Expo) mobile application for iOS and Android that provides the same core functionality as the web application

## Requirements

### Requirement 1: User Authentication

**User Story:** As a trade professional, I want to securely register and log into the application, so that my data and leads are protected and personalized to me.

#### Acceptance Criteria

1. WHEN a new user submits a registration form with email and password, THE Authentication_Service SHALL create a new user account and send a confirmation email
2. WHEN a registered user submits valid login credentials, THE Authentication_Service SHALL authenticate the user and establish a session
3. IF a user submits invalid login credentials, THEN THE Authentication_Service SHALL display an error message indicating authentication failure without revealing which field is incorrect
4. WHEN an authenticated user clicks the logout button, THE Authentication_Service SHALL terminate the session and redirect the user to the login page
5. WHILE a user session is expired or invalid, THE Application SHALL redirect the user to the login page
6. THE Authentication_Service SHALL enforce password requirements of minimum 8 characters with at least one uppercase letter and one number

### Requirement 2: Trade Selection

**User Story:** As a trade professional, I want to select my industry from a dropdown on the homepage, so that the application provides content and leads relevant to my specific trade.

#### Acceptance Criteria

1. WHEN an authenticated user has not selected a trade, THE Trade_Selector SHALL display a dropdown menu with all available trades
2. WHEN a user selects a trade from the dropdown, THE Trade_Selector SHALL persist the selection to the Database and customize the Dashboard content for that trade
3. THE Trade_Selector SHALL include the following trades: Roofing, General Contractor, Insurance Agent, Real Estate Agent, HVAC Technician, Electrician, Plumber, Landscaper, Junk Removal, Mortgage Lender, Pool Service, Auto Repair Shop, Auto Broker, Cosmetologist, and Esthetician
4. WHEN a user wishes to change their trade, THE Trade_Selector SHALL allow the user to select a different trade from the dropdown at any time
5. WHEN a trade is selected, THE Database SHALL store the user's trade preference associated with their account

### Requirement 3: Dashboard Homepage

**User Story:** As a trade professional, I want a homepage dashboard that shows my daily tasks, lead summaries, and AI-generated content suggestions, so that I can efficiently manage my social media presence.

#### Acceptance Criteria

1. WHEN an authenticated user with a selected trade navigates to the homepage, THE Dashboard SHALL display trade-specific daily cues and action items
2. THE Dashboard SHALL display a summary of current lead opportunities with a count of active leads
3. WHEN a user completes a daily cue task, THE Dashboard SHALL mark the task as completed and persist the status to the Database
4. THE Dashboard SHALL display an AI-generated post suggestion relevant to the user's selected trade
5. WHEN a user clicks on a lead opportunity summary, THE Dashboard SHALL navigate to the detailed opportunities view
6. THE Dashboard SHALL display upcoming scheduled posts from the Calendar for the current day

### Requirement 4: AI-Assisted Content Generation

**User Story:** As a trade professional, I want AI to generate social media posts tailored to my trade, so that I can maintain an active social media presence without spending hours writing content.

#### Acceptance Criteria

1. WHEN a user requests AI content generation, THE AI_Content_Generator SHALL produce a social media post tailored to the user's selected trade
2. THE AI_Content_Generator SHALL allow the user to select a tone (Professional, Casual, Educational, Urgent) for the generated content
3. THE AI_Content_Generator SHALL allow the user to select a post type specific to their trade (e.g., Before/After, Testimonial, Tips, Storm Prep)
4. WHEN a user provides a base post text, THE AI_Content_Generator SHALL adapt the content for each selected Social_Platform
5. THE AI_Content_Generator SHALL allow the user to select one or more target Social_Platforms (Facebook, Instagram, LinkedIn, TikTok) for the generated content
6. WHEN content is generated, THE Database SHALL store the generated content associated with the user's account
7. THE AI_Content_Generator SHALL allow users to upload images or videos to accompany the generated post

### Requirement 5: Social Media Keyword Tracking

**User Story:** As a trade professional, I want to track relevant keywords across social media platforms, so that I can identify potential leads and engagement opportunities in real time.

#### Acceptance Criteria

1. WHEN a user configures tracking keywords, THE Keyword_Tracker SHALL monitor configured Social_Platforms for posts containing those keywords
2. WHEN a matching keyword is detected in a social media post, THE Keyword_Tracker SHALL create an Opportunity record in the Database
3. THE Keyword_Tracker SHALL allow users to add, edit, and remove tracked keywords
4. WHEN new keyword matches are found, THE Application SHALL display a notification to the user
5. THE Keyword_Tracker SHALL associate each detected opportunity with the relevant trade and keyword that triggered it
6. THE Keyword_Tracker SHALL provide default keyword suggestions based on the user's selected trade

### Requirement 6: Browser Extension for Keyword Detection

**User Story:** As a trade professional, I want a Chrome browser extension that detects relevant keywords while I browse social media, so that I can capture leads without manually searching.

#### Acceptance Criteria

1. WHEN the Browser_Extension is installed and the user is logged in, THE Browser_Extension SHALL scan visible social media page content for configured keywords
2. WHEN the Browser_Extension detects a keyword match on a social media page, THE Browser_Extension SHALL highlight the matching text and display a notification
3. WHEN a user clicks on a highlighted match, THE Browser_Extension SHALL send the matched post details to the Application as a new Opportunity
4. THE Browser_Extension SHALL support keyword detection on Facebook, Instagram, LinkedIn, and TikTok
5. THE Browser_Extension SHALL synchronize its keyword list with the user's configured keywords in the Application
6. IF the Browser_Extension cannot connect to the Application, THEN THE Browser_Extension SHALL queue detected matches locally and sync when connection is restored

### Requirement 7: Post Scheduling and Calendar

**User Story:** As a trade professional, I want to schedule social media posts in advance and view them on a calendar, so that I can maintain a consistent posting schedule without daily manual effort.

#### Acceptance Criteria

1. WHEN a user creates or generates a post, THE Post_Scheduler SHALL allow the user to select a future date and time for publishing
2. THE Calendar SHALL display all scheduled posts in a monthly, weekly, or daily view
3. WHEN a scheduled post's publish time arrives, THE Post_Scheduler SHALL publish the post to the selected Social_Platforms
4. WHEN a user edits a scheduled post, THE Post_Scheduler SHALL update the post content and persist changes to the Database
5. WHEN a user deletes a scheduled post, THE Post_Scheduler SHALL remove the post from the Calendar and the Database
6. THE Calendar SHALL visually distinguish between published posts, scheduled posts, and draft posts

### Requirement 8: Lead and Opportunity Management

**User Story:** As a trade professional, I want to view and manage leads generated from social media tracking, so that I can follow up on potential customers and grow my business.

#### Acceptance Criteria

1. THE Application SHALL display a list of all detected opportunities sorted by recency
2. WHEN a user views an opportunity, THE Application SHALL display the source post content, the platform it was found on, and the keyword that matched
3. WHEN a user marks an opportunity as followed-up, THE Database SHALL update the opportunity status
4. THE Application SHALL display summary statistics including total opportunities, followed-up count, and conversion count
5. WHEN a user deletes an opportunity, THE Database SHALL remove the opportunity record from the user's account

### Requirement 9: Subscription and Pricing Tiers

**User Story:** As a trade professional, I want to choose a subscription plan that fits my needs, so that I can access features appropriate for my business size and budget.

#### Acceptance Criteria

1. THE Subscription_Service SHALL offer at minimum a Free tier and a paid Growth tier
2. WHILE a user is on the Free tier, THE Application SHALL limit AI content generation to a defined number of uses per month
3. WHEN a user attempts to use a feature beyond their tier's limits, THE Application SHALL display an upgrade prompt with plan comparison
4. WHEN a user selects a paid plan, THE Subscription_Service SHALL process payment and activate the plan immediately
5. THE Subscription_Service SHALL allow users to view their current plan, usage, and billing information
6. WHEN a user downgrades or cancels their subscription, THE Subscription_Service SHALL maintain access until the end of the current billing period

### Requirement 10: User Interaction Persistence

**User Story:** As a trade professional, I want all my interactions, preferences, and generated content stored in a database, so that my data is preserved across sessions and devices.

#### Acceptance Criteria

1. THE Database SHALL persist user profile data including email, selected trade, subscription tier, and account creation date
2. THE Database SHALL persist all AI-generated content associated with the user who created it
3. THE Database SHALL persist all keyword tracking configurations per user
4. THE Database SHALL persist all opportunity records with their current status
5. WHEN a user logs in from a different device, THE Application SHALL restore all previously saved data and preferences
6. THE Database SHALL persist all scheduled posts with their publish status and target platforms

### Requirement 11: Mobile Application

**User Story:** As a trade professional, I want to access the application from my iPhone or Android phone, so that I can manage leads, view opportunities, and create content on the go without needing a desktop computer.

#### Acceptance Criteria

1. THE Mobile_App SHALL be available for download on both the Apple App Store (iOS) and Google Play Store (Android)
2. WHEN a user logs in on the Mobile_App, THE Authentication_Service SHALL authenticate using the same Cognito credentials as the web application
3. WHEN a new keyword match or opportunity is detected, THE Mobile_App SHALL deliver a push notification to the user's device via Amazon SNS/Pinpoint
4. WHEN a user taps a push notification, THE Mobile_App SHALL deep-link to the relevant opportunity or content within the app
5. WHILE the device has no network connectivity, THE Mobile_App SHALL allow the user to view previously loaded data (opportunities, scheduled posts, keywords) from local cache
6. WHEN network connectivity is restored, THE Mobile_App SHALL synchronize any locally queued actions (status updates, new keywords) with the backend
7. THE Mobile_App SHALL provide the same core functionality as the web application: dashboard, content creation, calendar, opportunities, keywords, and settings
8. THE Mobile_App SHALL support native device features including camera access for media uploads and biometric authentication (Face ID / fingerprint) for app unlock
