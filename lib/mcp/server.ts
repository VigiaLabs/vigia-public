import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Import existing tools
import { searchTenderByRoadNumber } from "../tools/tender-search.js";
import { getRoadInfoByCoordinates } from "../tools/gati-shakti.js";
import { getRTIAuthority } from "../tools/rti-lookup.js";
import { getComplaintAuthority } from "../tools/complaint-routing.js";

const server = new Server(
  {
    name: "vigia-infrastructure-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools.
 * Each tool corresponds to one of the verified VIGIA functions.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_tenders",
        description: "Search for infrastructure tender/contract data by road number (e.g., 'NH-44', 'SH-15').",
        inputSchema: {
          type: "object",
          properties: {
            roadNumber: { type: "string" },
          },
          required: ["roadNumber"],
        },
      },
      {
        name: "get_road_info",
        description: "Get road type, name, and state from GPS coordinates.",
        inputSchema: {
          type: "object",
          properties: {
            lat: { type: "number" },
            lng: { type: "number" },
          },
          required: ["lat", "lng"],
        },
      },
      {
        name: "get_rti_authority",
        description: "Get the correct RTI filing authority and suggested questions for a road segment.",
        inputSchema: {
          type: "object",
          properties: {
            roadType: { enum: ["NH", "SH", "MDR", "rural", "unknown"] },
            state: { type: "string", nullable: true },
          },
          required: ["roadType"],
        },
      },
      {
        name: "route_complaint",
        description: "Find the correct grievance portal for reporting road issues.",
        inputSchema: {
          type: "object",
          properties: {
            roadType: { enum: ["NH", "SH", "MDR", "rural", "unknown"] },
            state: { type: "string", nullable: true },
          },
          required: ["roadType"],
        },
      },
    ],
  };
});

/**
 * Handle tool calls.
 * Routes the MCP request to the existing tool functions.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_tenders": {
        const { roadNumber } = z.object({ roadNumber: z.string() }).parse(args);
        const results = await searchTenderByRoadNumber(roadNumber);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "get_road_info": {
        const { lat, lng } = z.object({ lat: z.number(), lng: z.number() }).parse(args);
        const results = await getRoadInfoByCoordinates(lat, lng);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "get_rti_authority": {
        const { roadType, state } = z.object({ 
          roadType: z.enum(["NH", "SH", "MDR", "rural", "unknown"]),
          state: z.string().nullable().optional() 
        }).parse(args);
        const results = await getRTIAuthority(roadType, state ?? null);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "route_complaint": {
        const { roadType, state } = z.object({ 
          roadType: z.enum(["NH", "SH", "MDR", "rural", "unknown"]),
          state: z.string().nullable().optional() 
        }).parse(args);
        const results = await getComplaintAuthority(roadType, state ?? null);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("VIGIA Infrastructure MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
