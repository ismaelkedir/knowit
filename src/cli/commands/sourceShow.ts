import { MemoryService } from "../../services/memoryService.js";

export const sourceShowCommand = (id: string): void => {
  const service = new MemoryService();
  service.init();
  const source = service.listSources().find((item) => item.id === id);

  if (!source) {
    console.log(`Source not found: ${id}`);
    return;
  }

  console.log(`ID: ${source.id}`);
  console.log(`Name: ${source.name}`);
  console.log(`Kind: ${source.kind}`);
  console.log(`Default: ${source.isDefault ? "yes" : "no"}`);
  console.log(`Updated: ${source.updatedAt}`);

  if (source.config.mode === "sqlite") {
    console.log("Mode: sqlite");
    return;
  }

  if (source.config.mode === "mcp") {
    console.log("Mode: mcp");
    console.log(`Command: ${source.config.command}`);
    console.log(`Args: ${source.config.args.join(" ") || "-"}`);
    console.log(`Transport: ${source.config.transport}`);
    console.log(`Mapped tools: store=${source.config.toolMap.store ?? "-"} search=${source.config.toolMap.search ?? "-"} resolve=${source.config.toolMap.resolve ?? "-"}`);
    return;
  }

  console.log(`Mode: route`);
  console.log(`Provider: ${source.config.provider}`);
  console.log(`Provider MCP: ${source.config.mcpServerName}`);
  console.log(`Setup: ${source.config.setupHint}`);
  console.log(`Read: ${source.config.readHint}`);
  console.log(`Write: ${source.config.writeHint}`);
};
