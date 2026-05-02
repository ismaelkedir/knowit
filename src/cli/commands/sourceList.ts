import { MemoryService } from "../../services/memoryService.js";

export const sourceListCommand = (): void => {
  const service = new MemoryService();
  service.init();
  const sources = service.listSources();

  for (const source of sources) {
    const detail =
      source.config.mode === "jsonl" || source.config.mode === "sqlite"
        ? `mode=${source.config.mode}`
        : source.config.mode === "mcp"
          ? `mode=mcp transport=${source.config.transport}`
          : source.config.mode === "route"
            ? `mode=route provider=${source.config.provider} mcp=${source.config.mcpServerName}`
            : `mode=cloud api=${source.config.apiUrl}`;
    console.log(
      `${source.id} | ${source.kind} | default=${source.isDefault ? "yes" : "no"} | ${source.name} | ${detail}`,
    );
  }
};
