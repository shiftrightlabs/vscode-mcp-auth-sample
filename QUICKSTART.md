# Quick Start Guide

Get up and running with MCP OAuth authentication in 5 minutes!

## Prerequisites Check

Before you begin, verify you have:

```bash
# Check Node.js (need 18+)
node --version

# Check npm
npm --version

# Check Azure CLI
az --version

# Check you're logged into Azure
az account show
```

If any are missing:
- Node.js: Download from https://nodejs.org/
- Azure CLI: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli

## Step 1: Install Dependencies (1 minute)

```bash
npm install
```

Expected output: `added 138 packages`

## Step 2: Create Azure App (2 minutes)

Run these commands and save the outputs:

```bash
# 1. Create the app
az ad app create \
  --display-name "MCP Auth Sample" \
  --web-redirect-uris \
    "http://127.0.0.1:33418" \
    "https://vscode.dev/redirect" \
    "http://localhost:3000/callback"

# ⚠️ SAVE THE "appId" FROM OUTPUT - This is your CLIENT_ID
```

```bash
# 2. Create client secret (replace <APP_ID> with your appId from above)
az ad app credential reset --id <APP_ID> --append

# ⚠️ SAVE THE "password" FROM OUTPUT - This is your CLIENT_SECRET
```

```bash
# 3. Get tenant ID
az account show --query tenantId -o tsv

# ⚠️ SAVE THIS OUTPUT - This is your TENANT_ID
```

## Step 3: Configure Environment (30 seconds)

Create a file named `.env` in the project root:

```env
AZURE_CLIENT_ID=<paste-your-appId-here>
AZURE_CLIENT_SECRET=<paste-your-password-here>
AZURE_TENANT_ID=<paste-your-tenantId-here>
PORT=3000
SERVER_URL=http://localhost:3000
```

**Replace** the `<paste-...>` values with what you saved from Step 2.

## Step 4: Build and Start (1 minute)

```bash
# Build TypeScript
npm run build

# Start the server
npm start
```

You should see:

```
🚀 MCP OAuth Sample Server is running!
Server URL: http://localhost:3000
Port: 3000
```

## Step 5: Verify It's Working (30 seconds)

Open a new terminal and run:

```bash
# Test 1: OAuth metadata (should return JSON)
curl http://localhost:3000/.well-known/oauth-protected-resource

# Test 2: Tool list (should return JSON with tools)
curl http://localhost:3000/tools/list

# Test 3: Protected endpoint (should return 401)
curl -v http://localhost:3000/tools/test-auth 2>&1 | grep "401"
```

If all three work, you're good to go! ✅

## Step 6: Test OAuth Flow (1 minute)

Open your browser to:

```
http://localhost:3000/authorize?scope=openid%20profile%20email&state=test123
```

You should:
1. Be redirected to Microsoft login
2. Login with your Azure account
3. See "Authentication Successful!" page
4. Get a session ID

## Step 7: View Documentation

Open in browser:

```
http://localhost:3000/docs
```

This shows interactive documentation with all endpoints.

## Step 8: Use with VS Code (Optional)

The project already includes `.vscode/mcp.json`. Just:

1. Keep the server running (`npm start`)
2. Open this project in VS Code
3. Use MCP features in VS Code
4. Authenticate when prompted

## Troubleshooting

### "Missing required environment variables"

- Check that `.env` file exists
- Verify all three variables are set
- No quotes needed around values

### "Cannot find module"

```bash
npm install
```

### "Port 3000 already in use"

Change PORT in `.env` to a different port (e.g., 3001)

### "az: command not found"

Install Azure CLI: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli

### "Error exchanging authorization code"

- Verify redirect URIs are correct in Azure
- Check that client secret hasn't expired
- Verify tenant ID is correct

## What You Built

You now have a working MCP server with:

- ✅ OAuth 2.0 authentication
- ✅ Azure AD integration
- ✅ 3 sample MCP tools
- ✅ Full token validation
- ✅ Production-ready architecture

## Next Steps

1. **Read the docs**: See `README.md` for complete documentation
2. **Run tests**: Follow `TESTING.md` to test all features
3. **Add tools**: Modify `src/mcp/tools.ts` to add your own tools
4. **Deploy**: See `README.md` for production deployment guide

## Common Tasks

### Restart the server
```bash
# Stop with Ctrl+C, then:
npm start
```

### Development mode (auto-reload)
```bash
npm run dev
```

### Rebuild after code changes
```bash
npm run build
```

### View server logs
The server logs all requests to console. Look for:
- Authorization requests
- Token validation
- Tool executions

## Getting Help

- Check `README.md` for detailed documentation
- See `TESTING.md` for testing scenarios
- Review `COMPLIANCE.md` for implementation details
- Check `scripts/setup-azure-oauth.md` for Azure help

## Success Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] Azure app created
- [ ] `.env` file configured
- [ ] Server builds (`npm run build`)
- [ ] Server starts (`npm start`)
- [ ] Metadata endpoint works
- [ ] Tools list works
- [ ] Protected endpoint returns 401
- [ ] OAuth flow redirects to Azure
- [ ] After login, shows success page

If all are checked, you're ready to go! 🎉

## Quick Reference

**Start server**: `npm start`

**Test OAuth flow**: Open `http://localhost:3000/authorize?scope=openid%20profile%20email&state=test`

**View docs**: Open `http://localhost:3000/docs`

**Check metadata**: `curl http://localhost:3000/.well-known/oauth-protected-resource`

**Stop server**: Press `Ctrl+C`

---

**Estimated total setup time: 5-10 minutes**

For detailed information, see the complete documentation in `README.md`.
