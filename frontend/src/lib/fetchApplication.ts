import { supabase } from './supabase';

// Loads a previously committed tailored snapshot from the DB.
// Strictly a DB read — never triggers AI. Caller must not use this
// result to seed a fresh tailoring call.
export async function fetchApplication(jobId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from('applications')
    .select('tailored_json, company_name, match_score')
    .eq('user_id', session.user.id)
    .eq('job_id', jobId)
    .maybeSingle();

  if (error) throw new Error(error.message || error.details || JSON.stringify(error));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    tailoredJson: row.tailored_json,
    matchScore:   row.match_score  ?? null,
    companyName:  row.company_name ?? null,
  };
}
