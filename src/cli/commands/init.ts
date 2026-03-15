import { getDatabasePath } from "../../db/database.js";
import { MemoryService } from "../../services/memoryService.js";

export const initCommand = (): void => {
  const service = new MemoryService();
  service.init();
  console.log(`Initialized Knowit at ${getDatabasePath()} with the default local source.`);
};
