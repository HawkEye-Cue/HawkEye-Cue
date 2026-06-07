import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseStack } from './database-stack.js';
import { StorageStack } from './storage-stack.js';
import { AuthStack } from './auth-stack.js';
import { ApiStack } from './api-stack.js';
import { FrontendStack } from './frontend-stack.js';

export interface MainStackProps extends cdk.StackProps {
  readonly databaseStack: DatabaseStack;
  readonly storageStack: StorageStack;
  readonly authStack: AuthStack;
  readonly apiStack: ApiStack;
  readonly frontendStack: FrontendStack;
}

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    // The main stack composes all sub-stacks and can be extended
    // with additional resources as they are implemented in subsequent tasks.

    new cdk.CfnOutput(this, 'TableName', {
      value: props.databaseStack.table.tableName,
      description: 'DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'MediaBucketName', {
      value: props.storageStack.mediaBucket.bucketName,
      description: 'S3 media uploads bucket name',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: props.authStack.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: props.apiStack.httpApi.apiEndpoint,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: props.frontendStack.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: props.frontendStack.distribution.distributionId,
      description: 'CloudFront distribution ID',
    });

    new cdk.CfnOutput(this, 'SiteBucketName', {
      value: props.frontendStack.siteBucket.bucketName,
      description: 'S3 site bucket name for frontend deployment',
    });
  }
}
