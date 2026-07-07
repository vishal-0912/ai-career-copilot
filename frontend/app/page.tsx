import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">AI Career Copilot</h1>
      <p className="max-w-md text-gray-600">
        Upload your resume, get an AI-generated career profile, and apply to
        jobs that actually match — with tailored, ATS-ready resumes and cover
        letters in one click.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800"
      >
        Get started
      </Link>
    </main>
  );
}
