# VS Code MCP Authentication Sample

> **A complete reference implementation showing how to build a secure MCP (Model Context Protocol) server with OAuth 2.1 authentication for VS Code.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 What This Project Does

This project demonstrates how to build a production-ready **MCP server** that runs **locally on the user's machine**, integrates with **VS Code**, and uses **OAuth 2.1 authentication** (PKCE flow) with **Azure AD** as the identity provider.

**Key Features:**
- ✅ Designed for **local deployment** (runs on user's machine alongside VS Code)
- ✅ Full OAuth 2.1 Authorization Code flow with PKCE (no client secret needed)
- ✅ MCP server implementation using official `@modelcontextprotocol/sdk`
- ✅ HTTP transport - works with VS Code's MCP client
- ✅ Token validation via Microsoft Graph API introspection
- ✅ Production-ready security patterns
- ✅ TypeScript with full type safety

**Deployment Model:** This server is designed to run locally (like `http://localhost:3000`). For remote server deployments, see the note in the "Public Client Authentication" section below.

## 📖 The Story: How Everything Works Together

### The Challenge

Building a production-ready MCP server with OAuth authentication is complex. While the MCP specification defines OAuth support, there are very few real-world examples showing how to implement it correctly. This project solves three major challenges that developers face:

#### 1. **Lack of OAuth + MCP Integration Examples**

**The Problem:** The MCP specification includes OAuth support, but there are almost no complete, working examples showing how to implement it. Most documentation focuses on the protocol itself, not the OAuth integration.

**Our Solution:** This project provides a complete, production-ready reference implementation showing:
- How to implement the OAuth 2.1 Authorization Code flow with PKCE
- How to integrate OAuth metadata discovery (RFC 9728)
- How to protect MCP endpoints with Bearer token authentication
- How to handle the complete authentication lifecycle

#### 2. **Public Client Authentication (PKCE)**

**The Problem:** This MCP server is designed to run **locally on the user's machine** (like `http://localhost:3000`). Since the server code runs on the user's machine, any client secret stored in the code would be accessible to the user. This makes traditional OAuth flows (which require a client secret) unsuitable for local deployments.

**Our Solution:** We implement **PKCE (Proof Key for Code Exchange)**, which provides cryptographic security without requiring a client secret:

```
User → VS Code → MCP Server → Azure AD
                      ↓
                 PKCE Challenge
                      ↓
                 Azure AD Login
                      ↓
               Authorization Code
                      ↓
            Exchange for Access Token
```

**Why PKCE?**
- ✅ No client secret needed (safe for local deployment)
- ✅ Secure for applications running on user machines (MCP servers, SPAs, mobile apps, desktop apps)
- ✅ Cryptographic security via code challenge/verifier pair
- ✅ Required by OAuth 2.1 specification for public clients

**Important Note:** If you're deploying an MCP server on a **remote, secure server** (not locally), you could use the traditional **Confidential Client flow** with a client secret instead of PKCE. The client secret would be safe because:
- The server code isn't accessible to end users
- The secret stays on your secure server
- This is the same model used by traditional web applications

This project uses PKCE because it's designed for **local deployment** where the code runs on the user's machine alongside VS Code.

#### 3. **Microsoft Graph API Token Validation**

**The Problem:** This is the most surprising challenge. When VS Code authenticates users, it obtains **Microsoft Graph API tokens** (audience: `00000003-0000-0000-c000-000000000000`). These tokens **cannot be validated using standard JWT signature validation** by third-party services - even with the correct JWKS signing keys from Azure AD. This is intentional by Microsoft to prevent Graph API tokens from being used with third-party services.

Most developers try the standard approach and get stuck:
```typescript
// ❌ This approach fails with "invalid signature"
jwt.verify(token, getSigningKey, {
  issuer: 'https://sts.windows.net/{tenant}/',
  audience: '00000003-0000-0000-c000-000000000000'
});
// Error: invalid signature (even though the key is correct!)
```

**Our Solution: Token Introspection via Graph API**

Since we can't validate the signature locally, we validate tokens by **calling the Microsoft Graph API** itself. If the API accepts the token and returns user data, we know it's valid:

```typescript
// ✅ This works - Microsoft validates the token on their end
const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
  headers: { 'Authorization': `Bearer ${token}` },
});

// Success (200) = token is valid, returns user profile
// Failure (401) = token is invalid or expired
```

**Why This Approach is Correct:**
- ✅ Microsoft performs cryptographic validation on their servers
- ✅ We get user profile information as a bonus
- ✅ Catches expired or revoked tokens immediately
- ✅ This is the **official Microsoft-recommended approach** for Graph API tokens
- ✅ We cache validated tokens (5 min TTL) for performance

## 🏗️ Architecture

```
┌─────────────┐
│   VS Code   │
│   (Client)  │
└──────┬──────┘
       │
       │ 1. User triggers authentication
       ↓
┌─────────────────────────────────────────┐
│        MCP Server (This Project)        │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  OAuth 2.1 PKCE Flow              │ │
│  │  - /authorize (redirect to Azure) │ │
│  │  - /callback (exchange code)      │ │
│  │  - PKCE challenge generation      │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  MCP HTTP Transport               │ │
│  │  - POST /mcp (JSON-RPC)           │ │
│  │  - GET /mcp (SSE)                 │ │
│  │  - Session management             │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Authentication Middleware        │ │
│  │  - Token structure validation     │ │
│  │  - Graph API introspection        │ │
│  │  - Token caching (5 min TTL)      │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  MCP Tools                        │ │
│  │  - get-user-info                  │ │
│  │  - echo                           │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
       │                  │
       │                  │ 3. Validate token
       │                  ↓
       │         ┌─────────────────┐
       │         │ Microsoft Graph │
       │         │       API       │
       │         └─────────────────┘
       │
       │ 2. OAuth flow
       ↓
┌─────────────┐
│  Azure AD   │
│  (IdP)      │
└─────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Azure AD tenant** (free tier works)
- **VS Code** with MCP support

### 1. Clone and Install

```bash
git clone https://github.com/shiftrightlabs/vscode-mcp-auth-sample.git
cd vscode-mcp-auth-sample
npm install
```

### 2. Azure AD Setup

1. Go to [Azure Portal](https://portal.azure.com) → **Azure Active Directory** → **App registrations**
2. Click **New registration**:
   - **Name:** `MCP Server Auth Sample`
   - **Supported account types:** Accounts in this organizational directory only
   - **Redirect URI:**
     - Platform: **Web**
     - URI: `http://localhost:3000/callback`
   - Click **Register**

3. After registration:
   - Copy **Application (client) ID**
   - Copy **Directory (tenant) ID**

4. Configure **Authentication**:
   - Go to **Authentication** in the left menu
   - Under **Redirect URIs**, add:
     - `http://localhost:3000/callback`
     - `http://127.0.0.1:3000/callback`
   - Under **Implicit grant and hybrid flows**, check:
     - ✅ **ID tokens**
   - Click **Save**

5. Configure **API permissions**:
   - Go to **API permissions** in the left menu
   - Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**
   - Add these permissions:
     - `User.Read`
     - `openid`
     - `profile`
     - `email`
   - Click **Add permissions**
   - Click **Grant admin consent** (if you have admin rights)

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and fill in your Azure AD credentials:

```env
# Azure AD Configuration
AZURE_CLIENT_ID=your-application-client-id-here
AZURE_TENANT_ID=your-directory-tenant-id-here

# Server Configuration
PORT=3000
SERVER_URL=http://localhost:3000
```

**Important:**
- `AZURE_CLIENT_SECRET` is **NOT required** - this is a public client using PKCE
- Never commit `.env` to version control (already in `.gitignore`)

### 4. Build and Run

```bash
# Build TypeScript
npm run build

# Start the server
npm start
```

You should see:
```
MCP Server with OAuth running on http://localhost:3000
OAuth endpoints:
  - Authorization: http://localhost:3000/authorize
  - Callback: http://localhost:3000/callback
  - OAuth Metadata: http://localhost:3000/.well-known/oauth-protected-resource
MCP endpoints:
  - POST /mcp (JSON-RPC)
  - GET /mcp (SSE)
```

### 5. VS Code Configuration

Add to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "mcp-auth-sample": {
      "url": "http://localhost:3000/mcp",
      "authorization": {
        "type": "oauth2",
        "authorizationUrl": "http://localhost:3000/authorize"
      }
    }
  }
}
```

### 6. Test the Authentication

1. Open VS Code
2. Open the **MCP panel** (View → MCP or Ctrl+Shift+M)
3. You should see "mcp-auth-sample" server
4. Click **Authenticate**
5. A browser window opens → Sign in with your Microsoft account
6. After successful authentication, you should see:
   ```
   ✅ Discovered 2 tools
   ```

### 7. Test the Tools

Try calling the tools:

**`get-user-info`** - Returns your authenticated user information:
```json
{
  "title": "✅ Authenticated User Information",
  "authentication": {
    "method": "OAuth 2.0 Authorization Code with PKCE",
    "client_type": "Public Client (no client secret)",
    "token_validated": "via Microsoft Graph API introspection"
  },
  "token_claims": {
    "issuer": "https://sts.windows.net/{tenant}/",
    "subject": "...",
    "audience": "00000003-0000-0000-c000-000000000000",
    "scopes": ["User.Read", "openid", "profile", "email"]
  },
  "graph_api_user": {
    "displayName": "Your Name",
    "mail": "your.email@example.com",
    ...
  }
}
```

**`echo`** - Simple echo tool:
```
Input: Hello, MCP!
Output: Echo: Hello, MCP!
✅ Authenticated via OAuth 2.0 PKCE (Public Client)
```

## 📁 Project Structure

```
vscode-mcp-auth-sample/
├── src/
│   ├── server.ts              # Express app entry point
│   ├── config.ts              # Configuration and validation
│   ├── oauth.ts               # OAuth 2.1 PKCE flow
│   ├── metadata.ts            # RFC 9728 metadata endpoint
│   ├── middleware/
│   │   └── auth.ts            # Token validation middleware
│   └── mcp/
│       └── http-transport.ts  # MCP HTTP transport & tools
├── dist/                      # Compiled JavaScript (generated)
├── .env.example               # Environment template
├── .env                       # Your credentials (git-ignored)
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── CLAUDE.md                  # Project documentation for Claude Code
└── README.md                  # This file
```

## 🔐 Security Model

### OAuth 2.1 Public Client with PKCE

This implementation uses **PKCE (Proof Key for Code Exchange)** instead of client secrets:

```typescript
// 1. Generate code verifier (random string)
const codeVerifier = crypto.randomBytes(32).toString('base64url');

