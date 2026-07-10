export type CandidateProfile = {
  summary: string;
  skills: string[];
  job_titles: string[];
  keywords: string[];
  years_experience: number | null;
};

export default function ProfileCard({ profile }: { profile: CandidateProfile }) {
  return (
    <div className="mt-7 animate-fade-in rounded-lg border border-[rgba(78,34,15,0.18)] bg-[#FBF7EC] p-5">
      <h2 className="mb-3.5 font-serif text-xl text-[#4E220F]">Your AI Career Profile</h2>
      <p className="mb-4 text-[15px] leading-[1.65] text-[#5C4A34]">{profile.summary}</p>

      {profile.years_experience != null && (
        <div className="mb-6 inline-block rounded-md bg-[#E9E2C9] px-3 py-1.5 font-mono text-[11px] tracking-[0.06em] text-[#4E220F]">
          {profile.years_experience} YEARS EXPERIENCE
        </div>
      )}

      <div className="mb-5">
        <h3 className="mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#8A7A5E]">
          Target roles
        </h3>
        <div className="flex flex-wrap gap-2">
          {profile.job_titles.map((title) => (
            <span
              key={title}
              className="rounded-full bg-[#F0E1CC] px-3.5 py-1.5 text-[13px] text-[#7C4E29]"
            >
              {title}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <h3 className="mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#8A7A5E]">
          Skills
        </h3>
        <div className="flex flex-wrap gap-2">
          {profile.skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-[#E4E8D8] px-3.5 py-1.5 text-[13px] text-[#54603F]"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#8A7A5E]">
          ATS keywords
        </h3>
        <div className="flex flex-wrap gap-2">
          {profile.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-md border border-[rgba(78,34,15,0.3)] px-3 py-[5px] font-mono text-xs text-[#4E220F]"
            >
              {kw}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
