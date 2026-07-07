export type CandidateProfile = {
  summary: string;
  skills: string[];
  job_titles: string[];
  keywords: string[];
  years_experience: number | null;
};

export default function ProfileCard({ profile }: { profile: CandidateProfile }) {
  return (
    <div className="space-y-4 rounded-xl border p-6">
      <h2 className="text-lg font-semibold">Your AI Career Profile</h2>
      <p className="text-gray-700">{profile.summary}</p>

      {profile.years_experience != null && (
        <p className="text-sm text-gray-500">
          ~{profile.years_experience} years of experience
        </p>
      )}

      <div>
        <h3 className="mb-1 text-sm font-medium text-gray-500">Target roles</h3>
        <div className="flex flex-wrap gap-2">
          {profile.job_titles.map((title) => (
            <span key={title} className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
              {title}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium text-gray-500">Skills</h3>
        <div className="flex flex-wrap gap-2">
          {profile.skills.map((skill) => (
            <span key={skill} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium text-gray-500">Keywords</h3>
        <div className="flex flex-wrap gap-2">
          {profile.keywords.map((kw) => (
            <span key={kw} className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700">
              {kw}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
