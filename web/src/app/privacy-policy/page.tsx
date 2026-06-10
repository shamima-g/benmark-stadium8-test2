import Link from 'next/link';

/**
 * Privacy Policy (/privacy-policy).
 *
 * POPIA (project-brief §5) requires a visible privacy-policy link on every
 * data-collection form (the login screen at minimum). This page is the target
 * of that link. It states the purpose of personal-data collection (email, name)
 * at the point of use, per POPIA's purpose-limitation and notification duties.
 *
 * The full legal policy text is owned by the business; this surface provides the
 * required, reachable destination and a plain-language summary of what is
 * collected and why. Replace the summary copy with the organisation's approved
 * policy text before production.
 */
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-foreground">Privacy Policy</h1>

      <section className="mt-6 space-y-4 text-sm text-muted-foreground">
        <p>
          This system is operated by a financial-services back office and is
          subject to the Protection of Personal Information Act (POPIA).
        </p>
        <p>
          <strong className="text-foreground">What we collect.</strong> When you
          sign in we process your email address and name to authenticate you and
          to attribute the transaction actions you perform (approvals,
          rejections, and uploads) for audit purposes.
        </p>
        <p>
          <strong className="text-foreground">Why we collect it.</strong> Your
          personal information is used solely to operate the Transaction Import
          &amp; Approval System and to maintain an auditable record of actions.
          It is not shared with third parties for marketing.
        </p>
        <p>
          <strong className="text-foreground">Your rights.</strong> You may
          request access to, correction of, or deletion of your personal
          information. Contact your system administrator to exercise these
          rights.
        </p>
      </section>

      <p className="mt-8 text-sm">
        <Link
          href="/login"
          className="text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
