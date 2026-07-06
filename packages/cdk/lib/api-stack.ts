import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  readonly userPool: cognito.UserPool;
  readonly table: dynamodb.Table;
  readonly mediaBucket: s3.Bucket;
}

export class ApiStack extends cdk.Stack {
  public readonly httpApi: apigatewayv2.HttpApi;
  public readonly authPostConfirmationFn: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { userPool, table, mediaBucket } = props;

    // ─── HTTP API with CORS ───────────────────────────────────────────────
    this.httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: 'SocialLeadGen-API',
      corsPreflight: {
        allowOrigins: [
          'https://hawkeyecue.com',
          'https://www.hawkeyecue.com',
          'http://localhost:5173',
        ],
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
        ],
      },
    });

    // ─── Cognito JWT Authorizer ───────────────────────────────────────────
    // Note: We do NOT restrict userPoolClients here — the API Gateway authorizer
    // audience is managed manually (via aws apigatewayv2 update-authorizer) to accept
    // tokens from the Web, Mobile, and Extension clients.
    const authorizer = new apigatewayv2Authorizers.HttpUserPoolAuthorizer(
      'CognitoAuthorizer',
      userPool,
      {
        identitySource: ['$request.header.Authorization'],
      }
    );

    // ─── Shared Lambda configuration ──────────────────────────────────────
    const lambdaDefaults: Partial<lambda.FunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        MEDIA_BUCKET: mediaBucket.bucketName,
      },
    };

    // ─── Auth Post-Confirmation Lambda ────────────────────────────────────
    // NOTE: The PostConfirmation trigger is attached directly on the Cognito User Pool
    // via AWS CLI to avoid a circular dependency between Auth and Api stacks.
    this.authPostConfirmationFn = new lambda.Function(this, 'AuthPostConfirmationFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-AuthPostConfirmation',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/auth-post-confirmation'),
      description: 'Cognito post-confirmation trigger — creates user record in DynamoDB',
    } as lambda.FunctionProps);

    table.grantReadWriteData(this.authPostConfirmationFn);

    // ─── Trade Handler ────────────────────────────────────────────────────
    const tradeHandlerFn = new lambda.Function(this, 'TradeHandlerFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-TradeHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/trade-handler'),
      description: 'Handles GET /trade/list and PUT /trade/select',
    } as lambda.FunctionProps);

    table.grantReadWriteData(tradeHandlerFn);

    // ─── Content Handler ──────────────────────────────────────────────────
    const contentHandlerFn = new lambda.Function(this, 'ContentHandlerFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-ContentHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/content-handler'),
      description: 'Handles content generation, history, upload-url, and delete',
      timeout: cdk.Duration.seconds(30), // AI generation can take longer
    } as lambda.FunctionProps);

    table.grantReadWriteData(contentHandlerFn);
    mediaBucket.grantPut(contentHandlerFn);

    // Grant Bedrock InvokeModel permission for AI content generation
    contentHandlerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        ],
      })
    );

    // ─── Posts Handler ────────────────────────────────────────────────────
    const postsHandlerFn = new lambda.Function(this, 'PostsHandlerFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-PostsHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/posts-handler'),
      description: 'Handles CRUD for scheduled posts',
    } as lambda.FunctionProps);

    table.grantReadWriteData(postsHandlerFn);

    // ─── Post Publisher (EventBridge triggered, no API route) ─────────────
    const postPublisherFn = new lambda.Function(this, 'PostPublisherFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-PostPublisher',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/post-publisher'),
      description: 'EventBridge-triggered Lambda to publish posts via Ayrshare',
    } as lambda.FunctionProps);

    table.grantReadWriteData(postPublisherFn);

    // Grant Secrets Manager read access for Bundle.social API key
    postPublisherFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:SocialLeadGen/BundleSocial*`,
        ],
      })
    );

    // ─── Keywords Handler ─────────────────────────────────────────────────
    const keywordsHandlerFn = new lambda.Function(this, 'KeywordsHandlerFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-KeywordsHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/keywords-handler'),
      description: 'Handles CRUD for keywords and defaults',
    } as lambda.FunctionProps);

    table.grantReadWriteData(keywordsHandlerFn);

    // ─── Opportunities Handler ────────────────────────────────────────────
    const opportunitiesHandlerFn = new lambda.Function(this, 'OpportunitiesHandlerFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-OpportunitiesHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/opportunities-handler'),
      description: 'Handles CRUD for opportunities and stats',
    } as lambda.FunctionProps);

    table.grantReadWriteData(opportunitiesHandlerFn);

    // ─── Subscription Handler ─────────────────────────────────────────────
    const subscriptionHandlerFn = new lambda.Function(this, 'SubscriptionHandlerFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-SubscriptionHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/subscription-handler'),
      description: 'Handles subscription info, checkout, and cancel',
    } as lambda.FunctionProps);

    table.grantReadWriteData(subscriptionHandlerFn);

    // Grant Secrets Manager read access for Stripe keys
    subscriptionHandlerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:SocialLeadGen/Stripe*`,
        ],
      })
    );

    // Stripe Price IDs — these match the products created in Stripe Dashboard (live mode)
    subscriptionHandlerFn.addEnvironment('STRIPE_PRICE_BASE', 'price_1Tg5C7D0B5PTsk5eqGCIt3hh');
    subscriptionHandlerFn.addEnvironment('STRIPE_PRICE_GROWTH', 'price_1Tg5DnD0B5PTsk5ePqsicJF6');
    subscriptionHandlerFn.addEnvironment('STRIPE_PRICE_TEAM', 'price_1Tg5FFD0B5PTsk5eMbU5zIzc');

    // ─── Stripe Webhook Handler (NO auth) ─────────────────────────────────
    const stripeWebhookFn = new lambda.Function(this, 'StripeWebhookFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-StripeWebhook',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/stripe-webhook'),
      description: 'Handles Stripe webhook events (no JWT auth, verified by signature)',
    } as lambda.FunctionProps);

    table.grantReadWriteData(stripeWebhookFn);

    // Grant Secrets Manager read access for Stripe keys
    stripeWebhookFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:SocialLeadGen/Stripe*`,
        ],
      })
    );

    // ─── Daily Cues Handler ───────────────────────────────────────────────
    const dailyCuesHandlerFn = new lambda.Function(this, 'DailyCuesHandlerFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-DailyCuesHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/daily-cues-handler'),
      description: 'Handles GET /cues and PUT /cues/{id}/complete',
    } as lambda.FunctionProps);

    table.grantReadWriteData(dailyCuesHandlerFn);

    // ─── Social Accounts Handler ──────────────────────────────────────────
    const socialAccountsHandlerFn = new lambda.Function(this, 'SocialAccountsHandlerFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-SocialAccountsHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/social-accounts-handler'),
      description: 'Manages social account connections via Bundle.social (connect, list, disconnect)',
    } as lambda.FunctionProps);

    table.grantReadWriteData(socialAccountsHandlerFn);

    // Grant Secrets Manager read access for Bundle.social API key
    socialAccountsHandlerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:SocialLeadGen/BundleSocial*`,
        ],
      })
    );

    // ─── Devices Handler ──────────────────────────────────────────────────
    const devicesHandlerFn = new lambda.Function(this, 'DevicesHandlerFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-DevicesHandler',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/devices-handler'),
      description: 'Handles device registration, unregistration, list, and preferences',
    } as lambda.FunctionProps);

    table.grantReadWriteData(devicesHandlerFn);

    // SNS permissions for device management
    devicesHandlerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sns:CreatePlatformEndpoint', 'sns:DeleteEndpoint'],
        resources: ['*'],
      })
    );

    // ─── Notification Sender (DynamoDB stream triggered, no API route) ────
    const notificationSenderFn = new lambda.Function(this, 'NotificationSenderFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-NotificationSender',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/notification-sender'),
      description: 'DynamoDB stream-triggered Lambda to send push notifications via SNS',
    } as lambda.FunctionProps);

    table.grantReadWriteData(notificationSenderFn);

    // SNS Publish permission for sending push notifications
    notificationSenderFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sns:Publish'],
        resources: ['*'],
      })
    );

    // ─── EventBridge Scheduler IAM Role ───────────────────────────────────
    const schedulerRole = new iam.Role(this, 'EventBridgeSchedulerRole', {
      roleName: 'SocialLeadGen-EventBridgeSchedulerRole',
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Role assumed by EventBridge Scheduler to invoke the post-publisher Lambda',
    });

    // Grant the scheduler role permission to invoke the post-publisher Lambda
    postPublisherFn.grantInvoke(schedulerRole);

    // Add scheduler role ARN and publisher function ARN as env vars on posts-handler
    postsHandlerFn.addEnvironment('SCHEDULER_ROLE_ARN', schedulerRole.roleArn);
    postsHandlerFn.addEnvironment('PUBLISHER_FUNCTION_ARN', postPublisherFn.functionArn);

    // ─── Grant posts-handler permission to manage EventBridge schedules ───
    postsHandlerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'scheduler:CreateSchedule',
          'scheduler:UpdateSchedule',
          'scheduler:DeleteSchedule',
          'scheduler:GetSchedule',
        ],
        resources: [
          `arn:aws:scheduler:${this.region}:${this.account}:schedule/default/*`,
        ],
      })
    );

    // Grant posts-handler iam:PassRole on the scheduler role
    postsHandlerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [schedulerRole.roleArn],
      })
    );

    // ─── DynamoDB Stream on the table ─────────────────────────────────────
    // Add the notification-sender Lambda as an event source for the DynamoDB stream
    // Filter: only trigger on INSERT events where SK begins with "OPP#" (new opportunities)
    notificationSenderFn.addEventSource(
      new lambdaEventSources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        retryAttempts: 3,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT'),
            dynamodb: {
              NewImage: {
                SK: {
                  S: lambda.FilterRule.beginsWith('OPP#'),
                },
              },
            },
          }),
        ],
      })
    );

    // ─── SNS Platform Applications (Push Notifications) ───────────────────
    // Placeholder: Add real APNs/FCM keys after Apple/Google developer accounts are set up
    devicesHandlerFn.addEnvironment('SNS_IOS_PLATFORM_ARN', 'PLACEHOLDER');
    devicesHandlerFn.addEnvironment('SNS_ANDROID_PLATFORM_ARN', 'PLACEHOLDER');

    // ─── API Routes ───────────────────────────────────────────────────────

    // Trade routes
    const tradeIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'TradeIntegration',
      tradeHandlerFn
    );
    this.httpApi.addRoutes({
      path: '/trade/list',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: tradeIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/trade/select',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: tradeIntegration,
      authorizer,
    });

    // Profile routes (handled by trade-handler)
    this.httpApi.addRoutes({
      path: '/profile',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: tradeIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/profile/mfa',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: tradeIntegration,
      authorizer,
    });

    // Content routes
    const contentIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'ContentIntegration',
      contentHandlerFn
    );
    this.httpApi.addRoutes({
      path: '/content/generate',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: contentIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/content/history',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: contentIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/content/upload-url',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: contentIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/content/{id}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: contentIntegration,
      authorizer,
    });

    // Posts routes
    const postsIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'PostsIntegration',
      postsHandlerFn
    );
    this.httpApi.addRoutes({
      path: '/posts/schedule',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: postsIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/posts',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: postsIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/posts/{id}',
      methods: [apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: postsIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/posts/{id}/publish',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: postsIntegration,
      authorizer,
    });

    // Keywords routes
    const keywordsIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'KeywordsIntegration',
      keywordsHandlerFn
    );
    this.httpApi.addRoutes({
      path: '/keywords',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: keywordsIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/keywords/{id}',
      methods: [apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: keywordsIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/keywords/defaults',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: keywordsIntegration,
      authorizer,
    });

    // Opportunities routes
    const opportunitiesIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'OpportunitiesIntegration',
      opportunitiesHandlerFn
    );
    this.httpApi.addRoutes({
      path: '/opportunities',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: opportunitiesIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/opportunities/{id}/status',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: opportunitiesIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/opportunities/{id}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: opportunitiesIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/opportunities/stats',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: opportunitiesIntegration,
      authorizer,
    });

    // Subscription routes
    const subscriptionIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'SubscriptionIntegration',
      subscriptionHandlerFn
    );
    this.httpApi.addRoutes({
      path: '/subscription',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: subscriptionIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/subscription/checkout',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: subscriptionIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/subscription/cancel',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: subscriptionIntegration,
      authorizer,
    });

    // Stripe webhook route — NO auth (verified by Stripe signature)
    const stripeWebhookIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'StripeWebhookIntegration',
      stripeWebhookFn
    );
    this.httpApi.addRoutes({
      path: '/subscription/webhook',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: stripeWebhookIntegration,
    });

    // Daily Cues routes
    const cuesIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'CuesIntegration',
      dailyCuesHandlerFn
    );
    this.httpApi.addRoutes({
      path: '/cues',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: cuesIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/cues/{id}/complete',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: cuesIntegration,
      authorizer,
    });

    // Devices routes
    const devicesIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'DevicesIntegration',
      devicesHandlerFn
    );
    this.httpApi.addRoutes({
      path: '/devices/register',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: devicesIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/devices/{deviceId}',
      methods: [apigatewayv2.HttpMethod.DELETE, apigatewayv2.HttpMethod.PUT],
      integration: devicesIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/devices',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: devicesIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/devices/{deviceId}/preferences',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: devicesIntegration,
      authorizer,
    });

    // Social Accounts routes
    const socialAccountsIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'SocialAccountsIntegration',
      socialAccountsHandlerFn
    );
    this.httpApi.addRoutes({
      path: '/social/accounts',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: socialAccountsIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/social/connect',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: socialAccountsIntegration,
      authorizer,
    });
    this.httpApi.addRoutes({
      path: '/social/accounts/{id}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: socialAccountsIntegration,
      authorizer,
    });

    // ─── Stack Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.httpApi.apiEndpoint,
      exportName: 'SocialLeadGen-ApiUrl',
      description: 'HTTP API Gateway endpoint URL',
    });
  }
}
