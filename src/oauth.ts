import { Router } from 'express';
import axios from 'axios';
import { config } from './config';

/**
 * OAuth 2.0 Authorization Flow Implementation
 *
 * This implements the OAuth 2.0 Authorization Code Grant flow
 * with PKCE (Proof Key for Code Exchange) as required by OAuth 2.1.
 */
export const oauthRouter = Router();

// In-memory store for access tokens (in production, use a database or secure store)
// Maps session IDs to access tokens
export const tokenStore = new Map<string, { accessToken: string; expiresAt: number }>();

/**
 * /authorize endpoint - Initiates OAuth flow
 *
 * This endpoint redirects the user to the Azure AD authorization page.
 * VS Code MCP client will call this when authentication is needed.
 */
oauthRouter.get('/authorize', (req, res) => {
  const { scope, state, code_challenge, code_challenge_method } = req.query;

  console.log('Authorization request received:', {
    scope,
    state,
    code_challenge: code_challenge ? 'present' : 'missing',
    code_challenge_method,
  });

  // Build the authorization URL
  const authUrl = new URL(config.azure.authorizeUrl);
  authUrl.searchParams.append('client_id', config.azure.clientId);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('redirect_uri', `${config.server.url}/callback`);

  // Pass through the scope from the request, or use default scopes
  const requestedScope = scope as string || config.scopes.join(' ');
  authUrl.searchParams.append('scope', requestedScope);

  // Pass through the state parameter (REQUIRED for CSRF protection)
  if (state) {
    authUrl.searchParams.append('state', state as string);
  }

  // PKCE support (MUST implement per OAuth 2.1 Section 7.5.2)
  if (code_challenge && code_challenge_method) {
    authUrl.searchParams.append('code_challenge', code_challenge as string);
    authUrl.searchParams.append('code_challenge_method', code_challenge_method as string);
  }

  // Response mode
  authUrl.searchParams.append('response_mode', 'query');

  console.log('Redirecting to Azure AD:', authUrl.toString());

  // Redirect user to Azure AD authorization page
  res.redirect(authUrl.toString());
});

/**
 * /callback endpoint - Handles OAuth provider redirect
 *
 * This endpoint receives the authorization code from Azure AD
 * and exchanges it for an access token.
 */
oauthRouter.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  console.log('Callback received:', {
    code: code ? 'present' : 'missing',
    state,
    error,
    error_description,
  });

  // Handle authorization errors
  if (error) {
    console.error('Authorization error:', error, error_description);
    return res.status(400).send(`
      <html>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: ${error}</p>
          <p>Description: ${error_description || 'No description provided'}</p>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      config.azure.tokenUrl,
      new URLSearchParams({
        client_id: config.azure.clientId,
        client_secret: config.azure.clientSecret,
        code: code as string,
        redirect_uri: `${config.server.url}/callback`,
        grant_type: 'authorization_code',
        // Include resource parameter per RFC 8707 (Resource Indicators)
        // This MUST be sent by clients to indicate the intended resource
        resource: config.server.url,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      }
    );

    const { access_token, expires_in, token_type } = tokenResponse.data;

    if (!access_token) {
      throw new Error('No access token received from authorization server');
    }

    console.log('Access token received:', {
      token_type,
      expires_in,
      has_access_token: !!access_token,
    });

    // Store the access token
    // In a real implementation, you would:
    // 1. Associate this with the user's session
    // 2. Store in a secure, persistent store (database, credential manager)
    // 3. Implement token refresh logic
    const sessionId = Math.random().toString(36).substring(7);
    const expiresAt = Date.now() + (expires_in * 1000);

    tokenStore.set(sessionId, {
      accessToken: access_token,
      expiresAt,
    });

    console.log(`Token stored with session ID: ${sessionId}`);

    // Return success page
    // In production with VS Code, this would typically redirect to a vscode:// URI
    // or use the state parameter to communicate back to the extension
    res.send(`
      <html>
        <body>
          <h1>Authentication Successful!</h1>
          <p>You can close this window and return to VS Code.</p>
          <p>Session ID: <code>${sessionId}</code></p>
          <p>Access token has been stored and will be used for MCP requests.</p>
          <script>
            // In a real VS Code integration, you would:
            // 1. Redirect to vscode:// custom URI scheme
            // 2. Or communicate via the state parameter
            // 3. Or use postMessage to communicate with the parent window
            setTimeout(() => {
              window.close();
            }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error exchanging authorization code for access token:', error);

    let errorMessage = 'Unknown error';
    if (axios.isAxiosError(error) && error.response) {
      errorMessage = JSON.stringify(error.response.data, null, 2);
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    res.status(500).send(`
      <html>
        <body>
          <h1>Authentication Failed</h1>
          <p>Error exchanging authorization code for access token.</p>
          <pre>${errorMessage}</pre>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
  }
});

/**
 * Helper function to get token from store
 */
export function getTokenFromStore(sessionId: string): string | null {
  const tokenData = tokenStore.get(sessionId);

  if (!tokenData) {
    return null;
  }

  // Check if token is expired
  if (Date.now() > tokenData.expiresAt) {
    tokenStore.delete(sessionId);
    return null;
  }

  return tokenData.accessToken;
}
