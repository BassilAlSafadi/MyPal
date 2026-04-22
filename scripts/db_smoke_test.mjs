import dotenv from "dotenv";
import { Client } from "pg";
import { MongoClient } from "mongodb";
import Redis from "ioredis";

const envPath = process.argv[2] || "env";
dotenv.config({ path: envPath });

async function testPostgres() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DIRECT_URL ||
    process.env.DIRECT_URL;
  if (!connectionString) {
    return { ok: false, message: "DATABASE_URL is missing" };
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const r = await client.query("select 1 as ok");
    return { ok: r?.rows?.[0]?.ok === 1, message: "connected and queried" };
  } catch (e) {
    return { ok: false, message: e?.message ?? String(e) };
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

async function testMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) return { ok: false, message: "MONGO_URI is missing" };
  if (uri.includes("<username>") || uri.includes("<password>")) {
    return { ok: false, message: "MONGO_URI still contains placeholders" };
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    return { ok: true, message: "connected and pinged" };
  } catch (e) {
    return { ok: false, message: e?.message ?? String(e) };
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}

async function testRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return { ok: false, message: "REDIS_URL is missing" };
  if (url.includes("<password>") || url.includes("<endpoint>")) {
    return { ok: false, message: "REDIS_URL still contains placeholders" };
  }

  const redis = new Redis(url, {
    connectTimeout: 8000,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });

  try {
    const pong = await redis.ping();
    return { ok: pong === "PONG", message: "connected and pinged" };
  } catch (e) {
    return { ok: false, message: e?.message ?? String(e) };
  } finally {
    try {
      redis.disconnect();
    } catch {
      // ignore
    }
  }
}

const results = {
  postgres: await testPostgres(),
  mongo: await testMongo(),
  redis: await testRedis(),
};

// Intentionally do not print any connection strings/secrets.
console.log(JSON.stringify(results, null, 2));

