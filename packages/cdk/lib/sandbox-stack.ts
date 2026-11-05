import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';

/**
 * SandboxStack — an ISOLATED, minimal billing/Summit/AI test environment.
 *
 * Purpose: verify Stripe checkout, webhooks, subscription access, Summit emails, and
 * (NEW) the two AI endpoints end-to-end with ZERO risk to production and ZERO real
 * charges / real emails.
 *
 * Isolation guarantees (nothing here shares a name or resource with the 6 prod stacks):
 *   • Its own DynamoDB table            SocialLeadGen-Sandbox      (DESTROY on teardown)
 *   • Its own Cognito pool + client     SocialLeadGen-Sandbox-*    (DESTROY on teardown)
 *   • Its own HTTP API                  SocialLeadGen-Sandbox-API
 *   • Lambdas reuse the SAME compiled assets as prod, so we test the real code.
 *   • Reads TEST-mode secrets by id:    SocialLeadGen/sandbox/Stripe, .../Resend
 *   • Bedrock is scoped to the specific foundation models the handlers call.
 *
 * Only synthesized when `-c sandbox=true` is passed to cdk, so a normal prod deploy
 * never includes it. See packages/cdk/bin/app.ts.
 *
 * NOTE: this file was reconstructed from the deployed sandbox template to add the two
 * AI routes; the billing/Summit portion is unchanged from the live sandbox.
 */
export interface SandboxStackProps extends cdk.StackProps {
  /** Owner-confirmed Stripe TEST price IDs. */
  readonly soarTestPriceId: string;
  readonly summitTestPriceId: string;
}

export class SandboxStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SandboxStackProps) {
    super(scope, id, props);

    const STRIPE_SECRET_ID = 'SocialLeadGen/sandbox/Stripe';
    const RESEND_SECRET_ID = 'SocialLeadGen/sandbox/Resend';

    // Hard recipient allowlist (comma-separated) enforced inside the Lambdas before any
    // Resend call. Override via `-c emailAllowlist="a@test.com,b@test.com"`.
    const EMAIL_ALLOWLIST =
      (this.node.tryGetContext('emailAllowlist') as string | undefined) ??
      'briannafrashier@gmail.com,briquez10@gmail.com';

    const stripeSecretArn = `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${STRIPE_SECRET_ID}*`;
    const resendSecretArn = `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${RESEND_SECRET_ID}*`;

    // ─── Preserve existing deployed Lambda code (opt-in) ──────────────────
    // When deploying the NEW AI routes, we do NOT want to also re-publish the code of
    // the 5 EXISTING sandbox Lambdas (post-confirmation, subscription, webhook, team,
    // folio-recap). Their local `dist` bundles differ from what's live, so a plain
    // `fromAsset` would re-upload them and CloudFormation would update their code.
    //
    // With `-c pinExistingAssets=true`, each existing function is pinned to the EXACT
    // S3 asset object currently deployed (read from the live stack on 2026-10-19), so
    // CloudFormation sees NO change to those functions. New AI functions always use
    // fresh `fromAsset`. Normal sandbox deploys (flag absent) keep bundling from dist.
    const pinExistingAssets =
      this.node.tryGetContext('pinExistingAssets') === 'true' ||
      this.node.tryGetContext('pinExistingAssets') === true;

    // CDK bootstrap assets bucket for this account/region (where the deployed zips live).
    const assetsBucket = pinExistingAssets
      ? s3.Bucket.fromBucketName(this, 'CdkAssetsBucket', `cdk-hnb659fds-assets-${this.account}-${this.region}`)
      : undefined;

    // Deployed asset keys for functions whose code is UNCHANGED since 2026-10-19 and
    // should NOT be re-uploaded on a pinned deploy.
    //
    // NOTE (2026-10-20): subscription-handler, stripe-webhook, and team-handler were
    // DELIBERATELY REMOVED from this pin map because the launch-integration billing /
    // entitlement corrections changed their code. With them absent here, existingCode()
    // falls through to a fresh `fromAsset('../../lambdas/dist/<name>')`, so a pinned
    // sandbox deploy (`-c pinExistingAssets=true`) now ships the UPDATED handlers while
    // still leaving the two genuinely-unchanged functions (auth-post-confirmation,
    // folio-recap) pinned to their live objects (no diff). To revert to fully-pinned
    // behavior, re-add their keys here.
    const DEPLOYED_ASSET_KEYS: Record<string, string> = {
      'auth-post-confirmation': 'd0e55ff753fd1d14786cd35b36b5678d1309f5146922108b04cdcb00299bfa96.zip',
      'folio-recap': 'c2209af1fc35182599adc08a32979f8900b13cb4c879486944d5d3eee748316f.zip',
    };

