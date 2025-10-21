# Testing Guide

This guide walks you through testing the MCP OAuth implementation end-to-end.

## Prerequisites

Before testing, ensure you have:

1. ✅ Completed Azure OAuth setup (see `scripts/setup-azure-oauth.md`)
2. ✅ Created `.env` file with your Azure credentials
3. ✅ Built the project (`npm run build`)

## Test Scenario 1: OAuth Metadata Discovery

Test that the OAuth 2.0 Protected Resource Metadata endpoint is working correctly.

```bash
# Start the server in one terminal
npm start

# In another terminal, test the metadata endpoint
curl http://localhost:3000/.well-known/oauth-protected-resource | jq
```

**Expected Response:**
```json
{
  "resource": "http://localhost:3000",
  "authorization_servers": [
    "https://login.microsoftonline.com/<TENANT_ID>/v2.0"
  ],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "http://localhost:3000/docs",
  "scopes_supported": ["openid", "profile", "email"]
}
```

✅ **Pass Criteria:** Response contains resource URL and authorization servers

## Test Scenario 2: Tool Discovery (No Auth)

Test that unauthenticated clients can discover available tools.

```bash
curl http://localhost:3000/tools/list | jq
```

**Expected Response:**
```json
{
  "tools": [
    {
      "name": "get-user-info",
      "description": "Retrieves information about the authenticated user",
      "requiresAuth": true,
      ...
    },
    ...
  ]
}
```

✅ **Pass Criteria:** List of available tools is returned without authentication

## Test Scenario 3: Protected Endpoint Without Auth (401)

Test that protected endpoints correctly reject unauthenticated requests.

```bash
curl -v -X POST http://localhost:3000/tools/get-user-info 2>&1 | grep -E "(< HTTP|< WWW-Authenticate)"
```

**Expected Response:**
- HTTP Status: `401 Unauthorized`
- Header: `WWW-Authenticate: Bearer realm="http://localhost:3000", ...`

```bash
# Full response
curl -X POST http://localhost:3000/tools/get-user-info | jq
```

**Expected JSON:**
```json
{
  "error": "unauthorized",
  "message": "No Authorization header provided",
  "authorization_uri": "http://localhost:3000/authorize"
}
```

✅ **Pass Criteria:**
- Returns HTTP 401
- Includes WWW-Authenticate header
- Provides authorization_uri

## Test Scenario 4: OAuth Authorization Flow

Test the complete OAuth flow in a browser.

### Step 1: Initiate Authorization

Open in your browser:
```
http://localhost:3000/authorize?scope=openid%20profile%20email&state=test123
```

**Expected Behavior:**
- Redirects to Azure AD login page
- URL contains your tenant ID and client ID
- Includes PKCE challenge (if client provides it)

### Step 2: Login and Consent

1. Login with your Azure AD credentials
2. Grant the requested permissions
3. You'll be redirected to the callback URL

**Expected Behavior:**
- Redirects to `http://localhost:3000/callback?code=...&state=test123`
- Shows success page with session ID
- Access token is stored on the server

✅ **Pass Criteria:**
- Successfully redirects to Azure AD
- After login, redirects back to callback
- Callback page shows "Authentication Successful!"

## Test Scenario 5: Protected Endpoint With Valid Token

After completing the OAuth flow above, you'll need to extract the access token to test this scenario.

### Option A: Using Browser OAuth Flow

Since the token is stored server-side by session ID, we need to modify the approach for testing. For now, you can:

1. Complete the OAuth flow in browser
2. Note the session ID from the success page
3. The server logs will show the token details

### Option B: Get Token Manually via Azure CLI

```bash
# Get an access token for your app
az account get-access-token \
  --resource api://<YOUR_CLIENT_ID> \
  --query accessToken -o tsv
```

Then test:

```bash
# Replace <TOKEN> with your access token
curl -X POST http://localhost:3000/tools/get-user-info \
  -H "Authorization: Bearer <TOKEN>" \
  | jq
```

**Expected Response:**
```json
{
  "tool": "get-user-info",
  "result": {
    "userId": "...",
    "email": "user@example.com",
    "name": "User Name",
    "tokenIssuer": "https://login.microsoftonline.com/...",
    "tokenAudience": "api://<CLIENT_ID>",
    ...
  },
  "message": "Successfully retrieved user information"
}
```

✅ **Pass Criteria:**
- Returns HTTP 200
- Includes user information from token
- No authorization errors

## Test Scenario 6: Test All MCP Tools

Test each MCP tool with authentication.

### Echo Tool

```bash
curl -X POST http://localhost:3000/tools/echo \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from MCP!"}' \
  | jq
```

**Expected Response:**
```json
{
  "tool": "echo",
  "result": {
    "originalMessage": "Hello from MCP!",
    "echo": "Echo from <user>: Hello from MCP!",
    "timestamp": "2024-01-..."
  },
  "message": "Message echoed successfully"
}
```

### Calculate Tool

