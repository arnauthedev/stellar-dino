// Local preview of the built game only. In the demo the Stellar Dino app serves
// dist/ at /game/ and provides /api/game/* (global game over Supabase Realtime).
import { createServer } from "vite";

const server = await createServer({ server: { port: Number(process.env.PORT || 5174), host: "127.0.0.1" } });
await server.listen();
server.printUrls();
