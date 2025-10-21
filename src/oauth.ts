import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { config } from './config';

/**
 * OAuth 2.0 Authorization Flow Implementation
 *
 * This implements the OAuth 2.0 Authorization Code Grant flow
 * with PKCE (Proof Key for Code Exchange) as required by OAuth 2.1.
 *
 * SECURITY: This is a PUBLIC CLIENT (like a React app or mobile app).
 * No client secret is used. PKCE provides security instead.
 */
export const oauthRouter = Router();

// In-memory store for access tokens (in production, use a database or secure store)
// Maps session IDs to access tokens
export const tokenStore = new Map<string, { accessToken: string; expiresAt: number }>();

// PKCE code verifier store
// Maps state parameter to code verifier (temporary storage during OAuth flow)
// In production, use Redis or similar with TTL
export const pkceStore = new Map<string, { codeVerifier: string; expiresAt: number }>();

/**
 * PKCE Utility Functions
 */

/**
 * Generates a cryptographically random code verifier
 * Per RFC 7636: 43-128 characters from [A-Z] [a-z] [0-9] - _ . ~
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generates code challenge from verifier using SHA256
 * Per RFC 7636: BASE64URL(SHA256(ASCII(code_verifier)))
 */
function generateCodeChallenge(codeVerifier: string): string {
  return crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
}

/**
 * Stores code verifier associated with state parameter
 * Expires after 10 minutes (typical OAuth flow timeout)
 */
function storeCodeVerifier(state: string, codeVerifier: string): void {
  const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes
  pkceStore.set(state, { codeVerifier, expiresAt });

  // Cleanup expired entries
  for (const [key, value] of pkceStore.entries()) {
    if (Date.now() > value.expiresAt) {
      pkceStore.delete(key);
    }
  }
}

/**
 * Retrieves and removes code verifier for state parameter
 * Returns null if not found or expired
 */
function getAndRemoveCodeVerifier(state: string): string | null {
  const entry = pkceStore.get(state);

  if (!entry) {
    return null;
  }

  // Check expiration
  if (Date.now() > entry.expiresAt) {
    pkceStore.delete(state);
    return null;
  }

  // Remove after retrieval (one-time use)
  pkceStore.delete(state);
  return entry.codeVerifier;
}

/**
 * /authorize endpoint - Initiates OAuth flow
 *
 * This endpoint redirects the user to the Azure AD authorization page.
 * VS Code MCP client will call this when authentication is needed.
 *
 * PKCE Flow:
 * 1. Generate random code_verifier
 * 2. Create SHA256 hash as code_challenge
 * 3. Store verifier temporarily (associated with state)
 * 4. Send challenge to Azure AD
 * 5. Later, in /callback, send verifier to prove we started the flow
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

  // VS Code MCP uses specific redirect URIs
  // Check if redirect_uri is provided in the request (VS Code will provide it)
  const requestedRedirectUri = req.query.redirect_uri as string;
  const redirectUri = requestedRedirectUri || `${config.server.url}/callback`;
  authUrl.searchParams.append('redirect_uri', redirectUri);

  console.log('Using redirect_uri:', redirectUri);

  // Pass through the scope from the request, or use default scopes
  const requestedScope = scope as string || config.scopes.join(' ');
  authUrl.searchParams.append('scope', requestedScope);

  // Pass through the state parameter (REQUIRED for CSRF protection)
  const stateParam = state as string || crypto.randomBytes(16).toString('base64url');
  authUrl.searchParams.append('state', stateParam);

  // PKCE Implementation (REQUIRED for public clients per OAuth 2.1)
  let finalCodeChallenge: string;
  let finalCodeChallengeMethod: string;

  if (code_challenge && code_challenge_method) {
    // Client provided PKCE parameters (e.g., VS Code MCP client)
    // Pass them through and don't generate our own
    finalCodeChallenge = code_challenge as string;
    finalCodeChallengeMethod = code_challenge_method as string;

    console.log('Using client-provided PKCE parameters');
  } else {
    // Client didn't provide PKCE (fallback: generate our own)
    // This ensures PKCE is always used for security
    const codeVerifier = generateCodeVerifier();
    finalCodeChallenge = generateCodeChallenge(codeVerifier);
    finalCodeChallengeMethod = 'S256';

    // Store verifier for later use in /callback
    storeCodeVerifier(stateParam, codeVerifier);

    console.log('Generated PKCE parameters (server-side)');
  }

  authUrl.searchParams.append('code_challenge', finalCodeChallenge);
  authUrl.searchParams.append('code_challenge_method', finalCodeChallengeMethod);

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
 * and exchanges it for an access token using PKCE.
 *
 * PKCE Flow (continued from /authorize):
 * 1. Retrieve the stored code_verifier using state parameter
 * 2. Send code_verifier to Azure AD (proves we started the flow)
 * 3. Azure AD verifies: SHA256(code_verifier) == code_challenge
 * 4. If valid, Azure AD issues access token
 */
oauthRouter.get('/callback', async (req, res) => {
  const { code, state, error, error_description, code_verifier } = req.query;

  console.log('Callback received:', {
    code: code ? 'present' : 'missing',
    state,
    code_verifier: code_verifier ? 'present (from client)' : 'missing',
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

  if (!state) {
    return res.status(400).send('Missing state parameter (required for PKCE)');
  }

  // Get code_verifier (either from client or from our store)
  let finalCodeVerifier: string | null = null;

  if (code_verifier) {
    // VS Code MCP client provided the code_verifier
    finalCodeVerifier = code_verifier as string;
    console.log('Using client-provided code_verifier');
  } else {
    // Retrieve code_verifier from our store (we generated it in /authorize)
    finalCodeVerifier = getAndRemoveCodeVerifier(state as string);

    if (!finalCodeVerifier) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Authentication Failed</h1>
            <p>PKCE verification failed: code_verifier not found or expired.</p>
            <p>This can happen if:</p>
            <ul>
              <li>The OAuth flow took longer than 10 minutes</li>
              <li>The state parameter is invalid</li>
              <li>The server was restarted during the flow</li>
            </ul>
            <p>Please try again.</p>
          </body>
        </html>
      `);
    }

    console.log('Retrieved server-stored code_verifier');
  }

  try {
    // Build token request parameters
    // Use the same redirect_uri that was used in /authorize
    // For VS Code, this should be http://127.0.0.1:33418
    const redirectUriFromQuery = req.query.redirect_uri as string;
    const tokenRedirectUri = redirectUriFromQuery || `${config.server.url}/callback`;

    const tokenParams: Record<string, string> = {
      client_id: config.azure.clientId,
      code: code as string,
      redirect_uri: tokenRedirectUri,
      grant_type: 'authorization_code',
      code_verifier: finalCodeVerifier, // PKCE: Send verifier instead of client_secret
    };

    console.log('Token exchange redirect_uri:', tokenRedirectUri);

    // Note: For public clients, scope may not be required in token request
    // Azure AD will use the scopes from the authorization request

    console.log('Exchanging authorization code for token (PUBLIC CLIENT with PKCE)');

    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      config.azure.tokenUrl,
      new URLSearchParams(tokenParams),
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

    console.log('Access token received (PKCE flow successful):', {
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
          <h1>✅ Authentication Successful!</h1>
          <p>You can close this window and return to VS Code.</p>
          <p><strong>Security:</strong> PKCE (Public Client) - No client secret used</p>
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
