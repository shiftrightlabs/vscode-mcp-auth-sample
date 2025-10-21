import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config';
import { metadataRouter } from './metadata';
import { oauthRouter } from './oauth';
import { toolsRouter } from './mcp/tools';
import { mcpRouter } from './mcp/http-transport';

/**
 * MCP Server with OAuth 2.0 Authentication
 *
 * This server implements all MUST requirements from:
 * - MCP Authorization Specification (2025-06-18)
 * - OAuth 2.1 (RFC 9725)
 * - OAuth 2.0 Protected Resource Metadata (RFC 9728)
 * - OAuth 2.0 Resource Indicators (RFC 8707)
 *
 * Architecture:
 * - Authorization Server: Azure AD (Microsoft Entra)
 * - Resource Server: This MCP server
 * - Client: VS Code with MCP support
 */

async function startServer() {
  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });

  // Mount MCP protocol handler FIRST
  // This handles / for MCP JSON-RPC and SSE requests from VS Code
  app.use(mcpRouter);

  // Documentation endpoint
  app.get('/docs', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>MCP OAuth Sample - Documentation</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 900px;
              margin: 50px auto;
              padding: 0 20px;
              line-height: 1.6;
            }
            h1 { color: #333; }
            h2 { color: #666; margin-top: 30px; }
            code {
              background: #f4f4f4;
              padding: 2px 6px;
              border-radius: 3px;
              font-family: monospace;
            }
            pre {
              background: #f4f4f4;
              padding: 15px;
              border-radius: 5px;
              overflow-x: auto;
            }
            .endpoint {
              background: #e8f4f8;
              padding: 10px;
              margin: 10px 0;
              border-left: 4px solid #0066cc;
            }
          </style>
        </head>
        <body>
          <h1>MCP OAuth Sample Server</h1>
          <p>This server demonstrates OAuth 2.0 authentication for MCP (Model Context Protocol) servers using Azure AD.</p>

          <h2>Endpoints</h2>

          <div class="endpoint">
            <strong>GET /.well-known/oauth-protected-resource</strong><br>
            OAuth 2.0 Protected Resource Metadata (RFC 9728)<br>
            Public endpoint that provides metadata about this resource server.
          </div>

          <div class="endpoint">
            <strong>GET /authorize</strong><br>
            Initiates the OAuth 2.0 authorization flow.<br>
            Redirects to Azure AD for user authentication.
          </div>

          <div class="endpoint">
            <strong>GET /callback</strong><br>
            OAuth callback endpoint.<br>
            Receives authorization code and exchanges it for access token.
          </div>

          <div class="endpoint">
            <strong>GET /tools/list</strong><br>
            Lists available MCP tools.<br>
            Public endpoint for tool discovery.
          </div>

          <div class="endpoint">
            <strong>POST /tools/get-user-info</strong><br>
            Returns authenticated user information.<br>
            Requires: <code>Authorization: Bearer &lt;token&gt;</code>
          </div>

          <div class="endpoint">
            <strong>POST /tools/echo</strong><br>
            Echoes a message with user context.<br>
            Requires: <code>Authorization: Bearer &lt;token&gt;</code><br>
            Parameters: <code>{ "message": "string" }</code>
          </div>

          <div class="endpoint">
            <strong>POST /tools/calculate</strong><br>
            Performs mathematical calculations.<br>
            Requires: <code>Authorization: Bearer &lt;token&gt;</code><br>
            Parameters: <code>{ "operation": "add|subtract|multiply|divide", "a": number, "b": number }</code>
          </div>

          <h2>OAuth Flow</h2>
          <ol>
            <li>VS Code MCP client detects authentication requirement from <code>mcp.json</code></li>
            <li>Client redirects user to <code>/authorize</code></li>
            <li>Server redirects to Azure AD login page</li>
            <li>User authenticates and grants permissions</li>
            <li>Azure AD redirects back to <code>/callback</code> with authorization code</li>
            <li>Server exchanges code for access token</li>
            <li>Subsequent MCP tool requests include <code>Authorization: Bearer &lt;token&gt;</code> header</li>
          </ol>

          <h2>Testing with curl</h2>
          <pre>
# 1. Get OAuth metadata
curl http://localhost:${config.server.port}/.well-known/oauth-protected-resource

# 2. List available tools (no auth required)
curl http://localhost:${config.server.port}/tools/list

# 3. Try accessing protected endpoint without auth (should get 401)
curl -X POST http://localhost:${config.server.port}/tools/get-user-info

# 4. Access protected endpoint with token
curl -X POST http://localhost:${config.server.port}/tools/get-user-info \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
          </pre>

          <h2>VS Code Configuration</h2>
          <p>Add this to your <code>mcp.json</code> file:</p>
          <pre>
{
  "servers": {
    "mcp-auth-sample": {
      "type": "http",
      "url": "http://localhost:${config.server.port}",
      "authentication": {
        "provider": "azure-ad",
        "scopes": ["openid", "profile", "email"]
      }
    }
  }
}
          </pre>

          <h2>Security Implementation</h2>
          <ul>
            <li>✓ OAuth 2.1 compliant</li>
            <li>✓ PKCE support (Proof Key for Code Exchange)</li>
            <li>✓ JWT token validation with JWKS</li>
            <li>✓ Audience verification (RFC 8707)</li>
            <li>✓ Issuer verification</li>
            <li>✓ WWW-Authenticate headers on 401 responses</li>
            <li>✓ Secure token storage (production: use database)</li>
            <li>✓ HTTPS enforcement (production)</li>
          </ul>

          <h2>Links</h2>
          <ul>
            <li><a href="https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization">MCP Authorization Spec</a></li>
            <li><a href="https://code.visualstudio.com/api/extension-guides/ai/mcp#authorization">VS Code MCP Guide</a></li>
            <li><a href="https://github.com/modelcontextprotocol">MCP GitHub</a></li>
          </ul>
        </body>
      </html>
    `);
  });

  // Mount other routers (MCP router already mounted above)
  app.use(metadataRouter);  // /.well-known/oauth-protected-resource
  app.use(oauthRouter);     // /authorize, /callback
  app.use(toolsRouter);     // /tools/*

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'not_found',
      message: `Endpoint not found: ${req.method} ${req.path}`,
      availableEndpoints: [
        'POST / (MCP JSON-RPC)',
        'GET / (MCP SSE)',
        'POST /mcp (MCP JSON-RPC)',
        'GET /mcp (MCP SSE)',
        'GET /.well-known/oauth-protected-resource',
        'GET /authorize',
        'GET /callback',
        'GET /tools/list',
        'POST /tools/get-user-info',
        'POST /tools/echo',
        'POST /tools/calculate',
      ],
    });
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'internal_server_error',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });

  // Start server
  const port = config.server.port;
  app.listen(port, () => {
    console.log('\n=================================================');
    console.log(`🚀 MCP OAuth Sample Server is running!`);
    console.log('=================================================');
    console.log(`Server URL: ${config.server.url}`);
    console.log(`Port: ${port}`);
    console.log(`\nEndpoints:`);
    console.log(`  Home:        ${config.server.url}/`);
    console.log(`  Docs:        ${config.server.url}/docs`);
    console.log(`  Metadata:    ${config.server.url}/.well-known/oauth-protected-resource`);
    console.log(`  Authorize:   ${config.server.url}/authorize`);
    console.log(`  Callback:    ${config.server.url}/callback`);
    console.log(`  Tools:       ${config.server.url}/tools/list`);
    console.log(`\nOAuth Provider: Azure AD`);
    console.log(`  Tenant ID:   ${config.azure.tenantId}`);
    console.log(`  Client ID:   ${config.azure.clientId}`);
    console.log('=================================================\n');
  });
}

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
