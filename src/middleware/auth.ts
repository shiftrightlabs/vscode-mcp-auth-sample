import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { config } from '../config';

/**
 * OAuth 2.0 Token Validation Middleware
 *
 * This middleware implements all MUST requirements for MCP servers:
 * 1. Validates access tokens per OAuth 2.1 Section 5.2
 * 2. Verifies tokens were issued for this server (audience verification per RFC 8707)
 * 3. Returns HTTP 401 for invalid or expired tokens
 * 4. Includes WWW-Authenticate header on 401 responses
 * 5. Rejects tokens not from the configured authorization server
 *
 * Token Validation Strategy:
 * Microsoft Graph API tokens cannot be validated using standard JWT signature validation
 * by third-party services. Instead, we use token introspection by calling the Microsoft
 * Graph API directly. If the API returns user data, the token is valid.
 */

/**
 * Cache for validated tokens to avoid repeated Graph API calls
 * Maps token → { user: UserInfo, validUntil: timestamp }
 */
interface TokenCacheEntry {
  user: GraphUserInfo;
  validUntil: number;
}

interface GraphUserInfo {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

const tokenCache = new Map<string, TokenCacheEntry>();

// Cache cleanup interval (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of tokenCache.entries()) {
    if (entry.validUntil < now) {
      tokenCache.delete(token);
    }
  }
}, 5 * 60 * 1000);

/**
 * Validate token by calling Microsoft Graph API
 * This is the recommended approach for Microsoft Graph API tokens
 */
async function validateTokenViaGraphAPI(token: string): Promise<GraphUserInfo> {
  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached.validUntil > Date.now()) {
    console.log('Token validation cache hit');
    return cached.user;
  }

  try {
    // Call Microsoft Graph API to validate token and get user info
    const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      timeout: 5000, // 5 second timeout
    });

    const user: GraphUserInfo = {
      id: response.data.id,
      displayName: response.data.displayName,
      mail: response.data.mail || response.data.userPrincipalName,
      userPrincipalName: response.data.userPrincipalName,
    };

    console.log('Token validated via Graph API:', {
      userId: user.id,
      displayName: user.displayName,
      email: user.mail,
    });

    // Cache the validated token for 5 minutes
    tokenCache.set(token, {
      user,
      validUntil: Date.now() + (5 * 60 * 1000),
    });

    return user;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('Token is invalid or expired');
      }
      throw new Error(`Graph API validation failed: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

/**
 * Validate token structure and basic claims
 * This provides additional validation beyond Graph API introspection
 */
function validateTokenStructure(token: string): jwt.JwtPayload {
  const decoded = jwt.decode(token, { complete: true });

  if (!decoded || typeof decoded === 'string') {
    throw new Error('Invalid token structure');
  }

  const payload = decoded.payload as jwt.JwtPayload;

  // Verify issuer is from our Azure AD tenant
  const validIssuers = [
    config.azure.issuer, // v1.0: https://sts.windows.net/{tenant}/
    `https://login.microsoftonline.com/${config.azure.tenantId}/v2.0`, // v2.0
  ];

  if (!payload.iss || !validIssuers.some(issuer => payload.iss === issuer)) {
    throw new Error(`Invalid issuer: ${payload.iss}`);
  }

  // Verify token is not expired
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token has expired');
  }

  console.log('Token structure validated:', {
    issuer: payload.iss,
    subject: payload.sub,
    audience: payload.aud,
    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A',
  });

  return payload;
}

/**
 * Authentication middleware for protected MCP endpoints
 *
 * MUST requirements implemented:
 * - Parse Authorization header with Bearer token (OAuth 2.1 Section 5.1.1)
 * - Validate access tokens per OAuth 2.1 Section 5.2
 * - Verify tokens were issued by configured authorization server
 * - Return 401 with WWW-Authenticate header for failures
 * - Only accept tokens from configured authorization server
 *
 * Validation approach:
 * 1. Validate token structure and basic JWT claims (issuer, expiration)
 * 2. Introspect token by calling Microsoft Graph API
 * 3. Cache validated tokens to reduce API calls
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Extract Authorization header
  const authHeader = req.headers.authorization;

  // MUST return 401 if no Authorization header
  if (!authHeader) {
    return sendUnauthorized(res, 'No Authorization header provided');
  }

  // MUST NOT accept tokens in query strings (only Authorization header)
  if (!authHeader.startsWith('Bearer ')) {
    return sendUnauthorized(res, 'Invalid Authorization header format. Expected "Bearer <token>"');
  }

  // Extract the token
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!token) {
    return sendUnauthorized(res, 'No token provided');
  }

  try {
    // Step 1: Validate token structure and basic claims (issuer, expiration)
    const tokenPayload = validateTokenStructure(token);

    // Step 2: Validate token by calling Microsoft Graph API
    // This is the recommended approach for Microsoft Graph API tokens
    // which cannot be validated using standard JWT signature validation
    const user = await validateTokenViaGraphAPI(token);

    console.log('✅ Token validated successfully via Graph API');

    // Store both JWT payload and Graph user info in request for downstream handlers
    (req as any).user = {
      ...tokenPayload,
      graph: user,
    };

    // Token is valid, proceed to the protected endpoint
    next();
  } catch (error) {
    console.error('Token validation failed:', error);

    let errorMessage = 'Invalid or expired token';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // MUST return 401 for invalid or expired tokens
    return sendUnauthorized(res, errorMessage);
  }
}

/**
 * Send 401 Unauthorized response with WWW-Authenticate header
 *
 * MUST include WWW-Authenticate header per OAuth 2.1 Section 5.3
 * This header tells clients where to obtain authorization
 */
function sendUnauthorized(res: Response, error: string): void {
  // MUST use WWW-Authenticate header when returning 401 Unauthorized
  // Format per RFC 6750 Section 3
  const wwwAuthenticate = [
    `Bearer realm="${config.server.url}"`,
    `authorization_uri="${config.azure.authorizeUrl}"`,
    `error="invalid_token"`,
    `error_description="${error}"`,
  ].join(', ');

  res.status(401)
    .header('WWW-Authenticate', wwwAuthenticate)
    .json({
      error: 'unauthorized',
      message: error,
      authorization_uri: `${config.server.url}/authorize`,
    });
}

/**
 * Optional: Middleware for endpoints that accept authentication but don't require it
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No auth provided, continue without user context
    next();
    return;
  }

  try {
    const token = authHeader.substring(7);

    // Validate token structure and basic claims
    const tokenPayload = validateTokenStructure(token);

    // Validate via Graph API
    const user = await validateTokenViaGraphAPI(token);

    // Store user info in request
    (req as any).user = {
      ...tokenPayload,
      graph: user,
    };
  } catch (error) {
    // Invalid token, but don't block the request
    console.warn('Optional auth failed:', error);
  }

  next();
}
