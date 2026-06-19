import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  readonly tableName?: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly webClient: cognito.UserPoolClient;
  public readonly mobileClient: cognito.UserPoolClient;
  public readonly extensionClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: AuthStackProps) {
    super(scope, id, props);

    const tableName = props?.tableName ?? 'SocialLeadGen';

    // ─── Custom Auth Challenge Lambdas (MFA via email/SMS) ────────────────
    // NOTE: These are defined but NOT attached as triggers yet.
    // MFA will be enabled once SES is configured for noreply@hawkeyecue.com.
    const lambdaDefaults: Partial<lambda.FunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
    };

    new lambda.Function(this, 'DefineAuthChallengeFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-DefineAuthChallenge',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/auth-define-challenge'),
      description: 'Cognito Define Auth Challenge — controls MFA flow (not yet active)',
    } as lambda.FunctionProps);

    const createChallengeFn = new lambda.Function(this, 'CreateAuthChallengeFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-CreateAuthChallenge',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/auth-create-challenge'),
      description: 'Cognito Create Auth Challenge — generates and sends MFA code (not yet active)',
      environment: {
        TABLE_NAME: tableName,
        FROM_EMAIL: 'noreply@hawkeyecue.com',
      },
    } as lambda.FunctionProps);

    // Grant SES, SNS, and DynamoDB permissions to createChallenge
    createChallengeFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      })
    );
    createChallengeFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sns:Publish'],
        resources: ['*'],
      })
    );
    createChallengeFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem'],
        resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${tableName}`],
      })
    );

    new lambda.Function(this, 'VerifyAuthChallengeFn', {
      ...lambdaDefaults,
      functionName: 'SocialLeadGen-VerifyAuthChallenge',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../lambdas/dist/auth-verify-challenge'),
      description: 'Cognito Verify Auth Challenge — checks MFA code (not yet active)',
    } as lambda.FunctionProps);

    // ─── Cognito User Pool ────────────────────────────────────────────────
    // NOTE: lambdaTriggers for custom auth are intentionally NOT attached.
    // Login uses standard SRP auth until SES is verified and MFA is ready.
    this.userPool = new cognito.UserPool(this, 'SocialLeadGenUserPool', {
      userPoolName: 'SocialLeadGen-UserPool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailSubject: 'Verify your Social Lead Gen account',
        emailBody: 'Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      email: cognito.UserPoolEmail.withCognito('noreply@verificationemail.com'),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Note: Post-confirmation trigger will be added by the API stack after the Lambda is created

    // Web app client
    this.webClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'SocialLeadGen-Web',
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      preventUserExistenceErrors: true,
    });

    // Mobile app client
    this.mobileClient = this.userPool.addClient('MobileClient', {
      userPoolClientName: 'SocialLeadGen-Mobile',
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      preventUserExistenceErrors: true,
    });

    // Browser extension app client
    // Uses USER_PASSWORD_AUTH since browser extensions cannot easily implement SRP
    this.extensionClient = this.userPool.addClient('ExtensionClient', {
      userPoolClientName: 'SocialLeadGen-Extension',
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      preventUserExistenceErrors: true,
    });

    // Stack outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: 'SocialLeadGen-UserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      exportName: 'SocialLeadGen-UserPoolArn',
    });

    new cdk.CfnOutput(this, 'WebClientId', {
      value: this.webClient.userPoolClientId,
      exportName: 'SocialLeadGen-WebClientId',
    });

    new cdk.CfnOutput(this, 'MobileClientId', {
      value: this.mobileClient.userPoolClientId,
      exportName: 'SocialLeadGen-MobileClientId',
    });

    new cdk.CfnOutput(this, 'ExtensionClientId', {
      value: this.extensionClient.userPoolClientId,
      exportName: 'SocialLeadGen-ExtensionClientId',
    });
  }
}
