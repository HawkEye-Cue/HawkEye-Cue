import { Amplify } from 'aws-amplify';

// These values come from CDK outputs / environment variables.
// In local dev, copy apps/web/.env.local.example to apps/web/.env.local and fill in.
// In production they are injected by the deploy script into .env.production.
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const region = import.meta.env.VITE_COGNITO_REGION || 'us-east-1';

if (!userPoolId || !userPoolClientId) {
  console.warn(
    '[Amplify] VITE_COGNITO_USER_POOL_ID or VITE_COGNITO_CLIENT_ID is not set. ' +
    'Auth will not work. Copy .env.local.example to .env.local and fill in the values.',
  );
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: userPoolId ?? '',
      userPoolClientId: userPoolClientId ?? '',
      signUpVerificationMethod: 'code',
      loginWith: {
        email: true,
      },
    },
  },
});
