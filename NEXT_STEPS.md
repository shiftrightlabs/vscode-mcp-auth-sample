# 🚀 Your Next Steps - VS Code MCP Testing

Congratulations! You've successfully set up an OAuth-protected MCP server. Now let's test it with VS Code and GitHub Copilot.

## ✅ What You've Already Done

Based on the QUICKSTART.md, you've completed:

- ✅ Step 1: Installed dependencies (`npm install`)
- ✅ Step 2: Created Azure AD app registration
- ✅ Step 3: Configured environment variables (`.env` file)
- ✅ Step 4: Built the project (`npm run build`)
- ✅ Step 5: Started the server (`npm start`)
- ✅ Step 6: Tested OAuth flow in browser (fixed the error!)
- ✅ Step 7: Viewed documentation at `http://localhost:3000/docs`

## 🎯 What's Next - Test with VS Code

I've prepared everything for you to test the MCP server with GitHub Copilot:

### Configuration Already Done ✅

1. **`.vscode/mcp.json` created** - Contains your Azure credentials
2. **Server is built** - The `dist/` folder has the compiled code
3. **OAuth is working** - We fixed the Azure AD v2.0 token exchange issue

### 5 Simple Steps to Test

#### Step 1: Stop the Standalone Server

If you have `npm start` running in a terminal, stop it:

```bash
# Press Ctrl+C in that terminal
# OR find and kill the process:
kill $(lsof -ti:3000)
```

**Why?** VS Code will manage the server, so we don't need it running manually.

#### Step 2: Reload VS Code

This makes VS Code detect the `.vscode/mcp.json` configuration:

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: `Developer: Reload Window`
3. Press Enter

#### Step 3: Open GitHub Copilot Chat

1. Click the GitHub Copilot icon in the sidebar
2. Or press `Cmd+Shift+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)

#### Step 4: Try a Test Prompt

Copy and paste this into Copilot Chat:

```
@workspace Use the mcp-auth-sample server to get my user information
```

#### Step 5: Authenticate

When prompted:

1. A browser window will open to Azure AD
2. Login with your Azure account
3. After login, you'll see "Authentication Successful!"
4. Return to VS Code - the tool should execute and show your user info

## 📊 What You'll See

### In VS Code Output Panel

**View → Output → Select "MCP" or your server name**

You should see logs like:

```
Authorization request received
Redirecting to Azure AD
Callback received
Access token received
Token validated successfully: {
  subject: '...',
  audience: 'bd0576f4-f9c2-4fd3-965c-3b15bf5a4fa8',
  issuer: 'https://login.microsoftonline.com/0622d99f-8bae-4279-9f82-1fb659840d53/v2.0'
}
```

### In GitHub Copilot Chat

You should see a response with your user information:

```json
{
  "tool": "get-user-info",
  "result": {
    "userId": "...",
    "email": "your-email@domain.com",
    "name": "Your Name",
    "tokenIssuer": "https://login.microsoftonline.com/...",
    "tokenAudience": "bd0576f4-f9c2-4fd3-965c-3b15bf5a4fa8"
  }
}
```

## 🧪 More Test Prompts

Once the first one works, try these:

### Echo Test
```
@workspace Use the mcp-auth-sample server to echo "Hello from VS Code!"
```

### Calculate Test
```
@workspace Use the mcp-auth-sample server to calculate 42 * 137
```

## ✨ What This Proves

When these tests work, you've proven:

1. ✅ **OAuth 2.1 Flow** - Complete authorization code flow with PKCE
2. ✅ **JWT Validation** - Token signature, issuer, audience, expiration checks
3. ✅ **Azure AD Integration** - Successful authentication with Microsoft Entra
4. ✅ **MCP Protocol** - VS Code successfully calls your MCP tools
5. ✅ **Security** - Only authenticated users can access protected tools

## 📚 Documentation Quick Reference

| Document | When to Use |
|----------|-------------|
| **VSCODE_QUICK_TEST.md** | Quick reference card for testing |
| **VSCODE_SETUP.md** | Detailed setup and troubleshooting |
| **VSCODE_INTEGRATION.md** | Understanding how it all works |
| **TESTING.md** | Manual testing with curl/browser |
| **COMPLIANCE.md** | Technical implementation details |

## ⚠️ Troubleshooting

### "MCP server not found" or Copilot doesn't recognize it

**Try this:**
1. Check that `.vscode/mcp.json` exists: `cat .vscode/mcp.json`
2. Reload VS Code window again
3. Make sure GitHub Copilot extension is installed and up to date

### Port 3000 already in use

**Solution:**
```bash
lsof -ti:3000 | xargs kill
```

### Authentication fails or redirects to error page

**Check:**
1. Azure app redirect URIs include: `http://localhost:3000/callback`
2. Credentials in `.vscode/mcp.json` match your `.env` file
3. Try standalone mode to verify OAuth works: `npm start`

### VS Code doesn't show any output

**Try:**
1. View → Output → Check different dropdown options
2. Check the terminal at the bottom of VS Code
3. Use standalone mode and check console output

## 🔄 Alternative: Test Without VS Code

If VS Code integration isn't working, you can still test everything manually:

```bash
# 1. Start the server
npm start

# 2. Open browser to test OAuth
open http://localhost:3000/authorize?scope=openid%20profile%20email&state=test123

# 3. After authentication, test a protected endpoint
curl -v http://localhost:3000/tools/test-auth
# Should return 401 (proving authentication is required)
```

This proves the OAuth implementation is working, even if VS Code integration needs more setup.

## 🎓 Learning Outcomes

By completing this test, you've learned:

- How MCP servers integrate with VS Code
- How OAuth 2.1 authorization code flow works
- How JWT tokens are validated (signature, claims, expiration)
- How to build secure, authenticated APIs
- How to configure VS Code for MCP servers

## 💡 Next Steps After Testing

1. **Add your own tools** - Edit `src/mcp/tools.ts`
2. **Customize scopes** - Modify required permissions
3. **Deploy to production** - Use HTTPS and secure storage
4. **Share with your team** - They can add your server to their VS Code

## 🆘 Need Help?

- **Quick troubleshooting**: See `VSCODE_QUICK_TEST.md`
- **Detailed help**: See `VSCODE_SETUP.md`
- **Understanding concepts**: See `VSCODE_INTEGRATION.md`
- **Manual testing**: See `TESTING.md`

---

## 🎯 Your Action Items

- [ ] Stop standalone server (`Ctrl+C` or kill process)
- [ ] Reload VS Code window
- [ ] Open GitHub Copilot Chat
- [ ] Try the test prompt
- [ ] Authenticate when prompted
- [ ] Verify token validation in Output panel
- [ ] See result in Copilot Chat
- [ ] Try additional test prompts

**Time needed**: 5-10 minutes

**You're ready to go!** Just follow the 5 steps above.

---

Good luck! 🚀
