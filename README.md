# MCP OAuth Authentication Sample with Azure

A complete, production-ready implementation of OAuth 2.0 authentication for Visual Studio Code MCP (Model Context Protocol) servers using Azure AD (Microsoft Entra) as the identity provider.

## Overview

This project demonstrates how to implement OAuth 2.0 authentication for MCP servers, complying with all MUST requirements from:

- **MCP Authorization Specification** (2025-06-18)
- **OAuth 2.1** (RFC 9725)
- **OAuth 2.0 Protected Resource Metadata** (RFC 9728)
- **OAuth 2.0 Resource Indicators** (RFC 8707)
- **VS Code MCP Authorization Guide**

## Features

✅ **OAuth 2.1 Compliant** - Full OAuth 2.0/2.1 authorization flow
✅ **Azure AD Integration** - Uses Microsoft Entra as the identity provider
✅ **PKCE Support** - Proof Key for Code Exchange for enhanced security
✅ **JWT Validation** - Token validation with JWKS (JSON Web Key Sets)
✅ **Audience Verification** - RFC 8707 resource indicators implementation
✅ **WWW-Authenticate Headers** - Proper 401 response handling
✅ **MCP Tools** - Sample authenticated tools demonstrating the protocol
✅ **TypeScript** - Full type safety and modern JavaScript features

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   VS Code   │────────▶│  MCP Server  │────────▶│  Azure AD   │
│  (Client)   │  1. Auth│  (Resource   │ 2. Auth │ (Auth       │
│             │  Request│   Server)    │ Redirect│  Server)    │
└─────────────┘         └──────────────┘         └─────────────┘
      │                        │                        │
      │                        │                        │
      │    3. User Login & Consent                     │
      │◀───────────────────────────────────────────────┘
      │                        │
      │    4. Authorization Code
      │────────────────────────▶│
      │                        │
      │                        │    5. Token Exchange
      │                        │───────────────────────▶│
      │                        │                        │
      │                        │    6. Access Token     │
      │                        │◀───────────────────────┘
      │                        │
      │    7. Bearer Token in Header
      │────────────────────────▶│
      │                        │
      │    8. Protected Resource
      │◀────────────────────────│
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Azure CLI installed (`az --version`)
- An Azure account with permissions to create app registrations
- VS Code with MCP support

### 1. Clone and Install

```bash
git clone <repository-url>
cd vscode-mcp-auth-sample
npm install
```

### 2. Set Up Azure OAuth

Follow the detailed guide in `scripts/setup-azure-oauth.md` or use these quick commands:

```bash
# Login to Azure
az login

# Create Azure AD app
az ad app create \
  --display-name "MCP Auth Sample" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "http://127.0.0.1:33418" "https://vscode.dev/redirect" "http://localhost:3000/callback"

# Note the appId from output - this is your CLIENT_ID

# Create client secret (replace <APP_ID> with your appId)
az ad app credential reset --id <APP_ID> --append

# Note the password from output - this is your CLIENT_SECRET

# Get tenant ID
az account show --query tenantId -o tsv
```

### 3. Configure Environment

Create a `.env` file in the project root:

```env
AZURE_CLIENT_ID=your-app-id-here
AZURE_CLIENT_SECRET=your-client-secret-here
AZURE_TENANT_ID=your-tenant-id-here
PORT=3000
SERVER_URL=http://localhost:3000
```

### 4. Build and Run

```bash
# Build TypeScript
npm run build

# Start the server
npm start

# Or run in development mode
npm run dev
```

You should see:

```
🚀 MCP OAuth Sample Server is running!
Server URL: http://localhost:3000
Port: 3000

Endpoints:
  Home:        http://localhost:3000/
  Docs:        http://localhost:3000/docs
  Metadata:    http://localhost:3000/.well-known/oauth-protected-resource
  ...
```

### 5. Configure VS Code

Add this to your `.vscode/mcp.json` file (already included in the project):

```json
{
  "servers": {
    "mcp-auth-sample": {
      "type": "http",
      "url": "http://localhost:3000",
      "authentication": {
        "provider": "azure-ad",
        "scopes": ["openid", "profile", "email"]
      }
    }
  }
}
```

### 6. Test the Flow

1. Open VS Code with the configured `mcp.json`
2. Try using an MCP tool from the `mcp-auth-sample` server
3. VS Code will prompt you to authorize
4. You'll be redirected to Azure AD to login
5. After login, you'll be redirected back and the tool will execute

## Project Structure

```
vscode-mcp-auth-sample/
├── src/
│   ├── config.ts              # Configuration and environment variables
│   ├── server.ts              # Main Express server
│   ├── metadata.ts            # RFC 9728 OAuth metadata endpoint
│   ├── oauth.ts               # OAuth authorize and callback endpoints
│   ├── middleware/
│   │   └── auth.ts            # Token validation middleware
│   └── mcp/
│       └── tools.ts           # Sample MCP tools with authentication
├── scripts/
│   └── setup-azure-oauth.md   # Azure setup guide
├── docs/
│   └── example1.md            # Original MCP auth documentation
├── .vscode/
│   └── mcp.json               # VS Code MCP configuration
├── .env.example               # Environment variables template
├── package.json               # Project dependencies
├── tsconfig.json              # TypeScript configuration
└── README.md                  # This file
```

