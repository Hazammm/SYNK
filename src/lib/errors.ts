import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return Response.json({ error: "That record already exists." }, { status: 409 });
  }
  console.error("Request failed", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function api(action: () => Promise<unknown>, status = 200) {
  try { return Response.json(await action(), { status, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
