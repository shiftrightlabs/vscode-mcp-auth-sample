# VS Code MCP Integration Guide

## What is MCP and How Does VS Code Use It?

**MCP (Model Context Protocol)** is a protocol that allows AI assistants (like GitHub Copilot) to access external tools and data sources. Think of it as a way for AI to call APIs.

## Two Ways to Run This Project

### Option 1: Standalone Server (What You've Been Doing)

This is the **recommended approach for learning and testing**:

1. **Start the server manually**: `npm start`
2. **Server runs independently** at `http://localhost:3000`
3. **Test with standard tools**: 
   - Browser: `http://localhost:3000/docs`
   - curl: `curl http://localhost:3000/tools/list`
   - Postman, etc.
4. **Server stays running** until you stop it (Ctrl+C)

**This is what Step 1-7 of QUICKSTART.md does!** You're already using the MCP server, just not through VS Code.

### Option 2: VS Code Managed MCP Server

This is for **production use** with VS Code's MCP client:

1. **VS Code starts the server automatically** when needed
2. **VS Code manages** the server lifecycle (starts/stops)
3. **Requires configuration** in `.vscode/mcp.json`
4. **Requires MCP extension** in VS Code

## Do You Need VS Code Integration?

**No!** Here's why:

- ✅ **This project is a reference implementation** - it shows you HOW to build an OAuth-protected MCP server
- ✅ **Standalone mode is perfect** for learning, testing, and development
- ✅ **You can call the tools directly** using HTTP requests
- ❌ **VS Code MCP integration is optional** - it's just another way to use the server

## If You Want VS Code Integration

### Prerequisites

1. **VS Code with MCP support** - Check if VS Code has built-in MCP support or needs an extension
2. **Understanding of MCP** - Recommended to first use standalone mode

### Setup Steps

#### 1. Create the Configuration Directory

```bash
mkdir -p .vscode
```

#### 2. Create `.vscode/mcp.json`

You can copy from the example:

```bash
cp mcp.json.example .vscode/mcp.json
```

Then edit `.vscode/mcp.json`:

```json
{
  "$schema": "https://json.schemastore.org/mcp.json",
  "mcpServers": {
    "mcp-auth-sample": {
      "command": "node",
      "args": ["dist/server.js"],
      "env": {
        "AZURE_CLIENT_ID": "bd0576f4-f9c2-4fd3-965c-3b15bf5a4fa8",
        "AZURE_CLIENT_SECRET": "your-secret-from-step-2",
        "AZURE_TENANT_ID": "0622d99f-8bae-4279-9f82-1fb659840d53",
        "PORT": "3000",
        "SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

**Important**: Replace the values with your actual Azure credentials from Step 2 of QUICKSTART.md.

#### 3. How VS Code Uses This Config

When you have `.vscode/mcp.json`:

1. **VS Code scans** the file when you open the workspace
2. **Detects MCP servers** defined in the config
3. **Starts the server** automatically when an AI feature needs it
4. **Passes environment variables** from the config
5. **Manages the server lifecycle** (starts/stops as needed)

#### 4. Testing VS Code Integration

1. Open this project folder in VS Code
2. Open GitHub Copilot Chat or similar AI feature
3. Try to use a tool from the `mcp-auth-sample` server
4. VS Code should:
   - Start the MCP server automatically
   - Prompt for OAuth authentication
   - Redirect you to Azure AD login
   - Use the tool after authentication

## Comparison: Standalone vs VS Code Managed

| Feature | Standalone Server | VS Code Managed |
|---------|------------------|-----------------|
| **How to start** | Manual: `npm start` | Automatic: VS Code starts it |
| **When runs** | Until you stop it | Only when needed |
| **Configuration** | `.env` file | `.vscode/mcp.json` |
| **Best for** | Testing, development, learning | Production use with VS Code |
| **Requires** | Terminal, curl/Postman | VS Code MCP support |
| **Flexibility** | High - use any HTTP client | Limited to VS Code features |

## Common Misunderstandings

### ❌ "I need VS Code to test this project"
**No!** You can test everything with curl, browser, or Postman. VS Code integration is optional.

### ❌ ".vscode/mcp.json makes it work automatically"
**Partially true.** The config tells VS Code HOW to start the server, but you still need to trigger MCP features in VS Code (like using Copilot).

### ❌ "Step 8 means I don't need to run npm start"
**Only if VS Code manages it!** If you want to test with curl/browser, you still need `npm start`.

### ❌ "The server is always running with mcp.json"
**No!** With VS Code management, it starts only when needed and stops when not in use.

## Recommended Learning Path

1. **Start with standalone mode** (Steps 1-7 of QUICKSTART.md) ✅ You're here!
2. **Test all endpoints** with curl/browser
3. **Understand OAuth flow** completely
4. **Build your own tools** in `src/mcp/tools.ts`
5. **Then optionally** set up VS Code integration

## What You've Actually Accomplished

By completing Steps 1-7, you have:

✅ Built a working OAuth-protected MCP server
✅ Configured Azure AD authentication
✅ Tested the OAuth flow end-to-end
✅ Verified token validation works
✅ Successfully used MCP tools

**You don't need Step 8 to use or learn from this project!**

## When to Use VS Code Integration

Use VS Code MCP integration when:

- You want VS Code AI features to use your MCP tools
- You're building tools for daily use in your IDE
- You want automatic server lifecycle management
- You're distributing MCP servers to other developers

Don't use it when:

- You're learning how MCP works
- You're testing and debugging
- You want to use the tools from scripts or other apps
- You prefer manual control

## Summary

**Step 8 is optional and for advanced usage.** The standalone server mode you've been using (Steps 1-7) is completely sufficient for:

- ✅ Learning MCP
- ✅ Testing OAuth flows
- ✅ Building and debugging tools
- ✅ Using the API from any HTTP client

The `.vscode/mcp.json` configuration is just an alternative deployment method, not a requirement.