## API Endpoints

### OAuth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/oauth-protected-resource` | GET | OAuth 2.0 Protected Resource Metadata (RFC 9728) |
| `/authorize` | GET | Initiates OAuth flow, redirects to Azure AD |
| `/callback` | GET | OAuth callback, exchanges code for token |

### MCP Tool Endpoints

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/tools/list` | GET | No | Lists available MCP tools |
| `/tools/get-user-info` | POST | Yes | Returns authenticated user info |
| `/tools/echo` | POST | Yes | Echoes a message with user context |
| `/tools/calculate` | POST | Yes | Performs mathematical calculations |
| `/tools/test-auth` | GET | Yes | Tests authentication without tool execution |

### Documentation Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Server status and endpoint list |
| `/docs` | GET | Interactive API documentation |

## Testing with curl

```bash
# 1. Get OAuth metadata
curl http://localhost:3000/.well-known/oauth-protected-resource

# 2. List available tools (no auth required)
curl http://localhost:3000/tools/list

# 3. Try accessing protected endpoint without auth (returns 401)
curl -v -X POST http://localhost:3000/tools/get-user-info

# 4. Get a token via browser OAuth flow, then use it:
curl -X POST http://localhost:3000/tools/get-user-info \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 5. Test echo tool
curl -X POST http://localhost:3000/tools/echo \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from MCP!"}'

# 6. Test calculate tool
curl -X POST http://localhost:3000/tools/calculate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"operation": "add", "a": 5, "b": 3}'
```

## Security Implementation

### OAuth 2.1 Compliance

- ✅ Authorization Code Grant flow
- ✅ PKCE support (Proof Key for Code Exchange)
- ✅ State parameter for CSRF protection
- ✅ Secure token storage (in-memory, use database in production)
- ✅ Token expiration handling

### Token Validation

- ✅ JWT signature verification using JWKS
- ✅ Issuer validation (Azure AD)
- ✅ Audience validation (RFC 8707)
- ✅ Expiration time validation
- ✅ Clock skew tolerance

### Security Headers

- ✅ WWW-Authenticate header on 401 responses
- ✅ CORS support
- ✅ No tokens in URL query strings

## MCP Specification Compliance

All MUST requirements from the MCP Authorization Specification are implemented:

### Resource Server (MCP Server)

- ✅ Implements OAuth 2.0 Protected Resource Metadata (RFC 9728)
- ✅ Uses WWW-Authenticate header for 401 responses
- ✅ Validates access tokens per OAuth 2.1 Section 5.2
- ✅ Verifies audience claim (RFC 8707)
- ✅ Returns 401 for invalid/expired tokens
- ✅ Rejects tokens not from configured auth server
- ✅ Only accepts Bearer tokens in Authorization header
- ✅ Serves all endpoints over HTTPS (in production)

### Client Requirements (VS Code)

When VS Code connects to this server, it:
- Parses WWW-Authenticate headers
- Follows OAuth 2.0 Authorization Server Metadata
- Implements Resource Indicators (RFC 8707)
- Uses PKCE for authorization
- Sends Bearer tokens in Authorization header

## Production Deployment

For production deployment, consider:

1. **HTTPS**: Use HTTPS for all endpoints
2. **Database**: Store tokens in a secure database, not in-memory
3. **Token Refresh**: Implement refresh token flow
4. **Rate Limiting**: Add rate limiting to prevent abuse
5. **Logging**: Implement comprehensive security logging
6. **Monitoring**: Add health checks and monitoring
7. **Secrets Management**: Use Azure Key Vault or similar for secrets

Example production configuration:

```typescript
// Use environment-specific configs
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // Require HTTPS
  app.use((req, res, next) => {
    if (!req.secure) {
      return res.redirect('https://' + req.headers.host + req.url);
    }
    next();
  });
}
```

## Troubleshooting

### Common Issues

**"Missing required environment variables"**
- Ensure `.env` file exists and contains all required variables
- Check that variable names match exactly (case-sensitive)

**"Token validation failed"**
- Verify your Azure app registration has the correct redirect URIs
- Check that the Application ID URI is set to `api://<CLIENT_ID>`
- Ensure the token audience matches your server URL

**"Authorization failed"**
- Check Azure CLI login: `az account show`
- Verify tenant ID, client ID, and client secret are correct
- Check Azure app permissions and consent

**VS Code can't connect to MCP server**
- Ensure server is running: `npm start`
- Check `mcp.json` configuration
- Verify port 3000 is not in use by another application

## References

- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [VS Code MCP Guide](https://code.visualstudio.com/api/extension-guides/ai/mcp#authorization)
- [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728.html)
- [RFC 8707 - Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707.html)
- [Azure AD OAuth Documentation](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
