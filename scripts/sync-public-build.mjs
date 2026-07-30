import { cp, mkdir } from "node:fs/promises";

const publicDirectory = new URL("../public/", import.meta.url);
const clientDirectory = new URL("../dist/client/", import.meta.url);

await mkdir(clientDirectory, { recursive: true });
await cp(publicDirectory, clientDirectory, {
  recursive: true,
  force: true,
  preserveTimestamps: true,
});

console.log("Synchronized public assets into dist/client.");
