import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Azure OAuth Configuration
  // Note: This is a PUBLIC CLIENT (no client secret)
  // Uses PKCE (Proof Key for Code Exchange) for security
  azure: {
    clientId: process.env.AZURE_CLIENT_ID || '',
    tenantId: process.env.AZURE_TENANT_ID || '',
    // Azure AD OAuth endpoints
    authorizeUrl: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    // JWKS endpoint - use tenant-specific endpoint for v1.0 tokens
    jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/keys`,
    // v1.0 issuer for compatibility with VS Code tokens
    issuer: `https://sts.windows.net/${process.env.AZURE_TENANT_ID}/`,
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
    'AZURE_TENANT_ID',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy .env.example to .env and fill in your Azure OAuth credentials.\n' +
      'Note: AZURE_CLIENT_SECRET is no longer required (using PKCE for public client).'
    );
  }
}
