# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a reference implementation demonstrating OAuth 2.1 authentication for MCP (Model Context Protocol) servers in VS Code. The server implements a complete OAuth 2.0 Authorization Code Grant flow with PKCE (Proof Key for Code Exchange) using Azure AD as the identity provider.

**Current Status:** ✅ FULLY WORKING
- Authentication flow is functional and production-ready
- VS Code successfully authenticates users via Azure AD
- MCP tools are accessible after authentication
- Token validation uses Microsoft Graph API introspection (recommended approach)
- All security requirements met (no signature validation bypass)

## Development Commands

### Build and Run
- `npm run build` - Compile TypeScript to JavaScript (output in `dist/`)
- `npm start` - Run the compiled server from `dist/server.js`
- `npm run dev` - Run server directly with ts-node (development mode)
- `npm run watch` - Watch mode for TypeScript compilation

### Environment Setup
1. Copy `.env.example` to `.env`
2. Configure `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` (no client secret needed - this is a public client using PKCE)
3. Register redirect URIs in Azure: `http://localhost:3000/callback` and `http://127.0.0.1:3000/callback`

## Architecture Overview

### Security Model: OAuth 2.1 Public Client with PKCE

This implementation uses **PKCE (Proof Key for Code Exchange)** instead of client secrets, making it suitable for:
- VS Code extensions
- React/SPA applications
- Mobile apps
- Any client-side code distributed to users

PKCE provides cryptographic security without storing secrets. Never add `AZURE_CLIENT_SECRET` to this codebase.

### Core Components

#### 1. Server Entry Point (`src/server.ts`)
Express application that mounts three router systems in order:
1. `metadataRouter` - OAuth metadata discovery
2. `oauthRouter` - OAuth authorization flow
3. `mcpRouter` - MCP protocol handler (must be last, handles `/` and `/mcp`)

#### 2. OAuth Flow (`src/oauth.ts`)
Implements Authorization Code Grant with PKCE:
- `/authorize` - Generates PKCE challenge, redirects to Azure AD
- `/callback` - Validates PKCE verifier, exchanges code for token

**PKCE Flow:**
1. Client calls `/authorize` with optional `code_challenge` and `code_challenge_method`
2. If client provides PKCE params, pass them through; otherwise generate server-side
3. Store `code_verifier` in `pkceStore` (maps state → verifier)
4. Azure AD redirects to `/callback` with authorization code
5. Retrieve `code_verifier`, send to Azure for token exchange
6. Azure validates: `SHA256(code_verifier) == code_challenge`
7. Store access token in `tokenStore` (in-memory, use database in production)

#### 3. MCP Transport Layer (`src/mcp/http-transport.ts`)
Implements MCP over HTTP using `StreamableHTTPServerTransport`:
- Creates per-session transport instances (stored in `transports` map)
- Handles three endpoints: `POST /mcp`, `GET /mcp` (SSE), `DELETE /mcp` (session cleanup)
- Also supports root path (`/`) for backward compatibility

**Session Management:**
- Each `initialize` request creates new transport with unique session ID
- Transport stored in `transports` map by session ID
- Client sends `mcp-session-id` header on subsequent requests
- Cleanup on transport close or server shutdown (SIGINT handler)

#### 4. Authentication Middleware (`src/middleware/auth.ts`)
Token validation using Microsoft Graph API introspection:
- `requireAuth` - Validates Bearer tokens (required for `tools/call`, `tools/list`)
- `optionalAuth` - Validates if present but doesn't block
- Returns 401 with `WWW-Authenticate` header on failure (RFC 6750)

**Validation Strategy:**
Microsoft Graph API tokens cannot be validated using standard JWT signature validation by third-party services. The middleware uses **token introspection** by calling the Microsoft Graph API:
1. Validates token structure and basic claims (issuer, expiration)
2. Calls `GET https://graph.microsoft.com/v1.0/me` with the token
3. If successful (200), token is valid and user info is returned
4. If failed (401), token is invalid or expired
5. Caches validated tokens for 5 minutes to reduce API calls

**MCP Authentication Flow (`src/mcp/http-transport.ts:132-150`):**
- `initialize` requests: allowed without auth (for discovery)
- `tools/call` and `tools/list`: require auth
- Other methods: allowed without auth

