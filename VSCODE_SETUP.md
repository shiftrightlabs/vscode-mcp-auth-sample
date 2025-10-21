# VS Code MCP Server Setup Guide

This guide shows you how to set up this OAuth-protected MCP server in VS Code and test it with GitHub Copilot.

## Prerequisites

Before you begin, ensure you have:

- ✅ Completed Steps 1-7 of QUICKSTART.md (Azure app created, server built and tested)
- ✅ VS Code installed
- ✅ GitHub Copilot extension installed in VS Code
- ✅ The server is working in standalone mode (`npm start` works)

## Step 1: Configure the MCP Server in VS Code

The `.vscode/mcp.json` file has been created with your Azure credentials. Verify it exists:

```bash
cat .vscode/mcp.json
```

You should see your Azure credentials configured:

```json
{
  "$schema": "https://json.schemastore.org/mcp.json",
  "mcpServers": {
    "mcp-auth-sample": {
      "command": "node",
      "args": ["dist/server.js"],
      "env": {
        "AZURE_CLIENT_ID": "bd0576f4-f9c2-4fd3-965c-3b15bf5a4fa8",
        "AZURE_CLIENT_SECRET": "ytx8Q~FpsrhouKL5-bPPGnS8IQ4M5MSlHX~Ewcfs",
        "AZURE_TENANT_ID": "0622d99f-8bae-4279-9f82-1fb659840d53",
        "PORT": "3000",
        "SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Step 2: Stop Any Running Standalone Server

If you have the server running from previous tests, stop it:

```bash
# Find the process
lsof -ti:3000

# Kill it (replace PID with the number from above)
kill <PID>
```

Or just press `Ctrl+C` in the terminal where `npm start` is running.

**Important**: VS Code will manage the server lifecycle, so you don't need `npm start` anymore when using VS Code MCP integration.

## Step 3: Reload VS Code Window

To make VS Code detect the MCP server configuration:

1. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: `Developer: Reload Window`
3. Press Enter

This makes VS Code scan the `.vscode/mcp.json` file and register the MCP server.

## Step 4: Check MCP Server Status

VS Code should now be aware of your MCP server. To verify:

1. Open the Command Palette: `Cmd+Shift+P` / `Ctrl+Shift+P`
2. Type: `MCP` and see if MCP-related commands appear
3. Or check the output panel: View → Output → Select "MCP" from the dropdown

**Note**: As of 2025, VS Code's MCP support is evolving. If you don't see MCP commands, you may need to:
- Install a VS Code extension that supports MCP
- Or use GitHub Copilot which has built-in MCP support

## Step 5: Open GitHub Copilot Chat

1. Click the GitHub Copilot icon in the sidebar (or press `Cmd+Shift+I` / `Ctrl+Shift+I`)
2. Or use Command Palette → `GitHub Copilot: Open Chat`

## Step 6: Test the MCP Server with a Prompt

Now, try to trigger the MCP server by asking Copilot to use one of the tools. Try these prompts:

### Test 1: Get User Info

In GitHub Copilot Chat, type:

```
@workspace Use the mcp-auth-sample server to get my user information
```

or

```
Call the get-user-info tool from the mcp-auth-sample MCP server
```

### Test 2: Echo Message

```
@workspace Use the mcp-auth-sample server to echo the message "Hello from VS Code!"
```

### Test 3: Calculate

```
@workspace Use the mcp-auth-sample server to calculate 42 * 137
```

## Step 7: What Should Happen

When you send the prompt, here's the expected flow:

1. **GitHub Copilot detects** the MCP tool is needed
2. **VS Code starts** the MCP server automatically (you should see it in the Output panel)
3. **Server detects** no authentication token
4. **Returns 401** with WWW-Authenticate header
5. **VS Code prompts you** to authenticate
6. **Browser opens** to Azure AD login page at `http://localhost:3000/authorize`
7. **You login** with your Azure account
8. **Redirected back** to the callback URL
9. **Token is obtained** and stored
10. **VS Code retries** the tool call with the Bearer token
11. **Server validates** the JWT token
12. **Tool executes** and returns result
13. **Copilot shows** the result in the chat

## Step 8: Verify JWT Token Validation

To verify that JWT token validation is working, check the VS Code Output panel:

1. View → Output
2. Select "MCP" or your server name from the dropdown
3. You should see logs like:

```
Authorization request received: { scope: 'openid profile email', state: '...' }
Redirecting to Azure AD: https://login.microsoftonline.com/...
Callback received: { code: 'present', state: '...' }
Access token received: { token_type: 'Bearer', expires_in: 3599, has_access_token: true }
Token stored with session ID: xyz123
Token validated successfully: { subject: '...', audience: '...', issuer: '...' }
```

The **"Token validated successfully"** message confirms that:
- ✅ JWT signature was verified using JWKS from Azure AD
- ✅ Issuer was validated (matches Azure AD)
- ✅ Audience was validated (matches client ID)
- ✅ Expiration was checked
- ✅ Token is authentic and valid

## Troubleshooting

### "MCP server not found" or "Tool not available"

**Possible causes**:
1. `.vscode/mcp.json` wasn't detected
   - Solution: Reload the window (Cmd+Shift+P → Reload Window)
   
2. VS Code doesn't support MCP yet
   - Solution: Check VS Code version and GitHub Copilot extension version
   - Alternative: Use standalone mode with curl/Postman

3. Server name mismatch
   - Solution: Make sure you reference `mcp-auth-sample` in your prompt

