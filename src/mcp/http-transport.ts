import { Request, Response, Router, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
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
 * Create a new MCP server instance with tools
 * This is called for each new transport/session
 */
function createMCPServer(): McpServer {
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
    'Returns authenticated user information from the access token',
    {}, // No input parameters
    async () => {
      // In production, extract user info from validated JWT token
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: 'User authenticated via OAuth 2.0 PKCE',
              user: {
                name: 'Authenticated User',
                email: 'user@example.com',
              },
              security: 'Public Client (no client secret)',
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    'echo',
    'Echoes a message back with user context',
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

  server.tool(
    'calculate',
    'Performs a mathematical calculation',
    {
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('The mathematical operation to perform'),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    },
    async ({ operation, a, b }) => {
      let result: number;

      switch (operation) {
        case 'add':
          result = a + b;
          break;
        case 'subtract':
          result = a - b;
          break;
        case 'multiply':
          result = a * b;
          break;
        case 'divide':
          if (b === 0) {
            throw new Error('Division by zero');
          }
          result = a / b;
          break;
      }

      return {
        content: [
          {
            type: 'text',
            text: `Result: ${a} ${operation} ${b} = ${result}\n\n✅ Calculated by authenticated MCP server`,
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
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request - create new transport
      console.log('Creating new transport for initialize request');

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId) => {
          // Store the transport by session ID when initialized
          console.log(`Session initialized with ID: ${newSessionId}`);
          transports[newSessionId] = transport;
        },
      });

      // Set up cleanup handler
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`Transport closed for session ${sid}, cleaning up`);
          delete transports[sid];
        }
      };

      // Create and connect the MCP server to this transport
      const server = createMCPServer();
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
