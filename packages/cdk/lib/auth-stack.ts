import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly webClient: cognito.UserPoolClient;
  public readonly mobileClient: cognito.UserPoolClient;
  public readonly extensionClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Cognito User Pool with email sign-in and password policy
    this.userPool = new cognito.UserPool(this, 'SocialLeadGenUserPool', {
      userPoolName: 'SocialLeadGen-UserPool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
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
    this.extensionClient = this.userPool.addClient('ExtensionClient', {
      userPoolClientName: 'SocialLeadGen-Extension',
      generateSecret: false,
      authFlows: {
        userSrp: true,
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
