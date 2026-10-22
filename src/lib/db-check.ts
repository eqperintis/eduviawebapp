import "server-only";
import mariadb from "mariadb";

/**
 * Why the database can't be reached, in words, for the log. When Prisma's
 * pool can't open a connection it only says "pool failed to retrieve a
 * connection" (code 45028); one direct connection shows the real reason,
 * e.g. "Access denied for user". Never logs the password.
 */
export async function explainDatabaseFailure(): Promise<string> {
  const raw = process.env.DATABASE_URL;
  if (!raw) return "DATABASE_URL is not set.";

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "DATABASE_URL isn't a valid address. It should look like mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE, with any symbols in the password URL-encoded.";
  }
  const user = decodeURIComponent(url.username);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const port = Number(url.port || 3306);
  const where = `${user}@${url.hostname}:${port}/${database}`;
  const hints: string[] = [];
  if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") hints.push(`it starts with "${url.protocol}//" instead of "mysql://"`);
  if (url.hostname === "localhost") hints.push("use 127.0.0.1 instead of localhost");
  if (!url.password) hints.push("there's no password in it");
  if (!database) hints.push("the database name is missing after the last /");

  try {
    const connection = await mariadb.createConnection({
      host: url.hostname,
      port,
      user,
      password: decodeURIComponent(url.password),
      database,
      connectTimeout: 10_000,
    });
    await connection.end();
    return `A direct connection to ${where} works, so the settings are right; the connection pool itself failed.`;
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return `Can't connect to ${where}: ${message}${hints.length ? ` (also: ${hints.join("; ")})` : ""}`;
  }
}
