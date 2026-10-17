import { redirect } from "next/navigation";

// Session checks and redirects intentionally wait for the current request.
export const instant = false;

export default function Home() {
  redirect("/chat");
}
