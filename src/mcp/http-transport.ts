import { Request, Response, Router, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * STANDARD MCP HTTP Transport Handler
 *
 * Based on official SDK examples:
 * - Per-session transport instances
 * - Session ID management
 * - Proper initialization flow
 * - Transport cleanup
 */

export const mcpRouter = Router();

/**
 * Store for request context (maps session ID to request)
 * This allows tools to access the HTTP request and authorization header
 */
const requestContextStore = new Map<string, Request>();

/**
 * Create a new MCP server instance with tools
 * This is called for each new transport/session
 */
function createMCPServer(sessionId: string): McpServer {
  const server = new McpServer(
    {
      name: 'mcp-auth-sample',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools using the modern API
  server.tool(
    'get-user-info',
    'Returns authenticated user information from access token and Microsoft Graph API',
    {}, // No input parameters
    async () => {
      try {
        // Extract the access token from the stored request context
        const req = requestContextStore.get(sessionId);
        const authHeader = req?.headers?.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new Error('No access token found. Please authenticate first.');
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // 1. Read claims from the JWT token (without verification)
        const decoded = jwt.decode(token, { complete: true });
        const payload = decoded?.payload as jwt.JwtPayload;

        // 2. Call Microsoft Graph API to get user profile
        const graphResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          timeout: 5000,
        });

        const graphUser = graphResponse.data;

        // 3. Combine information from both sources
        const result = {
          title: '✅ Authenticated User Information',
          authentication: {
            method: 'OAuth 2.0 Authorization Code with PKCE',
            client_type: 'Public Client (no client secret)',
            token_validated: 'via Microsoft Graph API introspection',
          },
          token_claims: {
            issuer: payload?.iss,
            subject: payload?.sub,
            audience: payload?.aud,
            issued_at: payload?.iat ? new Date(payload.iat * 1000).toISOString() : null,
            expires_at: payload?.exp ? new Date(payload.exp * 1000).toISOString() : null,
            application_id: payload?.appid || payload?.azp,
            scopes: payload?.scp?.split(' ') || [],
          },
          graph_api_user: {
            id: graphUser.id,
            displayName: graphUser.displayName,
            givenName: graphUser.givenName,
            surname: graphUser.surname,
            userPrincipalName: graphUser.userPrincipalName,
            mail: graphUser.mail,
            jobTitle: graphUser.jobTitle,
            officeLocation: graphUser.officeLocation,
            mobilePhone: graphUser.mobilePhone,
            businessPhones: graphUser.businessPhones,
          },
          demonstration: {
            token_reading: '✅ Successfully read JWT claims from access token',
            graph_api_access: '✅ Successfully called Microsoft Graph API',
            security_validation: '✅ Token validated via Graph API introspection',
          },
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        let errorMessage = 'Failed to get user information';
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 401) {
            errorMessage = 'Access token is invalid or expired. Please re-authenticate.';
          } else {
            errorMessage = `Graph API error: ${error.response?.status} ${error.response?.statusText}`;
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: errorMessage,
                details: error instanceof Error ? error.message : String(error),
              }, null, 2),
            },
          ],
        };
      }
    }
  );

  server.tool(
    'echo',
    'Echoes a message back with authentication confirmation',
    {
      message: z.string().describe('The message to echo back'),
    },
    async ({ message }) => {
      return {
        content: [
          {
            type: 'text',
            text: `Echo: ${message}\n\n✅ Authenticated via OAuth 2.0 PKCE (Public Client)`,
          },
        ],
      };
    }
  );

  return server;
}

// Map to store transports by session ID (per-session transport instances)
const transports: Record<string, StreamableHTTPServerTransport> = {};

/**
 * Authentication middleware for MCP endpoints
 * - Allows 'initialize' requests without auth (for discovery)
 * - Requires auth for all other requests (especially tools/call)
 */
const mcpAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Allow initialize requests without authentication (for discovery)
  if (isInitializeRequest(req.body)) {
    console.log('Initialize request - allowing without auth for discovery');
    return next();
  }

  // Check if this is a tools/call request (requires auth)
  const method = req.body?.method;
  if (method === 'tools/call' || method === 'tools/list') {
    console.log(`MCP request '${method}' requires authentication`);
    // Delegate to requireAuth middleware
    return requireAuth(req, res, next);
  }

  // For other methods, allow without auth
  console.log(`MCP request '${method}' - allowing without auth`);
  next();
};

/**
 * POST /mcp - Main MCP JSON-RPC endpoint
 */
const handleMCPPost = async (req: Request, res: Response) => {
  // Check for existing session ID in header
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  console.log(`MCP POST request - Session ID: ${sessionId || 'none'}, Method: ${req.body?.method || 'unknown'}`);

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport for this session
      console.log(`Reusing existing transport for session: ${sessionId}`);
      transport = transports[sessionId];

      // Store the request context for this session (so tools can access auth headers)
      requestContextStore.set(sessionId, req);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request - create new transport
      console.log('Creating new transport for initialize request');

      const newSessionId = randomUUID();

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        enableJsonResponse: true,
        onsessioninitialized: (sid) => {
          // Store the transport by session ID when initialized
          console.log(`Session initialized with ID: ${sid}`);
          transports[sid] = transport;
        },
      });

      // Set up cleanup handler
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`Transport closed for session ${sid}, cleaning up`);
          delete transports[sid];
          requestContextStore.delete(sid);
        }
      };

      // Create and connect the MCP server to this transport
      const server = createMCPServer(newSessionId);
      await server.connect(transport);

      // Handle the initialize request
      await transport.handleRequest(req, res, req.body);
      return; // Already handled
    } else {
      // Invalid request - no session ID or not an initialize request
      console.error('Invalid request: no session ID and not an initialize request');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle the request with existing transport
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP POST request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: error instanceof Error ? error.message : String(error),
        },
        id: null,
      });
    }
  }
};

/**
 * GET /mcp - SSE endpoint for server-to-client messages
 */
const handleMCPGet = async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  console.log(`MCP GET request - Session ID: ${sessionId || 'none'}`);

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

/**
 * DELETE /mcp - Session termination endpoint
 */
const handleMCPDelete = async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  console.log(`MCP DELETE request - Session ID: ${sessionId || 'none'}`);

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  try {
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling session termination:', error);
    if (!res.headersSent) {
      res.status(500).send('Error processing session termination');
    }
  }
};

// Register routes for /mcp endpoint with auth middleware
mcpRouter.post('/mcp', mcpAuthMiddleware, handleMCPPost);
mcpRouter.get('/mcp', handleMCPGet);
mcpRouter.delete('/mcp', handleMCPDelete);

// Also support root path (/) for compatibility
mcpRouter.post('/', mcpAuthMiddleware, handleMCPPost);
mcpRouter.get('/', handleMCPGet);
mcpRouter.delete('/', handleMCPDelete);

// Cleanup on server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down MCP server...');

  for (const sessionId in transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }

  console.log('MCP server shutdown complete');
});
