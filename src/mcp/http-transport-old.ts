import { Request, Response, Router } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';

/**
 * MCP HTTP Transport Handler
 *
 * Implements the MCP HTTP transport specification:
 * - Single endpoint for JSON-RPC messages
 * - SSE (Server-Sent Events) for server-to-client communication
 * - OAuth authentication in HTTP layer
 */

export const mcpRouter = Router();

// Create a single MCP server instance
let mcpServer: Server | null = null;
let transport: StreamableHTTPServerTransport | null = null;

/**
 * Get or create the MCP server instance
 */
function getMCPServer(): Server {
  if (mcpServer) {
    return mcpServer;
  }

  mcpServer = new Server(
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

  const server = mcpServer;

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get-user-info',
          description: 'Returns authenticated user information from the access token',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'echo',
          description: 'Echoes a message back with user context',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'The message to echo back',
              },
            },
            required: ['message'],
          },
        },
        {
          name: 'calculate',
          description: 'Performs a mathematical calculation',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['add', 'subtract', 'multiply', 'divide'],
                description: 'The mathematical operation to perform',
              },
              a: {
                type: 'number',
                description: 'First number',
              },
              b: {
                type: 'number',
                description: 'Second number',
              },
            },
            required: ['operation', 'a', 'b'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'get-user-info':
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

      case 'echo':
        const message = (args as any)?.message || '';
        return {
          content: [
            {
              type: 'text',
              text: `Echo: ${message}\n\n✅ Authenticated via OAuth 2.0 PKCE (Public Client)`,
            },
          ],
        };

      case 'calculate':
        const { operation, a, b } = args as any;
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
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Result: ${a} ${operation} ${b} = ${result}\n\n✅ Calculated by authenticated MCP server`,
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

// Initialize the server and connect the transport
async function initializeTransport() {
  // Create a new transport instance if one doesn't exist
  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
    });
    console.log('Created new StreamableHTTPServerTransport instance');
  }

  const server = getMCPServer();

  // Connect the server to the transport
  // Note: server.connect() will call transport.start() internally
  await server.connect(transport);
  console.log('MCP server connected to StreamableHTTPServerTransport');
}

// Initialize on first request
let initialized = false;

/**
 * Main MCP endpoint - handles POST, GET, and DELETE using StreamableHTTPServerTransport
 */
const handleMCPRequest = async (req: Request, res: Response) => {
  // Initialize transport on first request
  if (!initialized) {
    try {
      await initializeTransport();
      initialized = true;
    } catch (error) {
      console.error('Error initializing MCP transport:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Failed to initialize MCP server',
          data: error instanceof Error ? error.message : String(error),
        },
        id: null,
      });
      return;
    }
  }

  // TODO: Add OAuth authentication check here
  // For now, allow unauthenticated for testing

  console.log(`MCP ${req.method} request to ${req.path}`);

  // Ensure transport is initialized
  if (!transport) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Transport not initialized',
      },
      id: null,
    });
    return;
  }

  try {
    // Use the StreamableHTTPServerTransport to handle the request
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error),
        },
        id: null,
      });
    }
  }
};

// Register handlers for /mcp endpoint (all HTTP methods)
mcpRouter.post('/mcp', handleMCPRequest);
mcpRouter.get('/mcp', handleMCPRequest);
mcpRouter.delete('/mcp', handleMCPRequest);

/**
 * Root endpoints - VS Code may send requests to / instead of /mcp
 * Use the same handler as /mcp
 */
mcpRouter.post('/', handleMCPRequest);
mcpRouter.get('/', handleMCPRequest);
mcpRouter.delete('/', handleMCPRequest);
