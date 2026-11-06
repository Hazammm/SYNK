import { loadEnvConfig } from "@next/env";
import { createServer } from "node:http";
import { resolveClientIp } from "./src/lib/client-ip";

const dev = process.argv.includes("--dev");
// Set before dynamically importing Next.js or database modules.
Object.assign(process.env, { NODE_ENV: dev ? "development" : "production" });
loadEnvConfig(process.cwd(), dev);

async function main() {
  // Without an email provider, password reset can't work in production.
  for (const name of ["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL", ...(dev ? [] : ["RESEND_API_KEY", "EMAIL_FROM"])]) {
    if (!process.env[name]) throw new Error(`Set ${name} in .env before starting Synk.`);
  }
  if (process.env.NEXTAUTH_SECRET!.length < 32) throw new Error("NEXTAUTH_SECRET must contain at least 32 characters.");
  const trustedProxyHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 0) throw new Error("TRUSTED_PROXY_HOPS must be a non-negative integer.");
  const { default: next } = await import("next");
  const port = Number(process.env.PORT ?? 3000);
  const hostname = process.env.HOSTNAME_BIND ?? "0.0.0.0";
  const app = next({ dev, hostname, port });
  await app.prepare();
  const [{ attachRealtime }, { db }] = await Promise.all([import("./src/server/socket"), import("./src/lib/db")]);
  const handler = app.getRequestHandler();
  const server = createServer((req, res) => {
    // Overwrite rather than trust a header supplied by a remote client.
    req.headers["x-synk-client-ip"] = resolveClientIp(req.socket.remoteAddress, req.headers["x-forwarded-for"], trustedProxyHops);
    void handler(req, res);
  });
  const io = attachRealtime(server);
  server.listen(port, hostname, () => console.log(`Synk ready at ${process.env.NEXTAUTH_URL}`));
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    io.close();
    await app.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
main().catch(error => { console.error(error); process.exit(1); });