```bash
# Test addition
curl -X POST http://localhost:3000/tools/calculate \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"operation": "add", "a": 15, "b": 27}' \
  | jq

# Test multiplication
curl -X POST http://localhost:3000/tools/calculate \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"operation": "multiply", "a": 6, "b": 7}' \
  | jq
```

✅ **Pass Criteria:** All tools return correct results with valid authentication

## Test Scenario 7: Token Validation Errors

Test various token validation failure scenarios.

### Expired Token
```bash
# Use an old/expired token
curl -X POST http://localhost:3000/tools/get-user-info \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.invalid" \
  | jq
```

**Expected:** HTTP 401 with "Token validation failed" error

### Invalid Format
```bash
# Missing Bearer prefix
curl -X POST http://localhost:3000/tools/get-user-info \
  -H "Authorization: invalid-format" \
  | jq
```

**Expected:** HTTP 401 with "Invalid Authorization header format" error

✅ **Pass Criteria:** All invalid token scenarios return HTTP 401 with appropriate error messages

## Test Scenario 8: VS Code Integration

Test the complete flow with VS Code.

### Prerequisites
- VS Code with MCP support installed
- `.vscode/mcp.json` configured (already in project)

### Steps

1. Start the server:
   ```bash
   npm start
   ```

2. Open VS Code in this project directory

3. Try to use an MCP tool from the command palette or AI chat

4. VS Code should:
   - Detect the authentication requirement
   - Open a browser for OAuth login
   - Redirect to Azure AD
   - After login, redirect back to callback
   - Store the token
   - Execute the tool successfully

✅ **Pass Criteria:**
- VS Code prompts for authentication
- Browser opens for Azure AD login
- After login, tool executes successfully
- Subsequent tool calls don't require re-authentication (until token expires)

## Test Scenario 9: Documentation Endpoints

Test that documentation is accessible.

```bash
# Test home endpoint
curl http://localhost:3000/ | jq

# Test docs endpoint (returns HTML)
curl http://localhost:3000/docs

# Open in browser
open http://localhost:3000/docs
```

✅ **Pass Criteria:** Documentation pages load successfully

## Automated Testing Checklist

Run through this checklist to verify all MUST requirements:

- [ ] OAuth 2.0 Protected Resource Metadata endpoint returns correct information
- [ ] WWW-Authenticate header is present on 401 responses
- [ ] Tokens are validated using JWKS from Azure AD
- [ ] Audience claim is verified (matches server URL or api://<CLIENT_ID>)
- [ ] Issuer claim is verified (matches Azure AD issuer)
- [ ] Expired tokens are rejected with 401
- [ ] Invalid tokens are rejected with 401
- [ ] Tokens from other issuers are rejected
- [ ] Authorization header is required (no query string tokens)
- [ ] Bearer token format is enforced
- [ ] Authorization flow redirects correctly to Azure AD
- [ ] Callback correctly exchanges code for token
- [ ] PKCE is supported in authorization flow
- [ ] State parameter is preserved through flow
- [ ] All protected tools require authentication
- [ ] Tool discovery works without authentication

## Troubleshooting Tests

### Server won't start

```bash
# Check for missing env vars
cat .env

# Check port availability
netstat -an | grep 3000

# Run in development mode for better errors
npm run dev
```

### Can't get access token

```bash
# Verify Azure app registration
az ad app show --id <YOUR_CLIENT_ID>

# Check redirect URIs
az ad app show --id <YOUR_CLIENT_ID> --query "web.redirectUris"

# Verify tenant ID
az account show --query tenantId -o tsv
```

### Token validation fails

Check server logs for specific errors:
- "Token audience mismatch" → Update Application ID URI in Azure
- "Token issuer mismatch" → Verify tenant ID in .env
- "Invalid signature" → Check JWKS endpoint is accessible

## Performance Testing

Test the server's performance under load:

```bash
# Install Apache Bench
# Then run:
ab -n 100 -c 10 http://localhost:3000/

# Or use wrk
wrk -t4 -c100 -d30s http://localhost:3000/tools/list
```

## Security Testing

Verify security measures:

```bash
# 1. Test CORS
curl -H "Origin: http://evil.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization" \
  -X OPTIONS \
  http://localhost:3000/tools/get-user-info \
  -v

# 2. Test SQL injection in parameters (should be safe since we use JSON)
curl -X POST http://localhost:3000/tools/echo \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"message": "\"; DROP TABLE users; --"}' \
  | jq

# 3. Test XSS in parameters
curl -X POST http://localhost:3000/tools/echo \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"message": "<script>alert(1)</script>"}' \
  | jq
```

All should be handled safely.

## Summary

After completing all test scenarios, you should have verified:

1. ✅ OAuth metadata discovery works
2. ✅ Unauthenticated tool discovery works
3. ✅ Protected endpoints reject requests without auth
4. ✅ OAuth authorization flow completes successfully
5. ✅ Protected endpoints accept valid tokens
6. ✅ All MCP tools work correctly
7. ✅ Invalid tokens are properly rejected
8. ✅ VS Code integration works end-to-end

If all tests pass, your MCP OAuth implementation is working correctly! 🎉
