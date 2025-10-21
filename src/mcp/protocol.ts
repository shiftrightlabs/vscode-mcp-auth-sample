import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP Protocol Server
 *
 * This implements the Model Context Protocol using the official SDK.
 * It provides tools that require OAuth authentication.
 */

export class MCPProtocolServer {
  private server: Server;

  constructor() {
    this.server = new Server(
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

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
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
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Note: Authentication should be handled by the transport layer or middleware
      // For HTTP-based MCP, the Bearer token would be in the Authorization header

      switch (name) {
        case 'get-user-info':
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'This tool requires authentication. Token validation should be implemented in the HTTP layer.',
                  user: {
                    name: 'Authenticated User',
                    email: 'user@example.com',
                  },
                }, null, 2),
              },
            ],
          };

        case 'echo': {
          const message = (args as any)?.message || '';
          return {
            content: [
              {
                type: 'text',
                text: `Echo: ${message}\n\nAuthenticated via OAuth 2.0 PKCE`,
              },
            ],
          };
        }

        case 'calculate': {
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
                text: `Result: ${a} ${operation} ${b} = ${result}`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Protocol Server running on stdio');
  }
}
