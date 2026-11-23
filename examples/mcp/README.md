# Rails Desk MCP examples

This folder contains a runnable custom MCP client and setup notes for Claude Desktop and Cursor.

## Prerequisites

- Node.js 20+
- A Rails Desk with an agent key from **Set your rails → Connect your agent**
- The MCP server downloaded from [the live app](https://rails-desk.vercel.app/rails-desk-mcp.mjs)

Keep the agent key private. It can submit proposals and read their status, but cannot approve payments or change policy.

## Claude Desktop

Download `rails-desk-mcp.mjs` and save it somewhere stable on your computer. Add this server to Claude Desktop's MCP configuration, replacing the paths and key:

```json
{
  "mcpServers": {
    "rails-desk": {
      "command": "node",
      "args": ["/absolute/path/to/rails-desk-mcp.mjs"],
      "env": {
        "RAILS_DESK_URL": "https://rails-desk.vercel.app",
        "RAILS_DESK_AGENT_KEY": "rd_agent_REPLACE_ME"
      }
    }
  }
}
```

Restart Claude Desktop. Ask Claude to propose a 15-credit payment to Jordan for a test invoice. With the default policy, that amount should require owner review. Claude can then call `get_proposal` to read the result after you approve or refuse it in Rails Desk.

## Cursor

Create or update `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "rails-desk": {
      "command": "node",
      "args": ["/absolute/path/to/rails-desk-mcp.mjs"],
      "env": {
        "RAILS_DESK_URL": "https://rails-desk.vercel.app",
        "RAILS_DESK_AGENT_KEY": "rd_agent_REPLACE_ME"
      }
    }
  }
}
```

Restart Cursor or reload its MCP servers, then use the same propose → owner review → status read sequence.

## Custom Node.js agent

Run the included client:

```bash
RAILS_DESK_URL=https://rails-desk.vercel.app \
RAILS_DESK_AGENT_KEY=rd_agent_REPLACE_ME \
node examples/mcp/agent.mjs
```

It starts the stdio MCP server as a child process, initializes the protocol, lists available tools, proposes a 15-credit payment, and polls `get_proposal` for up to two minutes while the owner reviews it in the Rails Desk UI.

The example intentionally does not approve a proposal. Approval remains an owner-only action.

## Important status semantics

- `approved`: the policy engine approved the proposal, not a blockchain payment.
- `needs_review`: the owner must approve or refuse it.
- `blocked`: a policy rejected it.
- Owner approval currently records a decision. It does not itself execute a transfer.

The current MCP integration is a local stdio server that calls the Rails Desk HTTP API. It is not a hosted remote MCP endpoint.
