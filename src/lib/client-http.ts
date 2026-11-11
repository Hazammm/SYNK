// Browser-side fetch helper shared by client components.
export class HttpError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new HttpError(body.error ?? "Request failed. Please try again.", response.status);
  return body as T;
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
