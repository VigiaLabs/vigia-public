import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

/**
 * MCP Client Wrapper for VIGIA.
 * 
 * In a real Next.js environment, we would use an In-Process transport
 * or a persistent background process. For this transition phase,
 * we provide a helper to call tools via the MCP protocol.
 */
export async function callVigiaTool(toolName: string, args: any) {
  const serverPath = path.join(process.cwd(), "lib", "mcp", "server.ts");
  
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", serverPath],
  });

  const client = new Client(
    {
      name: "vigia-internal-client",
      version: "0.1.0",
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  
  try {
    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });
    return result;
  } finally {
    // Standard practice to close transport
    // Note: In a high-traffic app, we'd keep the connection pooled
    await transport.close();
  }
}
