import { supabase } from './supabase';

// Rule 11 guardrail: tailoredJson is stored verbatim — zero transformation.
// Callers must NOT clean, summarise, or reformat fields before passing here.
export async function saveApplication({ jobId, jobTitle, company, tailoredJson, matchScore }: {
  jobId: string;
  jobTitle: string;
  company: string;
  tailoredJson: unknown;
  matchScore: number;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not signed in');

  const { error } = await supabase.from('applications').upsert(
    {
      user_id:       session.user.id,
      job_id:        jobId,
      job_title:     jobTitle    || '',
      company_name:  company     || '',
      match_score:   matchScore  ?? 0,
      tailored_json: tailoredJson,
      status:        'tailored',
      updated_at:    new Date().toISOString(),
    },
    { onConflict: 'user_id, job_id' }
  );

  if (error) {
    // Attach the Supabase error code so callers can display it
    const msg = error.message || error.details || JSON.stringify(error);
    throw new Error(msg);
  }
}
