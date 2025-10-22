# VS Code MCP Authentication Sample

> **A complete reference implementation showing how to build a secure MCP (Model Context Protocol) server with OAuth 2.1 authentication for VS Code.**

[![CI](https://github.com/shiftrightlabs/vscode-mcp-auth-sample/actions/workflows/ci.yml/badge.svg)](https://github.com/shiftrightlabs/vscode-mcp-auth-sample/actions/workflows/ci.yml)
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

**Deployment Model:** This server is designed to run locally (like `http://localhost:3000`). For remote server deployments, see the "How We Implement OAuth" section below.

**Important Note:** VS Code uses its own hardcoded client ID (`aebc6443-996d-45c2-90f0-388ff96faa56`, defined in `extensions/microsoft-authentication/src/AADHelper.ts`) when obtaining tokens, not your MCP server's client ID. This means you'll receive Microsoft Graph API tokens instead of tokens scoped to your application. See "Challenge #2" below for the full technical explanation with source code evidence and solution.

## 📖 The Story: How Everything Works Together

### The Challenge

Building a production-ready MCP server with OAuth authentication that works with **VS Code** is complex. While the MCP specification defines OAuth support, there are very few real-world examples showing how to implement it for VS Code integration. VS Code's MCP client has specific behaviors (like using its own client ID) that aren't documented elsewhere. This project solves two major challenges that developers face when building OAuth-authenticated MCP servers for VS Code:

#### 1. **Lack of OAuth + MCP + VS Code Integration Examples**

**The Problem:** While the MCP specification includes OAuth support, there are almost no complete, working examples showing how to implement OAuth-authenticated MCP servers that integrate with **VS Code**. Most documentation focuses on the MCP protocol itself or generic OAuth flows, but doesn't address:
- How to handle VS Code's specific OAuth implementation
- How VS Code's MCP client behaves during authentication
- How to deal with VS Code using its own client ID (see Challenge #2)
- How to validate the Microsoft Graph API tokens that VS Code sends

**Our Solution:** This project provides a complete, production-ready reference implementation specifically for VS Code integration, showing:
- How to implement the OAuth 2.1 Authorization Code flow with PKCE for VS Code
- How to integrate OAuth metadata discovery (RFC 9728) that VS Code recognizes
- How to protect MCP endpoints with Bearer token authentication
- How to handle VS Code's client ID behavior and Graph API tokens
- How to manage the complete authentication lifecycle with VS Code's MCP client

#### 2. **Microsoft Graph API Token Validation (The Biggest Surprise)**

**The Problem:** This is the most surprising challenge. You might expect that when VS Code authenticates users through your MCP server's OAuth flow, it would use **your MCP server's client ID** to obtain tokens. But that's not what happens.

**The Surprise: VS Code Uses Its Own Client ID**

Instead, VS Code uses **its own hardcoded client ID** (`aebc6443-996d-45c2-90f0-388ff96faa56`) to obtain tokens, completely ignoring your MCP server's registered client ID.

**Evidence from VS Code Source Code:**

This behavior is hardcoded in VS Code's Microsoft authentication extension:

- **File:** `extensions/microsoft-authentication/src/AADHelper.ts` ([GitHub](https://github.com/microsoft/vscode))
- **Constant:** `DEFAULT_CLIENT_ID = 'aebc6443-996d-45c2-90f0-388ff96faa56'`
- **Behavior:** VS Code's `getClientId()` method uses this default unless you pass a special scope marker `VSCODE_CLIENT_ID:your-id`, which is non-standard OAuth and not what MCP servers do

**How It Works:**

When VS Code detects that your MCP server uses Microsoft Entra (Azure AD) for OAuth, it uses its built-in Microsoft authentication provider. This provider calls `vscode.authentication.getSession('microsoft', scopes)`, which always uses VS Code's hardcoded client ID for token requests.

**Related GitHub Issues:**
- [#115626](https://github.com/microsoft/vscode/issues/115626) - Microsoft Auth Provider should support overriding client ID
- [#248775](https://github.com/microsoft/vscode/issues/248775) - API to map auth server to auth provider (for MCP)
- [#252892](https://github.com/microsoft/vscode/issues/252892) - Feature: VSCode capability to register a clientId for MCP OAuth

**What This Means:**

1. ✅ The OAuth flow uses your MCP server's authorization endpoint
2. ✅ The user authenticates via your Azure AD tenant
3. ❌ **But the access token is issued for VS Code's application, not yours**
4. ❌ The token audience is **Microsoft Graph API** (`00000003-0000-0000-c000-000000000000`), not your MCP server

**Authentication Flow (What Actually Happens):**

```
1. MCP Server registers with: AZURE_CLIENT_ID=your-server-id
2. VS Code detects Microsoft Entra as the IdP
3. VS Code uses built-in Microsoft authentication provider
4. Provider calls: authentication.getSession('microsoft', scopes)
5. Internally uses: DEFAULT_CLIENT_ID = 'aebc6443-996d-45c2-90f0-388ff96faa56'
6. Azure AD issues token for VS Code's application
7. Token audience = '00000003-0000-0000-c000-000000000000' (Graph API)
8. MCP server receives this Graph API token, not a token for your app
```

When you decode the token, you'll see:
```json
{
  "aud": "00000003-0000-0000-c000-000000000000",  // Microsoft Graph API
  "appid": "aebc6443-996d-45c2-90f0-388ff96faa56",  // VS Code's client ID
  "iss": "https://sts.windows.net/{your-tenant}/",  // Your tenant
  "scp": "User.Read openid profile email"          // Graph API scopes
}
```

**Why This Matters:**



These Microsoft Graph API tokens (with audience `00000003-0000-0000-c000-000000000000`) **cannot be validated using standard JWT signature validation** by third-party services - even with the correct JWKS signing keys from Azure AD. This is intentional by Microsoft to prevent Graph API tokens from being misused by services other than Microsoft Graph.

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

**Summary:**

The key insight is that VS Code doesn't use your MCP server's client ID - it uses its own hardcoded client ID (`aebc6443-996d-45c2-90f0-388ff96faa56`) to obtain Microsoft Graph API tokens. This is by design in VS Code's authentication system and is documented in multiple GitHub issues ([#115626](https://github.com/microsoft/vscode/issues/115626), [#248775](https://github.com/microsoft/vscode/issues/248775), [#252892](https://github.com/microsoft/vscode/issues/252892)). As a result, your MCP server must validate these Graph API tokens by calling the Microsoft Graph API, not by using standard JWT signature validation. This project demonstrates the correct approach.

---

### How We Implement OAuth (PKCE for Local Deployment)

Since this MCP server runs **locally on the user's machine** (like `http://localhost:3000`), we use **OAuth 2.1 with PKCE (Proof Key for Code Exchange)** instead of client secrets.

**Why PKCE for Local Deployment:**

When your server code runs on the user's machine, any client secret in the code would be accessible to users. PKCE solves this by using cryptographic challenge/response pairs instead of secrets:

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

**PKCE Benefits:**
- ✅ No client secret needed (safe for local deployment)
- ✅ Cryptographic security via code challenge/verifier pair
- ✅ Standard OAuth 2.1 for public clients
- ✅ Same pattern used by mobile apps, SPAs, desktop apps

**Alternative for Remote Servers:**

If you're deploying an MCP server on a **remote, secure server** (not locally), you could use the traditional **Confidential Client flow** with a client secret instead. The secret would be safe because it stays on your secure server, not accessible to end users.

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

Once authenticated, you can test the MCP tools through GitHub Copilot or any AI assistant that supports MCP.

#### **Tool: `get-user-info`**

Returns authenticated user information from access token and Microsoft Graph API.

**Example prompts to trigger this tool:**
- "Show me my authenticated user information"
- "What are my user details from the access token?"
- "Get my profile information from Microsoft Graph API"

**Output:**
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
    "id": "...",
    "userPrincipalName": "you@example.com"
  }
}
```

#### **Tool: `echo`**

Echoes a message back with authentication confirmation.

**Example prompts to trigger this tool:**
- "Echo this message: Hello, MCP!"
- "Test the echo tool with 'Authentication is working'"
- "Can you echo back 'OAuth 2.1 PKCE is awesome'?"

**Output:**
```
Echo: Hello, MCP!

Authenticated via OAuth 2.0 PKCE
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

### How to Contribute

1. Fork the repository at https://github.com/shiftrightlabs/vscode-mcp-auth-sample
2. Clone your fork (`git clone https://github.com/YOUR-USERNAME/vscode-mcp-auth-sample.git`)
3. Create a feature branch (`git checkout -b feature/amazing-feature`)
4. Make your changes and commit (`git commit -m 'Add amazing feature'`)
5. Push to your fork (`git push origin feature/amazing-feature`)
6. Open a Pull Request at https://github.com/shiftrightlabs/vscode-mcp-auth-sample/pulls

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Anthropic** - For creating and maintaining the Model Context Protocol (MCP) specification and SDK
- **Microsoft** - For Azure AD OAuth 2.0 platform and Microsoft Graph API documentation

## ❓ Frequently Asked Questions

**Q: Why do I need to register an Azure AD application if VS Code uses its own client ID?**

A: Great question! Even though VS Code uses its own client ID to obtain the access token, you still need to register your own Azure AD application because:
- Your MCP server's authorization endpoint (`/authorize`) needs a client ID for the OAuth flow
- The tenant ID from your app registration determines which Azure AD tenant users authenticate against
- Your redirect URI configuration (`http://localhost:3000/callback`) must match your app registration

Think of it this way: Your app registration controls **which tenant** and **which redirect URIs** are allowed. VS Code then leverages that OAuth flow but substitutes its own client ID when requesting the token.

**Q: Can I make VS Code use my MCP server's client ID instead of its own?**

A: No, this is hardcoded in VS Code's Microsoft authentication extension (`extensions/microsoft-authentication/src/AADHelper.ts`). The constant `DEFAULT_CLIENT_ID = 'aebc6443-996d-45c2-90f0-388ff96faa56'` is used by default. While technically the code supports a `VSCODE_CLIENT_ID:` scope marker to override this, that's a non-standard OAuth pattern that MCP servers don't use. For more details, see [GitHub issue #115626](https://github.com/microsoft/vscode/issues/115626).

**Q: Why does VS Code do this?**

A: This allows VS Code to obtain tokens with Microsoft Graph API scopes (like `User.Read`) that it can use for its own features (like account management, settings sync, etc.), while still authenticating users through your MCP server's OAuth flow. It's a design decision that lets VS Code's built-in authentication providers work consistently across different extensions and MCP servers, but it means MCP servers must handle Graph API tokens rather than tokens scoped to their own application.

**Q: Does this mean my client ID configuration is ignored?**

A: Your `AZURE_CLIENT_ID` is still important! It's used for:
- The OAuth metadata endpoint (`/.well-known/oauth-protected-resource`)
- Configuring which Azure AD tenant to use (via tenant ID)
- Setting up the redirect URI in Azure AD

Even though the final access token uses VS Code's client ID, your configuration still controls the authentication flow.

**Q: Is this a security issue?**

A: No, this is by design. The tokens are still:
- Issued by your Azure AD tenant (controlled by your tenant ID)
- Validated via Microsoft Graph API (cryptographically secure)
- Scoped to the authenticated user
- Only usable for Microsoft Graph API calls (audience restriction)

The Graph API introspection pattern we use is Microsoft's recommended approach for validating these tokens.

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