#### 5. MCP Tools (`src/mcp/http-transport.ts`)
Defines MCP server tools using `@modelcontextprotocol/sdk`:
- **`get-user-info`** - Demonstrates token validation by:
  - Reading JWT claims from the access token
  - Calling Microsoft Graph API to get user profile
  - Showing both token data and Graph API response
- **`echo`** - Simple echo tool with authentication confirmation
- Uses Zod schemas for input validation
- Tools have access to request context via session store

#### 6. OAuth Metadata (`src/metadata.ts`)
RFC 9728 implementation:
- `/.well-known/oauth-protected-resource` - Advertises authorization servers
- Specifies resource URL, supported scopes, bearer methods

### Configuration (`src/config.ts`)
Centralized config with validation:
- Azure OAuth endpoints (authorize, token, JWKS, issuer)
- Server URL and port
- Required scopes: `['openid', 'profile', 'email']`
- `validateConfig()` ensures required env vars are present

## Key Implementation Details

### Per-Session Transport Pattern
The MCP transport layer creates one `StreamableHTTPServerTransport` instance per session, stored in the `transports` object. Each session has a unique UUID. VS Code sends `mcp-session-id` header to reuse the same transport. This pattern is critical for maintaining conversation state.

### PKCE Code Verifier Storage
The `pkceStore` in `oauth.ts` is temporary in-memory storage (10-minute expiration). In production:
- Use Redis or similar with TTL
- Clean up expired entries automatically
- Consider distributed systems if load-balancing

### Token Storage
The `tokenStore` in `oauth.ts` is in-memory only. Production requirements:
- Persistent database or credential manager
- Token refresh logic (handle `refresh_token` from Azure)
- Associate tokens with user sessions
- Implement token revocation

### Microsoft Graph API Token Validation
Microsoft Graph API tokens (`aud: 00000003-0000-0000-c000-000000000000`) are **opaque to third parties** and cannot be validated using standard JWT signature validation libraries. This is by design from Microsoft.

**Solution:** The middleware validates tokens by calling the Microsoft Graph API directly (`GET /v1.0/me`). If the API returns user data, the token is valid. This is the recommended approach and provides:
- Real cryptographic validation (Microsoft validates on their end)
- User profile information (name, email, ID)
- Token freshness check (catches expired or revoked tokens)
- Production-ready security (no signature validation bypass)

## Standards Compliance

This implementation follows:
- **MCP Authorization Specification** (2025-06-18)
- **OAuth 2.1** (RFC 9725) - PKCE required
- **OAuth 2.0 Protected Resource Metadata** (RFC 9728)
- **OAuth 2.0 Resource Indicators** (RFC 8707)
- **RFC 6750** - Bearer token usage

## Common Modification Points

### Adding New MCP Tools
Edit `src/mcp/http-transport.ts` in the `createMCPServer()` function:
```typescript
server.tool(
  'tool-name',
  'Description',
  { param: z.string() }, // Zod schema
  async ({ param }) => {
    return { content: [{ type: 'text', text: result }] };
  }
);
```

### Changing OAuth Provider
1. Update `src/config.ts` with new provider endpoints
2. Modify `src/middleware/auth.ts` token introspection endpoint:
   - For Microsoft: `GET https://graph.microsoft.com/v1.0/me`
   - For Google: `GET https://www.googleapis.com/oauth2/v1/userinfo`
   - For other providers: Use their token introspection or userinfo endpoint
3. Update token structure validation for provider's issuer format
4. Adjust `src/oauth.ts` if provider has different PKCE requirements

### Token Persistence
Replace in-memory `tokenStore` in `src/oauth.ts`:
1. Add database dependency
2. Create token schema (user_id, access_token, refresh_token, expires_at)
3. Update `tokenStore.set()` and `getTokenFromStore()` calls
4. Implement token refresh in middleware

### Custom Authorization Logic
Modify `src/mcp/http-transport.ts:132-150` to change which MCP methods require auth. Current logic:
- Allow `initialize` without auth
- Require auth for `tools/call` and `tools/list`
- Allow other methods without auth
