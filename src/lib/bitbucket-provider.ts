import type { OAuthConfig } from "next-auth/providers/oauth";
type Profile = { uuid: string; display_name: string; email: string; links?: { avatar?: { href?: string } } };

// NextAuth v4 has no built-in Bitbucket provider. The consumer needs account + email scopes.
export function Bitbucket(options: { clientId: string; clientSecret: string }): OAuthConfig<Profile> {
  return {
    id: "bitbucket", name: "Bitbucket", type: "oauth", ...options,
    checks: ["state"],
    authorization: { url: "https://bitbucket.org/site/oauth2/authorize", params: { response_type: "code" } },
    token: "https://bitbucket.org/site/oauth2/access_token",
    userinfo: {
      url: "https://api.bitbucket.org/2.0/user",
      async request({ tokens }) {
        const headers = { Authorization: `Bearer ${tokens.access_token}` };
        const [userResponse, emailResponse] = await Promise.all([
          fetch("https://api.bitbucket.org/2.0/user", { headers, signal: AbortSignal.timeout(10_000) }),
          fetch("https://api.bitbucket.org/2.0/user/emails?pagelen=100", { headers, signal: AbortSignal.timeout(10_000) }),
        ]);
        if (!userResponse.ok || !emailResponse.ok) throw new Error("Unable to read Bitbucket account.");
        const user = await userResponse.json() as Omit<Profile, "email">;
        const emails = await emailResponse.json() as { values: { email: string; is_primary: boolean; is_confirmed: boolean }[] };
        const email = emails.values.find(item => item.is_primary && item.is_confirmed)?.email;
        if (!user.uuid || !email) throw new Error("A confirmed primary Bitbucket email is required.");
        return { ...user, email: email.toLowerCase() };
      },
    },
    profile(profile) { return { id: profile.uuid, name: profile.display_name, email: profile.email, image: profile.links?.avatar?.href ?? null }; },
  };
}
