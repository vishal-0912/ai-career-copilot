import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[rgba(78,34,15,0.15)] px-5 py-[18px] sm:px-8 lg:px-12 lg:py-[22px]">
        <div className="font-serif text-lg font-semibold tracking-[0.01em] text-[#4E220F] sm:text-xl">
          Career Copilot
        </div>
        <div className="flex items-center gap-3 sm:gap-7">
          <Link href="/login" className="text-sm text-[#4E220F] no-underline">
            Log in
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-[#9D6638] px-4 py-2.5 text-sm font-semibold text-[#F7F1DE] transition-colors hover:bg-[#7C4E29] sm:px-6 sm:py-[11px]"
          >
            Get started
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-[720px] flex-1 flex-col items-center px-5 pb-12 pt-16 text-center sm:px-6 sm:pb-16 sm:pt-20 lg:pb-[72px] lg:pt-[104px]">
        <div className="mb-[18px] font-mono text-xs uppercase tracking-[0.16em] text-[#9D6638] sm:mb-[22px]">
          AI-powered job search
        </div>
        <h1 className="mb-5 font-serif text-[34px] font-semibold leading-[1.12] text-[#4E220F] sm:mb-6 sm:text-[44px] sm:leading-[1.1] lg:text-[58px] lg:leading-[1.08]">
          Apply smarter,
          <br />
          not harder.
        </h1>
        <p className="mb-8 max-w-[560px] text-[15px] leading-[1.6] text-[#5C4A34] sm:mb-10 sm:text-[17px] sm:leading-[1.65]">
          Upload your resume, get an AI career profile, and browse a job feed matched to it by
          semantic similarity &mdash; then download tailored, ATS-scored resumes and cover letters
          in one click.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
          <Link
            href="/login"
            className="rounded-md bg-[#9D6638] px-8 py-[15px] text-[15px] font-semibold text-[#F7F1DE] transition-colors hover:bg-[#7C4E29]"
          >
            Get started free
          </Link>
          <span className="font-mono text-xs text-[#8A7A5E]">no credit card &middot; 2 min setup</span>
        </div>
      </div>

      <div className="grid grid-cols-1 border-y border-[rgba(78,34,15,0.15)] sm:grid-cols-3">
        {[
          {
            n: '01',
            title: 'AI career profile',
            body: "Claude reads your resume and extracts a structured profile — summary, skills, target roles, ATS keywords.",
          },
          {
            n: '02',
            title: 'Matched job feed',
            body: 'Every listing is ranked against your profile by embedding similarity, or import any posting by URL.',
          },
          {
            n: '03',
            title: 'Tailored documents',
            body: 'Resumes and cover letters rewritten per listing, rescored against a deterministic ATS target until they clear it.',
          },
        ].map((step, i) => (
          <div
            key={step.n}
            className={`p-7 sm:p-11 sm:px-10 ${i < 2 ? 'sm:border-r' : ''} border-b border-[rgba(78,34,15,0.15)] sm:border-b-0 border-[rgba(78,34,15,0.15)]`}
          >
            <div className="mb-3.5 font-mono text-xs text-[#9D6638]">{step.n}</div>
            <h3 className="mb-2 font-serif text-[19px] text-[#4E220F]">{step.title}</h3>
            <p className="text-sm leading-[1.6] text-[#5C4A34]">{step.body}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-5 px-5 py-10 sm:px-12 sm:py-14">
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.1em] text-[#8A7A5E]">
          Track every application
        </p>
        <div className="flex items-center">
          <div className="h-4 w-4 shrink-0 rounded-full bg-[#5E7F4C]" />
          <div className="h-0.5 w-5 shrink-0 bg-[#5E7F4C] sm:w-7" />
          <div className="h-4 w-4 shrink-0 rounded-full bg-[#9D6638]" />
          <div className="h-0.5 w-5 shrink-0 bg-[rgba(78,34,15,0.15)] sm:w-7" />
          <div className="h-4 w-4 shrink-0 rounded-full bg-[#E4D8C3]" />
          <div className="h-0.5 w-5 shrink-0 bg-[rgba(78,34,15,0.15)] sm:w-7" />
          <div className="h-4 w-4 shrink-0 rounded-full bg-[#E4D8C3]" />
        </div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 font-mono text-[11px] uppercase text-[#8A7A5E] sm:gap-x-9">
          <span>Saved</span>
          <span>Applied</span>
          <span>Interviewing</span>
          <span>Offer</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-[rgba(78,34,15,0.15)] px-5 py-7 text-center sm:flex-row sm:px-12 sm:text-left">
        <div className="font-mono text-xs text-[#8A7A5E]">&copy; 2026 Career Copilot</div>
        <div className="text-[13px] text-[#8A7A5E]">
          Built for job seekers who&rsquo;d rather build things than fill out forms.
        </div>
      </div>
    </div>
  );
}
