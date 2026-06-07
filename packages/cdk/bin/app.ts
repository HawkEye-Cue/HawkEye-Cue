#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database-stack.js';
import { StorageStack } from '../lib/storage-stack.js';
import { AuthStack } from '../lib/auth-stack.js';
import { ApiStack } from '../lib/api-stack.js';
import { FrontendStack } from '../lib/frontend-stack.js';
import { MainStack } from '../lib/main-stack.js';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const databaseStack = new DatabaseStack(app, 'SocialLeadGen-Database', { env });
const storageStack = new StorageStack(app, 'SocialLeadGen-Storage', { env });
const authStack = new AuthStack(app, 'SocialLeadGen-Auth', { env });

const apiStack = new ApiStack(app, 'SocialLeadGen-Api', {
  env,
  userPool: authStack.userPool,
  table: databaseStack.table,
  mediaBucket: storageStack.mediaBucket,
});

const frontendStack = new FrontendStack(app, 'SocialLeadGen-Frontend', { env });

new MainStack(app, 'SocialLeadGen-Main', {
  env,
  databaseStack,
  storageStack,
  authStack,
  apiStack,
  frontendStack,
});