// 2. Generate code challenge (SHA256 hash)
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// 3. Send challenge to Azure AD
const authUrl = `${authorizeUrl}?
  client_id=${clientId}&
  code_challenge=${codeChallenge}&
  code_challenge_method=S256&
  ...`;

// 4. Azure AD validates: SHA256(code_verifier) === code_challenge
```

**Benefits:**
- ✅ No client secret needed (safe for local deployment)
- ✅ Cryptographic security via challenge/verifier pair
- ✅ Suitable for applications running on user machines (MCP servers, SPAs, mobile apps, desktop apps)
- ✅ Required by OAuth 2.1 specification for public clients

**Deployment Context:** This server is designed to run **locally** (e.g., `http://localhost:3000` on the user's machine). For remote server deployments where code isn't accessible to users, you could use a Confidential Client flow with a client secret instead.

### Token Validation Strategy

**Challenge:** Microsoft Graph API tokens cannot be validated using standard JWT signature validation.

**Solution:** Token introspection via Graph API:

```typescript
// 1. Validate token structure (issuer, expiration)
const payload = jwt.decode(token);
validateIssuer(payload.iss);
validateExpiration(payload.exp);

// 2. Introspect via Microsoft Graph API
const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// 3. Cache validated tokens (5-minute TTL)
tokenCache.set(token, { user: response.data, validUntil: now + 5min });
```

