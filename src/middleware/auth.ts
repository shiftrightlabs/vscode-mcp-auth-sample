import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
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
 */

// JWKS client for validating Azure AD tokens
const client = jwksClient({
  jwksUri: config.azure.jwksUri,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
});

/**
 * Get signing key from JWKS
 */
function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Validate JWT token issued by Azure AD
 */
async function validateToken(token: string): Promise<jwt.JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        // MUST verify the issuer matches our authorization server
        issuer: config.azure.issuer,

        // MUST verify the audience includes this resource server
        // Per RFC 8707, the audience should be the canonical URI of the MCP server
        audience: [`api://${config.azure.clientId}`, config.server.url],

        // Verify the token is not expired
        clockTolerance: 60, // 60 seconds tolerance for clock skew
      },
      (err, decoded) => {
        if (err) {
          reject(err);
          return;
        }

        if (!decoded || typeof decoded === 'string') {
          reject(new Error('Invalid token payload'));
          return;
        }

        resolve(decoded as jwt.JwtPayload);
      }
    );
  });
}

/**
 * Authentication middleware for protected MCP endpoints
 *
 * MUST requirements implemented:
 * - Parse Authorization header with Bearer token (OAuth 2.1 Section 5.1.1)
 * - Validate access tokens per OAuth 2.1 Section 5.2
 * - Verify audience claim per RFC 8707
 * - Return 401 with WWW-Authenticate header for failures
 * - Only accept tokens from configured authorization server
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
    // Validate the token
    const decoded = await validateToken(token);

    console.log('Token validated successfully:', {
      subject: decoded.sub,
      audience: decoded.aud,
      issuer: decoded.iss,
      expiresAt: new Date(decoded.exp! * 1000).toISOString(),
    });

    // MUST verify audience includes this resource server
    // This ensures the token was requested specifically for this MCP server
    // Azure AD v2.0 tokens typically have the client_id as the audience
    const audiences = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
    const validAudience = audiences.some(aud =>
      aud === config.azure.clientId || 
      aud === `api://${config.azure.clientId}` || 
      aud === config.server.url
    );

    if (!validAudience) {
      console.error('Token audience mismatch:', {
        expected: [config.azure.clientId, `api://${config.azure.clientId}`, config.server.url],
        received: decoded.aud,
      });
      return sendUnauthorized(res, 'Token audience does not match this resource server');
    }

    // MUST verify issuer matches our authorization server
    if (decoded.iss !== config.azure.issuer) {
      console.error('Token issuer mismatch:', {
        expected: config.azure.issuer,
        received: decoded.iss,
      });
      return sendUnauthorized(res, 'Token issuer does not match configured authorization server');
    }

    // Store user info in request for downstream handlers
    (req as any).user = decoded;

    // Token is valid, proceed to the protected endpoint
    next();
  } catch (error) {
    console.error('Token validation failed:', error);

    let errorMessage = 'Invalid or expired token';
    if (error instanceof jwt.TokenExpiredError) {
      errorMessage = 'Token has expired';
    } else if (error instanceof jwt.JsonWebTokenError) {
      errorMessage = `Token validation failed: ${error.message}`;
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
    const decoded = await validateToken(token);
    (req as any).user = decoded;
  } catch (error) {
    // Invalid token, but don't block the request
    console.warn('Optional auth failed:', error);
  }

  next();
}
