// Drive terrace-mcp like Claude would: node test/client.mjs <tool> '<json args>' (TERRACE_HOME picks the account)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [tool, args = "{}"] = process.argv.slice(2);
const client = new Client({ name: "terrace-test", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: [new URL("../dist/index.js", import.meta.url).pathname], env: { ...process.env }, stderr: "ignore" }));
if (!tool) {
  for (const t of (await client.listTools()).tools) console.log(`${t.name}: ${t.title}`);
} else {
  const r = await client.callTool({ name: tool, arguments: JSON.parse(args) });
  console.log(r.isError ? "ERROR: " : "", r.content.map((c) => c.text).join("\n"));
}
await client.close();
