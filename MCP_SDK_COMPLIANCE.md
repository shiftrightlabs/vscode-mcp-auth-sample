# MCP TypeScript SDK Compliance Review

Comparison of your implementation vs. official SDK examples from `@modelcontextprotocol/typescript-sdk`.

## Non-Standard Patterns Found

### 1. ❌ **Single Global Transport (Critical Issue)**

**Your Code:**
```typescript
let transport: StreamableHTTPServerTransport | null = null;

// Created once and reused for all sessions
if (!transport) {
  transport = new StreamableHTTPServerTransport({ ... });
}
```

**Official SDK Pattern:**
```typescript
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Create new transport PER SESSION
if (!sessionId && isInitializeRequest(req.body)) {
  transport = new StreamableHTTPServerTransport({
    onsessioninitialized: (sessionId) => {
      transports[sessionId] = transport;
    }
  });
}
```

**Why This Matters:**
- Each client connection needs its own transport instance
- Sessions are isolated and have their own state
- Multiple clients can't share the same transport
- VS Code creates a new session per connection

**Impact:** Your server cannot handle multiple concurrent VS Code clients properly.

---

### 2. ❌ **Using `Server` Instead of `McpServer`**

**Your Code:**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
mcpServer = new Server({ name, version }, { capabilities });
```

**Official SDK Pattern:**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
const server = new McpServer({ name, version }, { capabilities });
```

**Why This Matters:**
- `McpServer` is the high-level API with convenience methods
- `Server` is the low-level protocol implementation
- `McpServer` provides `server.tool()`, `server.registerTool()`, etc.

**Impact:** You're using the low-level API when a better API exists.

---

### 3. ❌ **Using `setRequestHandler` Instead of Modern Tool API**

**Your Code:**
```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [...] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  switch (name) {
    case 'get-user-info': ...
  }
});
```

**Official SDK Pattern:**
```typescript
// Modern API auto-generates list/call handlers
server.tool(
  'get-user-info',
  'Returns user information',
  { /* zod schema */ },
  async ({ /* params */ }) => {
    return { content: [...] };
  }
);
```

**Why This Matters:**
- Modern API is type-safe with Zod schemas
- Auto-generates `tools/list` and `tools/call` handlers
- Less boilerplate code
- Better error handling

**Impact:** More code, less type safety, manual tool registration.

---

### 4. ❌ **Missing `isInitializeRequest` Check**

**Your Code:**
```typescript
if (!initialized) {
  await initializeTransport();
  initialized = true;
}
```

**Official SDK Pattern:**
```typescript
if (!sessionId && isInitializeRequest(req.body)) {
  // Only create transport for initialize requests
  transport = new StreamableHTTPServerTransport({ ... });
}
```

**Why This Matters:**
- Only `initialize` requests should create new transports
- Other requests without session IDs should return 400
- Prevents invalid request handling

**Impact:** Your server accepts invalid requests.

---

### 5. ❌ **Missing Session ID Header Handling**

**Your Code:**
```typescript
// No session ID checking
const handleMCPRequest = async (req: Request, res: Response) => {
  // Always uses the same global transport
}
```

**Official SDK Pattern:**
```typescript
const sessionId = req.headers['mcp-session-id'] as string | undefined;

if (sessionId && transports[sessionId]) {
  // Reuse existing transport
  transport = transports[sessionId];
} else if (!sessionId && isInitializeRequest(req.body)) {
  // Create new transport
}
```

**Why This Matters:**
- Clients send `Mcp-Session-Id` header after initialization
- Server must track and reuse transports per session
- Part of the MCP HTTP transport specification

**Impact:** Cannot maintain session state properly.

---

### 6. ❌ **No Transport Cleanup**

**Your Code:**
```typescript
// No cleanup mechanism
```

**Official SDK Pattern:**
```typescript
transport.onclose = () => {
  const sid = transport.sessionId;
  if (sid && transports[sid]) {
    delete transports[sid];
  }
};
```

**Why This Matters:**
- Prevents memory leaks
- Cleans up closed sessions
- Important for long-running servers

**Impact:** Memory leak over time.

---

## Recommended Migration Path

### Step 1: Switch to Standard Implementation

Replace `src/mcp/http-transport.ts` with the standard implementation in `src/mcp/http-transport-standard.ts`:

```bash
mv src/mcp/http-transport.ts src/mcp/http-transport-old.ts
mv src/mcp/http-transport-standard.ts src/mcp/http-transport.ts
```

### Step 2: Update Server Imports

The standard implementation uses:
- `McpServer` instead of `Server`
- `z` from `zod` for schemas
- `isInitializeRequest` from SDK types

### Step 3: Test

```bash
npm run build
npm start
```

Then test with VS Code's "Refresh Tools" - it should work without the "Transport already started" error.

### Step 4: Add OAuth Middleware

The standard implementation has placeholders for OAuth. Add your authentication middleware:

```typescript
const handleMCPPost = async (req: Request, res: Response) => {
  // TODO: Add OAuth bearer token validation here
  // const token = req.headers.authorization?.replace('Bearer ', '');
  // await validateToken(token);

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  // ... rest of handler
}
```

---

## Standard vs Non-Standard Comparison

| Feature | Your Code | Standard SDK |
|---------|-----------|--------------|
| Transport instances | Single global | Per-session map |
| Server class | `Server` | `McpServer` |
| Tool registration | `setRequestHandler` | `server.tool()` |
| Session management | None | Via `Mcp-Session-Id` |
| Initialize check | Missing | `isInitializeRequest()` |
| Cleanup | None | `transport.onclose` |
| Type safety | Manual types | Zod schemas |

---

## Benefits of Standard Approach

1. **✅ Multi-client support** - Each VS Code instance gets its own session
2. **✅ Proper state isolation** - Sessions don't interfere with each other
3. **✅ Memory management** - Automatic cleanup of closed sessions
4. **✅ Type safety** - Zod schemas provide runtime validation
5. **✅ Less code** - High-level API reduces boilerplate
6. **✅ Spec compliance** - Follows MCP HTTP transport specification
7. **✅ Better errors** - Validates requests before processing

---

## References

- Official SDK Repository: https://github.com/modelcontextprotocol/typescript-sdk
- Example: `node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/simpleStreamableHttp.js`
- Example: `node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/jsonResponseStreamableHttp.js`
- MCP Specification: https://modelcontextprotocol.io/
