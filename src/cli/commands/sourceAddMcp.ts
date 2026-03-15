import { MemoryService } from "../../services/memoryService.js";

interface SourceAddMcpOptions {
  args?: string;
  cwd?: string;
  env?: string;
  storeTool?: string;
  searchTool?: string;
  resolveTool?: string;
  default?: boolean;
}

const parseCsv = (value?: string): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseEnv = (value?: string): Record<string, string> =>
  parseCsv(value).reduce<Record<string, string>>((accumulator, pair) => {
    const [key, ...rest] = pair.split("=");
    if (!key || rest.length === 0) {
      return accumulator;
    }

    accumulator[key] = rest.join("=");
    return accumulator;
  }, {});

export const sourceAddMcpCommand = (
  name: string,
  command: string,
  options: SourceAddMcpOptions,
): void => {
  const service = new MemoryService();
  service.init();
  const source = service.registerMcpSource({
    name,
    command,
    args: parseCsv(options.args),
    cwd: options.cwd,
    env: parseEnv(options.env),
    toolMap: {
      store: options.storeTool,
      search: options.searchTool,
      resolve: options.resolveTool,
    },
    isDefault: Boolean(options.default),
  });

  console.log(`Registered MCP source ${source.id} (${source.name})`);
};
