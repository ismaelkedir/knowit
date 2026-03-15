import { getDatabasePath, getStorageScope } from "../../db/database.js";
import { MemoryService } from "../../services/memoryService.js";

export const initCommand = (): void => {
  const service = new MemoryService();
  service.init();
  console.log(
    `Initialized Knowit at ${getDatabasePath()} (storage scope: ${getStorageScope()}) with the default local source.`,
  );
};
