"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Building2, Eye, EyeOff, FolderKanban, Mail, UserRound, X } from "lucide-react";
import { Button, Input } from "@/components/Primitives";
import { ThemeBar } from "@/components/SynkShell";
import { emailSchema } from "@/lib/validation";
import { messageOf, request } from "@/features/chat/client";
import styles from "@/components/Auth.module.css";

const steps = ["Admin account", "Workspace", "Invite teammates"];

function passwordStrength(password: string) {
  if (!password) return 0;
  return [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
}

interface Props {
  /** Set when the user came from Google OAuth and has a pending cookie. */
  googleMode?: boolean;
  googleName?: string;
  googleEmail?: string;
}

export default function CreateWorkspaceWizard({ googleMode, googleName = "", googleEmail = "" }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [adminName, setAdminName] = useState(googleName);
  const [email, setEmail] = useState(googleEmail);
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [projectName, setProjectName] = useState("My first project");
  const [emailInput, setEmailInput] = useState("");
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function addEmail() {
    const parsed = emailSchema.safeParse(emailInput);
    if (!parsed.success) {
      setError("Enter a valid teammate email address.");
      return;
    }
    if (parsed.data === email.trim().toLowerCase()) {
      setError("Use a different email address for each teammate.");
      return;
    }
    if (inviteEmails.includes(parsed.data)) {
      setError("That email has already been added.");
      return;
    }
    if (inviteEmails.length >= 50) {
      setError("You can invite up to 50 teammates at a time.");
      return;
    }
    setInviteEmails(current => [...current, parsed.data]);
    setEmailInput("");
    setError("");
  }

  function continueStep() {
    if (!formRef.current?.reportValidity()) return;
    setError("");
    setStep(current => Math.min(current + 1, steps.length - 1));
  }

  async function createWorkspace(skipInvites: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Google mode: no password — the server reads the Google profile from the httpOnly cookie.
      const body = googleMode
        ? { workspaceName, projectName, inviteEmails: skipInvites ? [] : inviteEmails }
        : { adminName, email, password, workspaceName, projectName, inviteEmails: skipInvites ? [] : inviteEmails };

      const result = await request<{
        workspace: { id: string; name: string };
        emailDelivery?: { failedEmails?: string[] };
        welcomeEmailFailed?: boolean;
      }>("/api/workspaces", { method: "POST", body: JSON.stringify(body) });
      const failedInviteEmails = result.emailDelivery?.failedEmails ?? [];
      const welcomeEmailFailed = result.welcomeEmailFailed ?? false;

      if (googleMode) {
        // The workspace and Account row are created; now sign the user in via Google
        // so the JWT is established.  callbackUrl sends them straight to the new workspace.
        const failures = new URLSearchParams();
        if (failedInviteEmails.length) {
          failures.set("section", "Members");
          failures.set("inviteDelivery", "failed");
        }
        if (welcomeEmailFailed) failures.set("welcomeEmail", "failed");
        const query = failures.toString();
        const destination = query
          ? `/w/${result.workspace.id}/settings?${query}`
          : `/w/${result.workspace.id}/overview`;
        await signIn("google", { callbackUrl: destination, redirect: true });
        return;
      }

      const login = await signIn("credentials", { email, password, redirect: false });
      if (!login?.ok || login.error) {
        routerToLogin();
        return;
      }
      const failures = new URLSearchParams();
      if (failedInviteEmails.length) {
        failures.set("section", "Members");
        failures.set("inviteDelivery", "failed");
      }
      if (welcomeEmailFailed) failures.set("welcomeEmail", "failed");
      const query = failures.toString();
      const destination = query
        ? `/w/${result.workspace.id}/settings?${query}`
        : `/w/${result.workspace.id}/overview`;
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  function routerToLogin() {
    router.replace("/login");
    router.refresh();
  }

  const strength = passwordStrength(password);

  return <main className={styles.authPage}>
    <Link href="/" className={styles.wordmark}><span className={styles.brandMark}>s</span> synk</Link>
    <section className={`${styles.authCard} ${styles.wizardCard}`}>
      <div className={styles.logo}>s</div>
      <h1>Create your workspace</h1>
      <p className={styles.tagline}>Set up your team&apos;s home on Synk.</p>
      <ol className={styles.wizardSteps} aria-label="Workspace setup progress">
        {steps.map((label, index) => <li className={index === step ? styles.stepActive : index < step ? styles.stepComplete : ""} key={label}>
          <span>{index + 1}</span><small>{label}</small>
        </li>)}
      </ol>
      <form ref={formRef} className={styles.form} onSubmit={event => {
        event.preventDefault();
        if (step < 2) continueStep();
        else void createWorkspace(false);
      }}>
        {step === 0 && <div className={styles.wizardFields}>
          <label className={styles.field}><span>Full name</span><div className={styles.inputWrap}><UserRound size={17} /><Input autoComplete="name" placeholder="Your name" required maxLength={80} value={adminName} onChange={event => setAdminName(event.target.value)} /></div></label>
          {googleMode
            ? <label className={styles.field}>
                <span>Email</span>
                <div className={`${styles.inputWrap} ${styles.inputReadOnly}`}>
                  <Mail size={17} />
                  <Input type="email" autoComplete="off" value={googleEmail} readOnly tabIndex={-1} />
                </div>
                <span className={styles.fieldHint}>Signed in with Google — email cannot be changed.</span>
              </label>
            : <label className={styles.field}><span>Work email</span><div className={styles.inputWrap}><Mail size={17} /><Input type="email" autoComplete="email" placeholder="you@company.com" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></div></label>
          }
          {!googleMode && <>
            <label className={styles.field}><span>Password</span><div className={styles.inputWrap}><Input type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters" required minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /><button className={styles.eye} onClick={() => setShowPassword(value => !value)} type="button" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            <div className={styles.strength} aria-label={`Password strength: ${strength} of 4`}>
              <span>Password strength</span><div className={styles.meter}>{[0, 1, 2, 3].map(index => <i className={index < strength ? styles.filled : ""} key={index} />)}</div>
            </div>
          </>}
        </div>}
        {step === 1 && <div className={styles.wizardFields}>
          <label className={styles.field}><span>Workspace name</span><div className={styles.inputWrap}><Building2 size={17} /><Input placeholder="Your team name" required maxLength={80} value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} /></div></label>
          <label className={styles.field}><span>First project</span><div className={styles.inputWrap}><FolderKanban size={17} /><Input required maxLength={80} value={projectName} onChange={event => setProjectName(event.target.value)} /></div></label>
        </div>}
        {step === 2 && <div className={styles.wizardFields}>
          <p className={styles.inviteHint}>Invite teammates now, or skip and invite them later from Settings.</p>
          <div className={styles.emailRow}>
            <label className={styles.field}><span>Teammate email</span><div className={styles.inputWrap}><Mail size={17} /><Input type="email" placeholder="teammate@company.com" value={emailInput} onChange={event => setEmailInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addEmail(); } }} /></div></label>
            <Button type="button" onClick={addEmail}>Add</Button>
          </div>
          {inviteEmails.length > 0 && <ul className={styles.emailChips} aria-label="Teammates to invite">
            {inviteEmails.map(address => <li className={styles.emailChip} key={address}><span>{address}</span><button type="button" aria-label={`Remove ${address}`} onClick={() => setInviteEmails(current => current.filter(item => item !== address))}><X size={14} /></button></li>)}
          </ul>}
        </div>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.wizardActions}>
          {step === 0 ? <Link className={styles.backLink} href="/login">Back to sign in</Link> : <Button type="button" onClick={() => { setError(""); setStep(current => current - 1); }}>Back</Button>}
          {step < 2
            ? <Button variant="primary" type="button" className={styles.wizardPrimary} onClick={continueStep}>Continue</Button>
            : <><Button type="button" disabled={busy} onClick={() => void createWorkspace(true)}>Skip for now</Button><Button variant="primary" type="submit" className={styles.wizardPrimary} disabled={busy}>{busy ? "Creating…" : "Create workspace"}</Button></>}
        </div>
      </form>
      <p className={styles.switch}>Already have an account? <Link href="/login">Sign in</Link></p>
    </section>
    <ThemeBar />
  </main>;
}