**Security Benefits:**
- ✅ Real cryptographic validation (Microsoft validates server-side)
- ✅ User profile information obtained
- ✅ Token freshness check (catches expired/revoked tokens)
- ✅ Production-ready (no signature validation bypass)

## 🛠️ Development

### Available Scripts

```bash
# Development mode (auto-reload with ts-node)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run compiled JavaScript
npm start

# Watch mode (auto-compile on changes)
npm run watch
```

### Tech Stack

- **Runtime:** Node.js 18+
- **Language:** TypeScript 5.3+
- **Web Framework:** Express 4.x
- **MCP SDK:** `@modelcontextprotocol/sdk` 1.20+
- **HTTP Client:** Axios
- **Validation:** Zod
- **Token Handling:** jsonwebtoken

### Key Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.20.1",  // Official MCP SDK
  "express": "^4.18.2",                    // Web server
  "axios": "^1.6.5",                       // HTTP client (Graph API)
  "jsonwebtoken": "^9.0.2",                // JWT decoding
  "zod": "^3.25.76"                        // Schema validation
}
```

## 📚 Learn More

### Understanding the Code

The best way to understand how everything works is to follow the request flow:

1. **OAuth Flow** ([`src/oauth.ts`](src/oauth.ts))
   - `/authorize` - Generates PKCE challenge, redirects to Azure AD
   - `/callback` - Validates PKCE verifier, exchanges code for token

2. **MCP Transport** ([`src/mcp/http-transport.ts`](src/mcp/http-transport.ts))
   - Creates per-session transport instances
   - Handles three endpoints: POST, GET (SSE), DELETE
   - Manages session IDs and cleanup

3. **Authentication** ([`src/middleware/auth.ts`](src/middleware/auth.ts))
   - Validates token structure and basic claims
   - Calls Microsoft Graph API for introspection
   - Caches validated tokens for performance

4. **MCP Tools** ([`src/mcp/http-transport.ts`](src/mcp/http-transport.ts))
   - `get-user-info` - Demonstrates token reading + Graph API access
   - `echo` - Simple authenticated tool

### Standards & Specifications

This implementation follows:

- **[MCP Authorization Specification](https://spec.modelcontextprotocol.io/specification/architecture/#authorization)** (2025-06-18)
- **[OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07)** - Authorization framework with PKCE
- **[RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)** - PKCE for OAuth 2.0
- **[RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)** - OAuth 2.0 Protected Resource Metadata
- **[RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750)** - Bearer token usage

### Why This Approach?

**Why HTTP transport instead of stdio?**
- VS Code's MCP client uses HTTP, not stdio
- HTTP allows multiple concurrent clients
- Better for production deployments

**Why PKCE instead of client secret?**
- This MCP server runs **locally on the user's machine** (code is accessible to users)
- Client secrets can't be safely stored in code running on user machines
- PKCE provides cryptographic security without secrets
- Required by OAuth 2.1 for public clients
- Note: Remote servers could use client secrets (Confidential Client flow)

**Why Graph API introspection instead of JWT validation?**
- Microsoft Graph API tokens are opaque to third parties by design
- Standard JWT signature validation fails (even with correct keys)
- Graph API introspection is the official Microsoft-recommended approach

## 🤝 Contributing

Contributions are welcome! This is an educational project to help developers understand MCP + OAuth integration.

### Areas for Improvement

- [ ] Add refresh token support
- [ ] Implement persistent token storage (database)
- [ ] Add rate limiting
- [ ] Support multiple identity providers (Google, GitHub, etc.)
- [ ] Add comprehensive test suite
- [ ] Docker containerization
- [ ] Kubernetes deployment example

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Anthropic** - For the MCP specification and SDK
- **Microsoft** - For Azure AD and Graph API documentation
- **VS Code Team** - For MCP client implementation

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/shiftrightlabs/vscode-mcp-auth-sample/issues)
- **Discussions:** [GitHub Discussions](https://github.com/shiftrightlabs/vscode-mcp-auth-sample/discussions)

## 🔗 Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07)
- [Azure AD Documentation](https://learn.microsoft.com/en-us/azure/active-directory/)
- [Microsoft Graph API](https://learn.microsoft.com/en-us/graph/)

---

**Built with ❤️ by the ShiftRight Labs team to help developers build secure MCP servers.**
