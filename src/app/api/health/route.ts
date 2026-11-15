// Health check for uptime monitors and Cloud Run: reports whether the app can reach MongoDB.
import mongoose from "mongoose";
import { connection } from "next/server";
import { connectDB } from "@/lib/db";

export async function GET() {
  await connection(); // always run at request time, never prerendered
  try {
    await connectDB();
    await mongoose.connection.db?.admin().ping();
    return Response.json({ status: "ok", database: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