### "Port 3000 already in use"

**Cause**: Another instance of the server is running

**Solution**:
```bash
lsof -ti:3000 | xargs kill
```

### "Authentication failed" or "Invalid token"

**Possible causes**:
1. Azure app configuration issue
   - Solution: Verify redirect URIs in Azure include `http://localhost:3000/callback`

2. Token expired
   - Solution: The OAuth flow should run again automatically

3. Client secret expired or wrong
   - Solution: Generate a new client secret and update `.vscode/mcp.json`

### Server starts but doesn't authenticate

**Cause**: GitHub Copilot might not be triggering the OAuth flow correctly

**Solution**: 
1. Try using the standalone mode to verify OAuth works: `npm start`
2. Test manually: Open `http://localhost:3000/authorize?scope=openid%20profile%20email&state=test`
3. Check VS Code and GitHub Copilot extension versions

### No output in VS Code Output panel

**Cause**: Console logs might not be captured by VS Code

**Solution**:
1. Check terminal output if server was started manually
2. Add more verbose logging to `src/server.ts`
3. Use standalone mode to see all logs

## Alternative: Manual Testing

If GitHub Copilot integration isn't working, you can still test the MCP server manually:

### 1. Start the server manually:

```bash
npm start
```

### 2. Test the OAuth flow in your browser:

```
http://localhost:3000/authorize?scope=openid%20profile%20email&state=test123
```

### 3. After authentication, get the session ID from the success page

### 4. Test a protected tool with curl:

First, authenticate and capture the token (this is simplified - in reality, you'd extract the token from the OAuth flow):

```bash
# Test without authentication (should fail with 401)
curl -v http://localhost:3000/tools/test-auth

# You should see:
# < HTTP/1.1 401 Unauthorized
# < WWW-Authenticate: Bearer realm="http://localhost:3000" ...
```

This confirms that:
- ✅ Server requires authentication
- ✅ Returns proper 401 response
- ✅ Includes WWW-Authenticate header

## Monitoring Token Validation

To see detailed JWT validation logs, check the server output for these messages:

```
Token validated successfully: {
  subject: 'user-id-from-azure',
  audience: 'bd0576f4-f9c2-4fd3-965c-3b15bf5a4fa8',
  issuer: 'https://login.microsoftonline.com/0622d99f-8bae-4279-9f82-1fb659840d53/v2.0',
  expiresAt: '2025-10-21T...'
}
```

This proves:
1. **Signature verification**: Token was signed by Azure AD (verified using JWKS)
2. **Audience check**: Token was issued for this specific app
3. **Issuer check**: Token came from your Azure AD tenant
4. **Expiration check**: Token is still valid

## Success Criteria

You've successfully set up and tested the MCP server when:

- ✅ VS Code detects the MCP server from `.vscode/mcp.json`
- ✅ GitHub Copilot can see the available tools
- ✅ OAuth flow is triggered when you use a tool
- ✅ Browser redirects to Azure AD login
- ✅ After login, token is obtained
- ✅ Token validation succeeds (check logs)
- ✅ Tool executes and returns result
- ✅ Result appears in Copilot chat

## What You've Proven

By completing this setup, you've demonstrated:

1. **OAuth 2.1 Authorization Code Flow**: Complete flow from authorization to token exchange
2. **PKCE**: Proof Key for Code Exchange for enhanced security
3. **JWT Token Validation**: Signature, issuer, audience, and expiration verification
4. **RFC 9728 Compliance**: OAuth 2.0 Protected Resource Metadata
5. **RFC 8707 Compliance**: Resource Indicators (audience validation)
6. **MCP Integration**: Tools accessible via Model Context Protocol
7. **VS Code Integration**: Server lifecycle managed by VS Code

## Next Steps

1. **Add more tools**: Edit `src/mcp/tools.ts` to add your own tools
2. **Customize scopes**: Modify the required scopes in `src/config.ts`
3. **Add refresh tokens**: Implement token refresh for long-running sessions
4. **Deploy to production**: Use HTTPS and secure token storage
5. **Share with team**: Others can use your MCP server by adding it to their `.vscode/mcp.json`

## Reference: Available Tools

The MCP server provides these tools:

| Tool Name | Endpoint | Description |
|-----------|----------|-------------|
| `get-user-info` | POST /tools/get-user-info | Returns authenticated user information |
| `echo` | POST /tools/echo | Echoes a message with user context |
| `calculate` | POST /tools/calculate | Performs mathematical calculations |

All tools require OAuth authentication and return 401 if the token is invalid or expired.

## Debugging Tips

### Enable verbose logging:

Edit `src/middleware/auth.ts` and add more `console.log` statements:

```typescript
console.log('Authorization header:', authHeader);
console.log('Token:', token);
console.log('Decoded token:', decoded);
```

Then rebuild:

```bash
npm run build
```

And restart VS Code to see the new logs.

### Check the JWT token manually:

If you capture a token, you can decode it at https://jwt.io to see:
- Header (algorithm, key ID)
- Payload (claims: aud, iss, exp, sub, etc.)
- Signature verification

This helps understand what the validation code is checking.

## Summary

You now have a fully functional OAuth-protected MCP server integrated with VS Code! The JWT token validation ensures that only authenticated users with valid tokens from your Azure AD tenant can access the tools.

For standalone testing without VS Code, see `TESTING.md`.
For more details about the implementation, see `COMPLIANCE.md`.