    // Code for an existing function. If the flag is on AND this asset is in the pin map
    // (i.e. genuinely unchanged), pin it to the live S3 object so CloudFormation sees no
    // change. Otherwise (flag off, OR the asset was removed from the pin map because its
    // code changed) bundle fresh from the local `dist` so the update is deployed.
    const existingCode = (assetName: string): lambda.Code => {
      const pinnedKey = DEPLOYED_ASSET_KEYS[assetName];
      if (pinExistingAssets && assetsBucket && pinnedKey) {
        return lambda.Code.fromBucket(assetsBucket, pinnedKey);
      }
      return lambda.Code.fromAsset(`../../lambdas/dist/${assetName}`);
    };

    // ─── Isolated table (same schema as prod; destroyed on teardown) ──────
    const table = new dynamodb.Table(this, 'SandboxTable', {
      tableName: 'SocialLeadGen-Sandbox',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });
    table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
    });

    // ─── Isolated Cognito pool (plain Cognito email — no prod KMS/Resend sender) ──
    const userPool = new cognito.UserPool(this, 'SandboxUserPool', {
      userPoolName: 'SocialLeadGen-Sandbox-UserPool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 8, requireUppercase: true, requireDigits: true, requireSymbols: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      standardAttributes: { email: { required: true, mutable: true } },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const webClient = userPool.addClient('SandboxWebClient', {
      userPoolClientName: 'SocialLeadGen-Sandbox-Web',
      generateSecret: false,
      authFlows: { userSrp: true, userPassword: true },
      preventUserExistenceErrors: true,
    });

    // ─── Shared Lambda config ─────────────────────────────────────────────
    const lambdaDefaults = {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        STRIPE_SECRET_ID,
        RESEND_SECRET_ID,
        EMAIL_ALLOWLIST,
      },
    };

    const stripeSecretPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [stripeSecretArn],
    });
    const resendSecretPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [resendSecretArn],
    });

    // ─── Post-confirmation trigger (creates the user profile on signup) ───
    const postConfirmationFn = new lambda.Function(this, 'SandboxPostConfirmationFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-AuthPostConfirmation',
      handler: 'index.handler',
      code: existingCode('auth-post-confirmation'),
      description: 'Sandbox: Cognito post-confirmation — creates user record in the sandbox table',
    });
    table.grantReadWriteData(postConfirmationFn);
    postConfirmationFn.addToRolePolicy(resendSecretPolicy);
    userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmationFn);

    // ─── Subscription handler (checkout / cancel / portal / trial self-heal) ──
    const subscriptionFn = new lambda.Function(this, 'SandboxSubscriptionFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-SubscriptionHandler',
      handler: 'index.handler',
      code: existingCode('subscription-handler'),
      description: 'Sandbox: subscription info, checkout, cancel (TEST Stripe)',
    });
    table.grantReadWriteData(subscriptionFn);
    subscriptionFn.addToRolePolicy(stripeSecretPolicy);
    subscriptionFn.addEnvironment('STRIPE_PRICE_BASE', props.soarTestPriceId);
    subscriptionFn.addEnvironment('STRIPE_PRICE_GROWTH', props.soarTestPriceId);
    subscriptionFn.addEnvironment('STRIPE_PRICE_SOAR', props.soarTestPriceId);
    subscriptionFn.addEnvironment('STRIPE_PRICE_TEAM', props.summitTestPriceId);

    // ─── Stripe webhook (NO auth; verified by signature against the TEST whsec) ──
    const webhookFn = new lambda.Function(this, 'SandboxStripeWebhookFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-StripeWebhook',
      handler: 'index.handler',
      code: existingCode('stripe-webhook'),
      description: 'Sandbox: Stripe webhook events (TEST mode)',
    });
    table.grantReadWriteData(webhookFn);
    webhookFn.addToRolePolicy(stripeSecretPolicy);
    // The webhook's resolveTier() maps the purchased Price ID → tier using these SAME
    // env vars the checkout uses. Without them every price is unrecognized, so a portal
    // upgrade to Summit can't resolve to 'team'. Reuse the identical props values as
    // subscriptionFn (no hardcoding, no new config).
    webhookFn.addEnvironment('STRIPE_PRICE_BASE', props.soarTestPriceId);
    webhookFn.addEnvironment('STRIPE_PRICE_GROWTH', props.soarTestPriceId);
    webhookFn.addEnvironment('STRIPE_PRICE_SOAR', props.soarTestPriceId);
    webhookFn.addEnvironment('STRIPE_PRICE_TEAM', props.summitTestPriceId);

    // ─── Team handler (Summit invites/permissions/5-cap; emails via sandbox Resend) ──
    const teamFn = new lambda.Function(this, 'SandboxTeamFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-TeamHandler',
      handler: 'index.handler',
      code: existingCode('team-handler'),
      description: 'Sandbox: Summit team invites/permissions (TEST Resend)',
      environment: {
        ...lambdaDefaults.environment,
        // Sandbox invite links deep-link to local staging instead of production.
        APP_BASE_URL: 'http://localhost:5173',
      },
    });
    table.grantReadWriteData(teamFn);
    teamFn.addToRolePolicy(resendSecretPolicy);

    // ─── Opportunities / Pipeline handler (Add Cue, list, stats, status, promote,
    //     follow-ups). Previously MISSING from the sandbox, so every Pipeline call 404'd
    //     and "Add Cue" failed. Reuses the SAME compiled asset + table as prod; only needs
    //     table read/write (no secrets). Entitlement for paid follow-up routes is gated
    //     server-side from the user's profile in the same table. ──
    const opportunitiesFn = new lambda.Function(this, 'SandboxOpportunitiesFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-OpportunitiesHandler',
      handler: 'index.handler',
      code: existingCode('opportunities-handler'),
      description: 'Sandbox: Pipeline opportunities/leads (Add Cue, status, promote, follow-ups)',
    });
    table.grantReadWriteData(opportunitiesFn);

    // ─── Launch-readiness handlers (Batch 1 + Batch 2) ───────────────────
    // Each reuses the SAME compiled asset as prod and is scoped to the ISOLATED
    // sandbox table only. These close the sandbox 404 gaps the frontend hits for
    // Sales/Folio, Profile/Trade, Calendar, Keywords, Appreciations, Network, and
    // Daily Cues. No production resource is referenced; email side-effects use the
    // sandbox TEST Resend secret only.

    // ─── Sandbox EMAIL SUPPRESSION (hard guarantee) ──────────────────────
    // The sales/trade/calendar handlers hardcode SecretId 'SocialLeadGen/Resend'
    // (PRODUCTION Resend) and FROM_EMAIL notifications@hawkeyecue.com — they do NOT
    // honor RESEND_SECRET_ID/EMAIL_ALLOWLIST env. To guarantee sandbox test activity
    // can NEVER email a real recipient, we grant these functions NO Secrets Manager
    // access at all. getResendKey() therefore fails with AccessDenied, which every
    // email call site already catches/returns cleanly:
    //   • POST /sales/deals — deal is written FIRST; the "won" team-win email is a
    //     best-effort try/catch AFTER the write, so the sale still persists.
    //   • POST /sales/notify — wrapped; returns 500 EMAIL_FAILED (no send, no crash).
    //   • POST /sales/linked/invite, POST /profile/suggestion — wrapped (log only).
    //   • POST /calendar/.../invite — wrapped (meeting invite simply not sent).
    // No prod secret is granted and no prod email behavior is modified. The email
    // side-effect routes are intentionally non-functional in the sandbox and remain
    // NOT TESTED on the launch checklist.

    // Batch 1 ─ Sales / Folio handler. All /sales/* routes are gated server-side to
    // Soar+ inside the handler (requirePaidFeature 'revenue'); a Nest caller gets
    // 403 UPGRADE_REQUIRED (not weakened here). Table RW ONLY — no secrets, so no
    // Sale-Cue email can be sent (see EMAIL SUPPRESSION note above).
    const salesFn = new lambda.Function(this, 'SandboxSalesFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-SalesHandler',
      handler: 'index.handler',
      code: existingCode('sales-handler'),
      description: 'Sandbox: sales/deals, stats, folio-config, team-emails, linked (Soar+ gated; email suppressed)',
    });
    table.grantReadWriteData(salesFn);

    // Batch 1 ─ Trade / Profile handler. Serves /trade/* and /profile/*. USER_POOL_ID
    // is pinned to the SANDBOX pool so /profile/delete can only ever target the
    // sandbox pool (the handler deletes Username = caller's own JWT sub). The
    // AdminDeleteUser grant below is scoped to the sandbox pool ARN only.
    const tradeFn = new lambda.Function(this, 'SandboxTradeFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-TradeHandler',
      handler: 'index.handler',
      code: existingCode('trade-handler'),
      description: 'Sandbox: trade selection + profile/preferences/engagement/export/delete',
      environment: {
        ...lambdaDefaults.environment,
        USER_POOL_ID: userPool.userPoolId,
      },
    });
    table.grantReadWriteData(tradeFn);
    // NO Resend grant → /profile/suggestion email is suppressed (wrapped; log only).
    // NO Stripe grant → /profile/delete's optional "cancel subscription" step hits
    // getStripe() which is wrapped (if (stripe) + try/catch): on AccessDenied it
    // simply skips the Stripe cancel and proceeds to delete the sandbox table rows +
    // the sandbox Cognito user. This CANNOT touch the production Stripe account.
    // Account deletion — scoped to the SANDBOX user pool ONLY (never the prod pool).
    tradeFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cognito-idp:AdminDeleteUser'],
        resources: [userPool.userPoolArn],
      }),
    );

    // Batch 1 ─ Calendar handler. Events CRUD + meeting invites. Table RW + sandbox
    // Resend for invite emails. The public /calendar/invite/confirm route (no
    // authorizer, token = randomUUID looked up by exact PK) mirrors prod and only
    // touches the isolated sandbox table.
    const calendarFn = new lambda.Function(this, 'SandboxCalendarFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-CalendarHandler',
      handler: 'index.handler',
      code: existingCode('calendar-handler'),
      description: 'Sandbox: calendar events CRUD + engagement log (meeting-invite email suppressed)',
    });
    table.grantReadWriteData(calendarFn);
    // NO Resend grant → meeting-invite emails are suppressed (wrapped; event still
    // saves, invite just is not emailed). Calendar CRUD is pure DynamoDB.

    // Batch 2 ─ Keywords handler (table only).
    const keywordsFn = new lambda.Function(this, 'SandboxKeywordsFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-KeywordsHandler',
      handler: 'index.handler',
      code: existingCode('keywords-handler'),
      description: 'Sandbox: keywords CRUD + defaults',
    });
    table.grantReadWriteData(keywordsFn);

    // Batch 2 ─ Appreciations handler. Table RW + Bedrock Nova Lite (AI reply draft) +
    // sandbox Resend. No Bundle.social secret granted, so it cannot post externally.
    const appreciationsFn = new lambda.Function(this, 'SandboxAppreciationsFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-AppreciationsHandler',
      handler: 'index.handler',
      code: existingCode('appreciations-handler'),
      description: 'Sandbox: appreciations/mentions, settings, AI reply draft (Nova Lite)',
    });
    table.grantReadWriteData(appreciationsFn);
    appreciationsFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-lite-v1:0`],
      }),
    );

    // Batch 2 ─ Network / Wingman handler (table only).
    const networkFn = new lambda.Function(this, 'SandboxNetworkFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-NetworkHandler',
      handler: 'index.handler',
      code: existingCode('network-handler'),
      description: 'Sandbox: network posts/contacts/region',
    });
    table.grantReadWriteData(networkFn);

    // Batch 2 ─ Daily Cues handler (table only).
    const cuesFn = new lambda.Function(this, 'SandboxCuesFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-DailyCuesHandler',
      handler: 'index.handler',
      code: existingCode('daily-cues-handler'),
      description: 'Sandbox: daily cues list + complete',
    });
    table.grantReadWriteData(cuesFn);

    // ─── Folio recap (on-demand only; NO EventBridge schedule in the sandbox) ──
    const folioRecapFn = new lambda.Function(this, 'SandboxFolioRecapFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-FolioRecap',
      handler: 'index.handler',
      code: existingCode('folio-recap'),
      description: 'Sandbox: folio recap + digests (TEST Resend; invoke manually)',
      timeout: cdk.Duration.minutes(2),
    });
    table.grantReadWriteData(folioRecapFn);
    folioRecapFn.addToRolePolicy(resendSecretPolicy);

    // ─── NEW: Smart Flock Import (AI vision; stateless) ───────────────────
    // Reuses the SAME compiled asset as prod. Stateless — no table/S3 access. Only
    // Bedrock Nova Lite vision, scoped to the single model the handler calls.
    const flockImportFn = new lambda.Function(this, 'SandboxFlockImportFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-FlockImport',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/flock-import'),
      description: 'Sandbox: Smart Flock Import — screenshot → group suggestions (AI vision)',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
    });
    flockImportFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-lite-v1:0`],
      }),
    );
    // Strictly-minimal DynamoDB grant for the entitlement check. The handler's
    // requirePaid() does GetItem(PROFILE); grantTrial() does PutItem (new profile) or
    // UpdateItem (bare-Nest upgrade). It only touches the base table by primary key —
    // no Query/Scan and no GSI access — so we grant exactly those three actions on the
    // ISOLATED sandbox table ARN only (no /index/*, no other table).
    flockImportFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
        resources: [table.tableArn],
      }),
    );

    // ─── Sandbox media bucket (isolated; block all public access) ─────────
    // Design Studio stores large payloads (design JSON with embedded photos,
    // logos, thumbnails) in private S3 via short-lived presigned URLs. The
    // sandbox gets its OWN bucket so no request can ever touch the prod bucket.
    const sandboxMediaBucket = new s3.Bucket(this, 'SandboxMediaBucket', {
      bucketName: `socialleadgen-sandbox-media-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Presigned PUTs come from the browser on a different origin.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      // Sandbox data is disposable — tear down cleanly with the stack.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ─── Content handler (AI text + AI images + Design Studio storage) ────
    // Reuses the SAME compiled asset as prod. The sandbox now exercises the
    // FULL content surface so QA can validate AI photo editing and account-
    // backed Brand Kit / Designs end to end. Everything is ISOLATED:
    //   • table  → sandbox table only (table-scoped grant)
    //   • S3     → sandbox media bucket only (bucket-scoped grant)
    //   • OpenAI → SANDBOX secret (SocialLeadGen/sandbox/OpenAI), never prod
    // So no sandbox AI/storage request can reach a prod bucket, key, or table.
    const SANDBOX_OPENAI_SECRET_ID = 'SocialLeadGen/sandbox/OpenAI';
    const contentFn = new lambda.Function(this, 'SandboxContentFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-ContentHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/content-handler'),
      description: 'Sandbox: AI content (text + images), AI photo edit, Design Studio storage',
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...(lambdaDefaults.environment ?? {}),
        MEDIA_BUCKET: sandboxMediaBucket.bucketName,
        OPENAI_SECRET_ID: SANDBOX_OPENAI_SECRET_ID,
        // gpt-image-1 was retired by OpenAI; this org exposes gpt-image-1.5 (quality) and
        // gpt-image-1-mini. Pin the sandbox to the quality model for photo-edit validation.
        OPENAI_IMAGE_MODEL: 'gpt-image-1.5',
      },
    });
    table.grantReadWriteData(contentFn); // sandbox table ONLY (grant is table-scoped)
    sandboxMediaBucket.grantReadWrite(contentFn); // sandbox bucket ONLY
    contentFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-lite-v1:0`],
      }),
    );
    // Read ONLY the sandbox OpenAI secret (never the prod SocialLeadGen/OpenAI).
    contentFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${SANDBOX_OPENAI_SECRET_ID}*`,
        ],
      }),
    );

    // ─── NEW: Scheduled Posts — persistence ONLY, NO real publishing ──────
    // Goal: let QA save/retrieve/edit/delete/reschedule posts and see them on the
    // calendar, WITHOUT ever publishing to Facebook or any social platform.
    //
    // The prod posts-handler, on POST /posts/schedule, creates an EventBridge Scheduler
    // target. If that target/role were missing it would return a 500 ("scheduling
    // failed"). So we give it a VALID target that is a deliberate NO-OP: a sandbox-only
    // publisher Lambda with NO social code, NO secrets, NO table access, NO network. A
    // fired schedule invokes the no-op and does nothing — publishing cannot happen.

    // Sandbox-only no-op publisher (isolated stand-in for SocialLeadGen-PostPublisher).
    const noopPublisherFn = new lambda.Function(this, 'SandboxNoopPublisherFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-NoopPublisher',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/sandbox-noop-publisher'),
      description: 'Sandbox: NO-OP publisher — never posts to any platform (scheduling QA only)',
    });
    // Intentionally NO grants: no table, no secrets, no social credentials, no other
    // Lambdas. It inherits only lambdaDefaults env (unused) + basic CloudWatch logs.

    // EventBridge Scheduler role — assumable only by the scheduler service; may invoke
    // ONLY the sandbox no-op publisher (never the prod publisher).
    const schedulerRole = new iam.Role(this, 'SandboxSchedulerRole', {
      roleName: 'SocialLeadGen-Sandbox-SchedulerRole',
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Sandbox: role assumed by EventBridge Scheduler to invoke the NO-OP publisher only',
    });
    noopPublisherFn.grantInvoke(schedulerRole); // can invoke ONLY the no-op

    // Dedicated EventBridge Scheduler GROUP for the sandbox. Every schedule the posts
    // handler creates is confined to this group (via SCHEDULE_GROUP_NAME below), and the
    // handler's scheduler IAM permission is scoped to this group ONLY — so it can never
    // touch schedules in the account's default group or any unrelated group.
    const scheduleGroupName = 'SocialLeadGen-Sandbox';
    const scheduleGroup = new scheduler.CfnScheduleGroup(this, 'SandboxScheduleGroup', {
      name: scheduleGroupName,
    });
    scheduleGroup.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Posts handler — reuses the SAME compiled asset as prod; CRUD on the ISOLATED
    // sandbox table only. Scheduler env points at the sandbox role + no-op publisher,
    // and confines all schedules to the sandbox group.
    const postsFn = new lambda.Function(this, 'SandboxPostsFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-Sandbox-PostsHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/posts-handler'),
      description: 'Sandbox: scheduled-posts CRUD (persistence only; no real publishing)',
    });
    table.grantReadWriteData(postsFn); // sandbox table ONLY
    postsFn.addEnvironment('SCHEDULER_ROLE_ARN', schedulerRole.roleArn);
    postsFn.addEnvironment('PUBLISHER_FUNCTION_ARN', noopPublisherFn.functionArn);
    // Confine every schedule this handler creates/reads/deletes to the sandbox group.
    postsFn.addEnvironment('SCHEDULE_GROUP_NAME', scheduleGroupName);
    // Manage EventBridge schedules — scoped to the SANDBOX GROUP ONLY (not default/*).
    postsFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['scheduler:CreateSchedule', 'scheduler:UpdateSchedule', 'scheduler:DeleteSchedule', 'scheduler:GetSchedule'],
        resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/${scheduleGroupName}/*`],
      }),
    );
    // Pass ONLY the sandbox scheduler role (which can invoke ONLY the no-op publisher).
    postsFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [schedulerRole.roleArn],
      }),
    );

    // ─── HTTP API with the sandbox Cognito authorizer ─────────────────────
    const httpApi = new apigatewayv2.HttpApi(this, 'SandboxHttpApi', {
      apiName: 'SocialLeadGen-Sandbox-API',
      corsPreflight: {
        allowOrigins: ['http://localhost:5173', 'http://localhost:8081', 'http://localhost:19006'],
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
        ],
      },
    });
    const authorizer = new apigatewayv2Authorizers.HttpUserPoolAuthorizer('SandboxAuthorizer', userPool, {
      identitySource: ['$request.header.Authorization'],
      userPoolClients: [webClient],
    });

    const subInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxSubInt', subscriptionFn);
    httpApi.addRoutes({ path: '/subscription', methods: [apigatewayv2.HttpMethod.GET], integration: subInt, authorizer });
    httpApi.addRoutes({ path: '/subscription/checkout', methods: [apigatewayv2.HttpMethod.POST], integration: subInt, authorizer });
    httpApi.addRoutes({ path: '/subscription/cancel', methods: [apigatewayv2.HttpMethod.POST], integration: subInt, authorizer });
    httpApi.addRoutes({ path: '/subscription/portal', methods: [apigatewayv2.HttpMethod.POST], integration: subInt, authorizer });

    // Webhook — NO auth (Stripe signature verifies it).
    const webhookInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxWebhookInt', webhookFn);
    httpApi.addRoutes({ path: '/subscription/webhook', methods: [apigatewayv2.HttpMethod.POST], integration: webhookInt });

    // Summit team routes.
    const teamInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxTeamInt', teamFn);
    httpApi.addRoutes({ path: '/team', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/invite', methods: [apigatewayv2.HttpMethod.POST], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/invite/resend', methods: [apigatewayv2.HttpMethod.POST], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/invites/{inviteId}', methods: [apigatewayv2.HttpMethod.DELETE], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/accept', methods: [apigatewayv2.HttpMethod.POST], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/members/{memberId}', methods: [apigatewayv2.HttpMethod.DELETE], integration: teamInt, authorizer });
    // Paid team data/management routes (gated server-side by owner Summit entitlement).
    httpApi.addRoutes({ path: '/team/name', methods: [apigatewayv2.HttpMethod.PUT], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/colors', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/stats', methods: [apigatewayv2.HttpMethod.GET], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/history', methods: [apigatewayv2.HttpMethod.GET], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/leave', methods: [apigatewayv2.HttpMethod.POST], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/calendar', methods: [apigatewayv2.HttpMethod.GET], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/leads', methods: [apigatewayv2.HttpMethod.GET], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/leads/{leadId}/claim', methods: [apigatewayv2.HttpMethod.POST, apigatewayv2.HttpMethod.DELETE], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/analytics', methods: [apigatewayv2.HttpMethod.GET], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/notifications', methods: [apigatewayv2.HttpMethod.GET], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/notifications/{id}/dismiss', methods: [apigatewayv2.HttpMethod.POST], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/folios', methods: [apigatewayv2.HttpMethod.GET], integration: teamInt, authorizer });
    httpApi.addRoutes({ path: '/team/member/{memberUserId}/pipeline', methods: [apigatewayv2.HttpMethod.GET], integration: teamInt, authorizer });

    // ─── Opportunities / Pipeline routes (mirror of prod api-stack) ───────
    // Capture/list/stats/status/delete are free (Nest); promote + follow-up protocol
    // routes are gated server-side to Soar+ inside the handler. All authenticated.
    const oppInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxOppInt', opportunitiesFn);
    httpApi.addRoutes({ path: '/opportunities', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], integration: oppInt, authorizer });
    httpApi.addRoutes({ path: '/opportunities/stats', methods: [apigatewayv2.HttpMethod.GET], integration: oppInt, authorizer });
    httpApi.addRoutes({ path: '/opportunities/protocol-template', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT], integration: oppInt, authorizer });
    httpApi.addRoutes({ path: '/opportunities/{id}', methods: [apigatewayv2.HttpMethod.DELETE], integration: oppInt, authorizer });
    httpApi.addRoutes({ path: '/opportunities/{id}/status', methods: [apigatewayv2.HttpMethod.PUT], integration: oppInt, authorizer });
    httpApi.addRoutes({ path: '/opportunities/{id}/promote', methods: [apigatewayv2.HttpMethod.POST], integration: oppInt, authorizer });
    httpApi.addRoutes({ path: '/opportunities/{id}/followups', methods: [apigatewayv2.HttpMethod.GET], integration: oppInt, authorizer });
    httpApi.addRoutes({ path: '/opportunities/{id}/followups/{stepIdx}', methods: [apigatewayv2.HttpMethod.PUT], integration: oppInt, authorizer });
    httpApi.addRoutes({ path: '/opportunities/{id}/protocol', methods: [apigatewayv2.HttpMethod.PUT], integration: oppInt, authorizer });

    // ─── Batch 1: Sales / Folio routes (authenticated; Soar+ gated in handler) ──
    const salesInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxSalesInt', salesFn);
    httpApi.addRoutes({ path: '/sales/deals', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/deals/{id}', methods: [apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/stats', methods: [apigatewayv2.HttpMethod.GET], integration: salesInt, authorizer });
    // Monthly sales goals (per user + folio) — mirror of prod api-stack. Same sales Lambda + table.
    httpApi.addRoutes({ path: '/sales/goal', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/team-goals', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/notify', methods: [apigatewayv2.HttpMethod.POST], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/team-emails', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/folio-config', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/linked', methods: [apigatewayv2.HttpMethod.GET], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/linked/invite', methods: [apigatewayv2.HttpMethod.POST], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/linked/accept', methods: [apigatewayv2.HttpMethod.POST], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/linked/{id}', methods: [apigatewayv2.HttpMethod.DELETE], integration: salesInt, authorizer });
    httpApi.addRoutes({ path: '/sales/linked/deals', methods: [apigatewayv2.HttpMethod.GET], integration: salesInt, authorizer });

    // ─── Batch 1: Trade / Profile routes (authenticated) ──────────────────
    const tradeInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxTradeInt', tradeFn);
    httpApi.addRoutes({ path: '/trade/list', methods: [apigatewayv2.HttpMethod.GET], integration: tradeInt, authorizer });
    httpApi.addRoutes({ path: '/trade/select', methods: [apigatewayv2.HttpMethod.PUT], integration: tradeInt, authorizer });
    httpApi.addRoutes({ path: '/profile', methods: [apigatewayv2.HttpMethod.GET], integration: tradeInt, authorizer });
    httpApi.addRoutes({ path: '/profile/preferences', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT], integration: tradeInt, authorizer });
    httpApi.addRoutes({ path: '/profile/engagement', methods: [apigatewayv2.HttpMethod.GET], integration: tradeInt, authorizer });
    httpApi.addRoutes({ path: '/profile/suggestion', methods: [apigatewayv2.HttpMethod.POST], integration: tradeInt, authorizer });
    httpApi.addRoutes({ path: '/profile/mfa', methods: [apigatewayv2.HttpMethod.PUT], integration: tradeInt, authorizer });
    httpApi.addRoutes({ path: '/profile/delete', methods: [apigatewayv2.HttpMethod.DELETE], integration: tradeInt, authorizer });
    httpApi.addRoutes({ path: '/profile/export', methods: [apigatewayv2.HttpMethod.GET], integration: tradeInt, authorizer });

    // ─── Batch 1: Calendar routes (authenticated; confirm is public like prod) ──
    const calendarInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxCalendarInt', calendarFn);
    httpApi.addRoutes({ path: '/calendar/events', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], integration: calendarInt, authorizer });
    httpApi.addRoutes({ path: '/calendar/events/bulk', methods: [apigatewayv2.HttpMethod.DELETE], integration: calendarInt, authorizer });
    httpApi.addRoutes({ path: '/calendar/events/{id}', methods: [apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE], integration: calendarInt, authorizer });
    httpApi.addRoutes({ path: '/calendar/events/{id}/toggle', methods: [apigatewayv2.HttpMethod.PUT], integration: calendarInt, authorizer });
    httpApi.addRoutes({ path: '/calendar/events/{id}/notes', methods: [apigatewayv2.HttpMethod.PUT], integration: calendarInt, authorizer });
    httpApi.addRoutes({ path: '/calendar/events/{id}/invite', methods: [apigatewayv2.HttpMethod.POST], integration: calendarInt, authorizer });
    httpApi.addRoutes({ path: '/calendar/engagement', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], integration: calendarInt, authorizer });
    httpApi.addRoutes({ path: '/calendar/invite', methods: [apigatewayv2.HttpMethod.POST], integration: calendarInt, authorizer });
    // NOTE: the public (no-auth) GET /calendar/invite/confirm route is DELIBERATELY
    // EXCLUDED from this batch. The handler's confirm path has no token TTL/expiration
    // and no replay guard (a valid token stays confirmable and re-confirmable). Rather
    // than expose an unauthenticated endpoint with those gaps in the sandbox, we omit
    // it. Meeting-invite emails are suppressed anyway (no Resend grant), so no
    // confirmation links are generated during sandbox testing. Revisit with a tested
    // expiration + single-use fix before enabling.

    // ─── Batch 2: Keywords routes ─────────────────────────────────────────
    const keywordsInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxKeywordsInt', keywordsFn);
    httpApi.addRoutes({ path: '/keywords', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], integration: keywordsInt, authorizer });
    httpApi.addRoutes({ path: '/keywords/{id}', methods: [apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE], integration: keywordsInt, authorizer });
    httpApi.addRoutes({ path: '/keywords/defaults', methods: [apigatewayv2.HttpMethod.GET], integration: keywordsInt, authorizer });

    // ─── Batch 2: Appreciations routes ────────────────────────────────────
    const apprInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxApprInt', appreciationsFn);
    httpApi.addRoutes({ path: '/appreciations', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], integration: apprInt, authorizer });
    httpApi.addRoutes({ path: '/appreciations/settings', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT], integration: apprInt, authorizer });
    httpApi.addRoutes({ path: '/appreciations/{id}/thank', methods: [apigatewayv2.HttpMethod.PUT], integration: apprInt, authorizer });
    httpApi.addRoutes({ path: '/appreciations/{id}', methods: [apigatewayv2.HttpMethod.DELETE], integration: apprInt, authorizer });
    httpApi.addRoutes({ path: '/appreciations/generate-reply', methods: [apigatewayv2.HttpMethod.POST], integration: apprInt, authorizer });

    // ─── Batch 2: Network / Wingman routes ────────────────────────────────
    const networkInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxNetworkInt', networkFn);
    httpApi.addRoutes({ path: '/network/posts', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], integration: networkInt, authorizer });
    httpApi.addRoutes({ path: '/network/posts/{id}', methods: [apigatewayv2.HttpMethod.DELETE], integration: networkInt, authorizer });
    httpApi.addRoutes({ path: '/network/posts/{id}/reply', methods: [apigatewayv2.HttpMethod.POST], integration: networkInt, authorizer });
    httpApi.addRoutes({ path: '/network/contacts', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST], integration: networkInt, authorizer });
    httpApi.addRoutes({ path: '/network/contacts/{id}', methods: [apigatewayv2.HttpMethod.DELETE], integration: networkInt, authorizer });
    httpApi.addRoutes({ path: '/network/region', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT], integration: networkInt, authorizer });

    // ─── Batch 2: Daily Cues routes ───────────────────────────────────────
    const cuesInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxCuesInt', cuesFn);
    httpApi.addRoutes({ path: '/cues', methods: [apigatewayv2.HttpMethod.GET], integration: cuesInt, authorizer });
    httpApi.addRoutes({ path: '/cues/{id}/complete', methods: [apigatewayv2.HttpMethod.PUT], integration: cuesInt, authorizer });

    // ─── NEW: AI routes (authenticated, same Cognito authorizer) ──────────
    const flockImportInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxFlockImportInt', flockImportFn);
    httpApi.addRoutes({ path: '/flock/import', methods: [apigatewayv2.HttpMethod.POST], integration: flockImportInt, authorizer });

    const contentInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxContentInt', contentFn);
    // AI text
    httpApi.addRoutes({ path: '/content/generate', methods: [apigatewayv2.HttpMethod.POST], integration: contentInt, authorizer });
    httpApi.addRoutes({ path: '/content/ideas', methods: [apigatewayv2.HttpMethod.POST], integration: contentInt, authorizer });
    // AI images (gpt-image-1): generation + natural-language photo editing
    httpApi.addRoutes({ path: '/content/generate-image', methods: [apigatewayv2.HttpMethod.POST], integration: contentInt, authorizer });
    httpApi.addRoutes({ path: '/content/edit-image', methods: [apigatewayv2.HttpMethod.POST], integration: contentInt, authorizer });
    // Design Studio: account-backed Brand Kit + saved Designs (each path explicit)
    httpApi.addRoutes({ path: '/brand-kit', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT], integration: contentInt, authorizer });
    httpApi.addRoutes({ path: '/brand-kit/logo-upload', methods: [apigatewayv2.HttpMethod.POST], integration: contentInt, authorizer });
    httpApi.addRoutes({ path: '/designs', methods: [apigatewayv2.HttpMethod.GET], integration: contentInt, authorizer });
    httpApi.addRoutes({ path: '/designs/{id}', methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE], integration: contentInt, authorizer });
    httpApi.addRoutes({ path: '/designs/{id}/upload', methods: [apigatewayv2.HttpMethod.POST], integration: contentInt, authorizer });

    // NEW: Scheduled-posts CRUD routes (authenticated). /posts/{id}/publish returns
    // 501 in the handler (no immediate publish), so it is harmless to expose.
    const postsInt = new apigatewayv2Integrations.HttpLambdaIntegration('SandboxPostsInt', postsFn);
    httpApi.addRoutes({ path: '/posts/schedule', methods: [apigatewayv2.HttpMethod.POST], integration: postsInt, authorizer });
    httpApi.addRoutes({ path: '/posts', methods: [apigatewayv2.HttpMethod.GET], integration: postsInt, authorizer });
    httpApi.addRoutes({ path: '/posts/{id}', methods: [apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE], integration: postsInt, authorizer });
    httpApi.addRoutes({ path: '/posts/{id}/publish', methods: [apigatewayv2.HttpMethod.POST], integration: postsInt, authorizer });

    // ─── Outputs for the manual verification run ──────────────────────────
    new cdk.CfnOutput(this, 'SandboxApiUrl', { value: httpApi.apiEndpoint, description: 'Point apps/web/.env.staging VITE_API_URL here' });
    new cdk.CfnOutput(this, 'SandboxUserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'SandboxWebClientId', { value: webClient.userPoolClientId });
    new cdk.CfnOutput(this, 'SandboxWebhookUrl', { value: `${httpApi.apiEndpoint}/subscription/webhook`, description: 'Register this as the Stripe TEST webhook endpoint' });
    new cdk.CfnOutput(this, 'SandboxFolioRecapFnName', { value: folioRecapFn.functionName, description: 'Invoke manually to test nightly emails' });
  }
}
