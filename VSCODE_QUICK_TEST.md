# Quick Reference: Testing MCP Server with VS Code

## 🎯 Goal
Test the OAuth-protected MCP server with GitHub Copilot and verify JWT token validation.

## ✅ Prerequisites Checklist
- [ ] Completed QUICKSTART.md Steps 1-7
- [ ] VS Code installed
- [ ] GitHub Copilot extension installed
- [ ] Server works in standalone mode (`npm start` works)
- [ ] `.vscode/mcp.json` exists with your Azure credentials

## 🚀 Quick Setup (5 Steps)

### 1. Stop Standalone Server
```bash
# Kill any running server on port 3000
kill $(lsof -ti:3000)
```

### 2. Verify Configuration
```bash
# Check that .vscode/mcp.json exists
cat .vscode/mcp.json
```

### 3. Reload VS Code
- Press: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
- Type: `Developer: Reload Window`
- Press: Enter

### 4. Open GitHub Copilot Chat
- Click Copilot icon in sidebar
- Or press: `Cmd+Shift+I` / `Ctrl+Shift+I`

### 5. Test with a Prompt

Try this in Copilot Chat:
```
@workspace Use the mcp-auth-sample server to get my user information
```

## 📋 What Should Happen

1. ✅ Copilot recognizes the MCP tool
2. ✅ VS Code starts the server automatically
3. ✅ Server requires authentication (returns 401)
4. ✅ VS Code prompts for authentication
5. ✅ Browser opens to Azure AD login
6. ✅ You login with Azure account
7. ✅ Redirected back with success message
8. ✅ Token is validated (JWT signature, issuer, audience, expiration)
9. ✅ Tool executes successfully
10. ✅ Result appears in Copilot chat

## 🧪 Test Prompts

### Test 1: User Info
```
@workspace Use the mcp-auth-sample server to get my user information
```

### Test 2: Echo
```
@workspace Use the mcp-auth-sample server to echo "Hello from VS Code!"
```

### Test 3: Calculate
```
@workspace Use the mcp-auth-sample server to calculate 42 * 137
```

## 🔍 Verify JWT Validation

Check VS Code Output panel for these logs:

**View → Output → Select "MCP" or server name**

Look for:
```
Token validated successfully: {
  subject: '...',
  audience: 'bd0576f4-f9c2-4fd3-965c-3b15bf5a4fa8',
  issuer: 'https://login.microsoftonline.com/.../v2.0',
  expiresAt: '...'
}
```

This confirms:
- ✅ JWT signature verified using JWKS
- ✅ Issuer matches Azure AD
- ✅ Audience matches your client ID
- ✅ Token not expired

## ⚠️ Troubleshooting

### "MCP server not found"
```bash
# Reload VS Code window
Cmd+Shift+P → Developer: Reload Window
```

### "Port 3000 already in use"
```bash
lsof -ti:3000 | xargs kill
```

### VS Code doesn't show MCP commands
- GitHub Copilot may handle MCP automatically
- Try the test prompts anyway
- Or use standalone mode: `npm start`

### Authentication fails
1. Check redirect URI in Azure: `http://localhost:3000/callback`
2. Verify credentials in `.vscode/mcp.json`
3. Test standalone: `npm start` then open browser to test URL

## 📊 Success Indicators

You've successfully tested when you see:

- ✅ OAuth login flow completes
- ✅ "Authentication Successful!" page appears
- ✅ Token validation logs show in Output panel
- ✅ Tool result appears in Copilot chat
- ✅ No errors in the logs

## 🔄 Alternative: Manual Testing

If VS Code integration isn't working:

```bash
# 1. Start server manually
npm start

# 2. Test OAuth flow in browser
open http://localhost:3000/authorize?scope=openid%20profile%20email&state=test

# 3. Test protected endpoint (should return 401)
curl -v http://localhost:3000/tools/test-auth
```

## 📚 Full Documentation

- **Complete setup**: `VSCODE_SETUP.md`
- **Troubleshooting**: `VSCODE_SETUP.md` (Troubleshooting section)
- **Manual testing**: `TESTING.md`
- **Implementation details**: `COMPLIANCE.md`

## 🎓 What This Tests

1. **OAuth 2.1**: Authorization code flow with PKCE
2. **JWT Validation**: Signature, issuer, audience, expiration
3. **RFC 9728**: Protected Resource Metadata
4. **RFC 8707**: Resource Indicators (audience validation)
5. **MCP Protocol**: Tool discovery and execution
6. **VS Code Integration**: Automatic server lifecycle management

---

**Time required**: 5-10 minutes (including authentication)

**Difficulty**: Intermediate

**Prerequisites**: QUICKSTART.md Steps 1-7 completed
