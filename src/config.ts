import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Azure OAuth Configuration
  azure: {
    clientId: process.env.AZURE_CLIENT_ID || '',
    clientSecret: process.env.AZURE_CLIENT_SECRET || '',
    tenantId: process.env.AZURE_TENANT_ID || '',
    // Azure AD OAuth endpoints
    authorizeUrl: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
    issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
  },

  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    url: process.env.SERVER_URL || 'http://localhost:3000',
  },

  // OAuth Scopes
  scopes: ['openid', 'profile', 'email'],
};

// Validate required configuration
export function validateConfig(): void {
  const required = [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy .env.example to .env and fill in your Azure OAuth credentials.'
    );
  }
}
