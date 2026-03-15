import { MemoryService } from "../../services/memoryService.js";

export const sourceListCommand = (): void => {
  const service = new MemoryService();
  service.init();
  const sources = service.listSources();

  for (const source of sources) {
    console.log(
      `${source.id} | ${source.kind} | default=${source.isDefault ? "yes" : "no"} | ${source.name}`,
    );
  }
};
