# VS Code MCP HTTP Server with OAuth - Setup Guide

## Current Status

Your MCP server has **OAuth PKCE implemented** but is **missing the MCP protocol layer** that VS Code needs to communicate with it.

## The Problem

VS Code is trying to:
1. POST a JSON-RPC `initialize` message to `http://localhost:3000/`
2. Your server returns 404 because it doesn't have MCP protocol handlers
3. Result: "Waiting for server to respond to `initialize` request..."

## What VS Code Expects

According to the latest VS Code MCP documentation (https://code.visualstudio.com/api/extension-guides/ai/mcp):

### Transport Requirements
- ✅ **Streamable HTTP** transport (not stdio!)
- ✅ **OAuth 2.1 with PKCE** for authentication
- ✅ **Microsoft Entra (Azure AD)** as identity provider

### Required Redirect URIs
VS Code MCP uses specific redirect URIs:
- `http://127.0.0.1:33418` (primary)
- `https://vscode.dev/redirect` (web-based VS Code)

**Your current redirect URI `http://localhost:3000/callback` won't work with VS Code!**

### Server Requirements
1. Single endpoint handling JSON-RPC 2.0 messages
2. SSE (Server-Sent Events) support for bidirectional communication
3. OAuth metadata endpoint: `/.well-known/oauth-protected-resource`
4. Authorization endpoints: `/authorize`, `/callback` (you have these!)

## What Needs to Change

### 1. Azure AD Configuration

Update your Azure AD app redirect URIs:

```bash
az ad app update --id $APP_ID \
  --public-client-redirect-uris \
    "http://127.0.0.1:33418" \
    "https://vscode.dev/redirect" \
    "http://localhost:3000/callback"
```

### 2. Server Implementation

You need to add:

**a) MCP Protocol Handler**
- Handle JSON-RPC 2.0 messages (initialize, tools/list, tools/call)
- Implement SSE for server-to-client communication
- Use `@modelcontextprotocol/sdk` package (already installed)

**b) OAuth Integration**
- Detect VS Code requests and use `http://127.0.0.1:33418` redirect
- Keep your existing `/callback` for testing with browser

### 3. File: `src/server.ts`

Add MCP router before other routers:

```typescript
import { mcpRouter } from './mcp/http-transport';

//... existing code ...

// Mount MCP protocol handler FIRST (handles / and /mcp)
app.use(mcpRouter);

// Then mount other routers
app.use(metadataRouter);
app.use(oauthRouter);
app.use(toolsRouter);
```

### 4. File: `.vscode/mcp.json`

Should be:

```json
{
  "servers": {
    "mcp-auth-sample": {
      "url": "http://localhost:3000"
    }
  },
  "inputs": []
}
```

**Note:** stdio transport does NOT support OAuth per MCP spec!

## Current Implementation Status

✅ PKCE OAuth implementation (completed)
✅ Public client configuration (completed)
✅ MCP SDK installed
❌ MCP protocol handlers (in progress)
❌ SSE transport (in progress)
❌ VS Code redirect URI configuration (todo)

## Next Steps

### Option 1: Complete HTTP MCP Implementation

I can complete the implementation by:
1. Fix the `http-transport.ts` build error
2. Integrate MCP router into main server
3. Update OAuth to support VS Code redirects
4. Test end-to-end with VS Code

### Option 2: Use This as OAuth Documentation Only

If this repo is meant to be **documentation/example** rather than a working VS Code integration:
1. Update README to clarify this is a "reference implementation"
2. Document that full VS Code integration requires additional MCP protocol layer
3. Provide links to VS Code MCP templates

## Testing HTTP MCP Server

Once implemented, test with:

```bash
# 1. Start server
npm start

# 2. Check MCP endpoint responds to JSON-RPC
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'

# 3. Check SSE endpoint
curl -N http://localhost:3000/mcp
```

## References

- [VS Code MCP Guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [MCP Authorization Spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [MCP HTTP Transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

## Which Option Do You Want?

1. **Complete the HTTP MCP implementation** (working VS Code integration)?
2. **Document this as OAuth reference only** (stop at OAuth layer)?
3. **Something else**?

Let me know and I'll proceed accordingly!
