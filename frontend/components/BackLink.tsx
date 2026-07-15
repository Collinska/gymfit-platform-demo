import Link from "next/link";

/** Subtle warm back-link used across Sales/Reports/POS navigation. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-teal-600 transition-colors"
    >
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}
