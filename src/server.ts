import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config';
import { metadataRouter } from './metadata';
import { oauthRouter } from './oauth';
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

  // Mount routers
  app.use(metadataRouter);  // /.well-known/oauth-protected-resource
  app.use(oauthRouter);     // /authorize, /callback

  // Mount MCP protocol handler LAST (it handles / and /mcp routes)
  // This handles JSON-RPC and SSE requests from VS Code
  app.use(mcpRouter);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'not_found',
      message: `Endpoint not found: ${req.method} ${req.path}`,
      availableEndpoints: [
        'POST / (MCP JSON-RPC)',
        'GET / (MCP SSE)',
        'DELETE / (MCP Session)',
        'POST /mcp (MCP JSON-RPC)',
        'GET /mcp (MCP SSE)',
        'DELETE /mcp (MCP Session)',
        'GET /.well-known/oauth-protected-resource (OAuth metadata)',
        'GET /authorize (OAuth flow)',
        'GET /callback (OAuth callback)',
      ],
    });
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
    console.log(`\nMCP Protocol Endpoints:`);
    console.log(`  JSON-RPC:    POST ${config.server.url}/`);
    console.log(`  SSE Stream:  GET  ${config.server.url}/`);
    console.log(`  Session End: DELETE ${config.server.url}/`);
    console.log(`\nOAuth Endpoints:`);
    console.log(`  Metadata:    ${config.server.url}/.well-known/oauth-protected-resource`);
    console.log(`  Authorize:   ${config.server.url}/authorize`);
    console.log(`  Callback:    ${config.server.url}/callback`);
    console.log(`\nOAuth Provider: Azure AD (Public Client - PKCE)`);
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
