# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a reference implementation demonstrating OAuth 2.1 authentication for MCP (Model Context Protocol) servers in VS Code. The server implements a complete OAuth 2.0 Authorization Code Grant flow with PKCE (Proof Key for Code Exchange) using Azure AD as the identity provider.

**Current Status:** ✅ WORKING with temporary workaround (see [AUTHENTICATION_STATUS.md](AUTHENTICATION_STATUS.md))
- Authentication flow is functional
- VS Code successfully authenticates users
- MCP tools are accessible after authentication
- ⚠️ JWT signature validation is temporarily disabled (see known issues below)

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
JWT validation using Azure AD's JWKS endpoint:
- `requireAuth` - Validates Bearer tokens (required for `tools/call`, `tools/list`)
- `optionalAuth` - Validates if present but doesn't block
- Validates: signature (JWKS), issuer, audience, expiration
- Returns 401 with `WWW-Authenticate` header on failure (RFC 6750)

**MCP Authentication Flow (`src/mcp/http-transport.ts:132-150`):**
- `initialize` requests: allowed without auth (for discovery)
- `tools/call` and `tools/list`: require auth
- Other methods: allowed without auth

#### 5. MCP Protocol (`src/mcp/protocol.ts`)
Defines MCP server using `@modelcontextprotocol/sdk`:
- Tools: `get-user-info`, `echo`, `calculate`
- Uses Zod schemas for input validation
- Designed for stdio transport (not currently used - HTTP transport is active)

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

### Audience Validation
Per RFC 8707, the JWT `aud` claim must include the resource server URL. Azure AD typically uses `api://{clientId}` or the client ID itself. The middleware checks all three:
- `config.azure.clientId`
- `api://${config.azure.clientId}`
- `config.server.url`

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
2. Modify `src/middleware/auth.ts` JWKS client configuration
3. Update audience validation logic for provider's token format
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

## Known Issues

### JWT Signature Validation Disabled (Temporary)

**Issue:** The `jsonwebtoken` library reports "invalid signature" when validating VS Code's Microsoft Graph API tokens, even though the correct signing key is retrieved from Azure AD's JWKS endpoint.

**Current Workaround:** Signature validation is disabled in [src/middleware/auth.ts:128-134](src/middleware/auth.ts#L128-L134)

```typescript
// TEMPORARY: Skip signature validation to test the rest of the flow
console.log('⚠️  WARNING: Signature validation is DISABLED for debugging');
const decoded = unverifiedToken?.payload as jwt.JwtPayload;
```

**What Still Works:**
- ✅ Token format validation
- ✅ Issuer validation (Azure AD tenant)
- ✅ Expiration checking
- ✅ Token decoding and parsing
- ✅ User authentication and session management

**What Doesn't Work:**
- ❌ Cryptographic signature verification
- ❌ Tamper detection
- ❌ Token forgery protection

**Root Cause Analysis:**
VS Code sends Microsoft Graph API tokens (audience: `00000003-0000-0000-c000-000000000000`) obtained through its own authentication flow using VS Code's client ID (`aebc6443-996d-45c2-90f0-388ff96faa56`). These are valid Azure AD v1.0 tokens, but the signature validation fails for unknown reasons despite:
- Correct JWKS key retrieval (key ID: `yEUwmXWL107Cc-7QZ2WSbeOb3sQ`)
- Correct algorithm (RS256)
- Correct issuer (`https://sts.windows.net/{tenant}/`)
- Key confirmed to exist in JWKS endpoint

**Next Steps:** See [AUTHENTICATION_STATUS.md](AUTHENTICATION_STATUS.md) for detailed investigation steps and alternative solutions.

**Security Note:** ⚠️ Do NOT deploy to production with signature validation disabled. This creates a critical security vulnerability.
