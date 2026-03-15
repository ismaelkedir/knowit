import { MemoryService } from "../../services/memoryService.js";

interface SourceConnectOptions {
  mcpServerName?: string;
  default?: boolean;
}

export const sourceConnectCommand = (
  provider: "local" | "notion",
  options: SourceConnectOptions,
): void => {
  const service = new MemoryService();
  service.init();
  const source = service.connectKnownSource({
    provider,
    mcpServerName: options.mcpServerName,
    isDefault: Boolean(options.default),
  });

  console.log(`Connected source ${source.id} (${source.name})`);

  if (source.config.mode === "route") {
    console.log(`Provider MCP: ${source.config.mcpServerName}`);
    console.log(`Setup: ${source.config.setupHint}`);
    console.log(`Read: ${source.config.readHint}`);
    console.log(`Write: ${source.config.writeHint}`);
  }
};
