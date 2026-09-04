"use client";

// PUBLIC, standalone — reachable regardless of auth state (see middleware.ts,
// which rewrites every other page here once demo_expires_at has passed,
// per Postgres's own now()). No sidebar/app chrome, matching /join.

export default function DemoEndedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fff7ed] to-[#faf7f5] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
          <span className="text-3xl">⏳</span>
        </div>
        <h1 className="text-2xl font-extrabold text-[#1c1c1e] mb-2">Demo period has ended</h1>
        <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
          Thanks for trying GymFit. This demo environment&apos;s access window has closed —
          contact <strong>Fitness Mania</strong> to continue, extend the trial, or move to production.
        </p>
        <a
          href="mailto:demo@fitnessmania.co"
          className="inline-flex items-center justify-center w-full h-11 rounded-xl bg-teal-600 text-white font-semibold text-[15px] hover:bg-teal-700 transition"
        >
          Contact Fitness Mania
        </a>
      </div>
    </div>
  );
}
