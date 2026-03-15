import { MemoryService } from "../../services/memoryService.js";

export const sourceListCommand = (): void => {
  const service = new MemoryService();
  service.init();
  const sources = service.listSources();

  for (const source of sources) {
    const detail =
      source.config.mode === "sqlite"
        ? "mode=sqlite"
        : source.config.mode === "mcp"
          ? `mode=mcp transport=${source.config.transport}`
          : `mode=route provider=${source.config.provider} mcp=${source.config.mcpServerName}`;
    console.log(
      `${source.id} | ${source.kind} | default=${source.isDefault ? "yes" : "no"} | ${source.name} | ${detail}`,
    );
  }
};
