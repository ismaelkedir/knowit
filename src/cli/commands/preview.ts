import { startPreviewServer } from "../../server/previewServer.js";

interface PreviewCommandOptions {
  host?: string;
  open?: boolean;
  port?: string;
}

export const previewCommand = async (options: PreviewCommandOptions): Promise<void> => {
  const port = options.port ? Number(options.port) : undefined;
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) {
    throw new Error("--port must be an integer between 0 and 65535.");
  }

  const preview = await startPreviewServer({
    host: options.host,
    port,
    openBrowser: options.open !== false,
  });

  console.log(`Knowit preview running at ${preview.url}`);
};
