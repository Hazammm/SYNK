import { redirectToWorkspace } from "@/lib/workspace-redirect";

export function GET(request: Request) {
  return redirectToWorkspace(request, "/time");
}
