export interface NarrativeInsight {
  status: 'aligned' | 'pivot_required';
  strategyTitle?: string;
  strategyMessage?: string;
}

type Domain = 'frontend' | 'backend' | 'mobile' | 'data' | 'devops' | 'product' | 'design' | 'fullstack';

const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  frontend: [
    'react', 'vue', 'angular', 'svelte', 'next.js', 'nextjs', 'nuxt', 'css', 'html',
    'tailwind', 'webpack', 'vite', 'ui developer', 'frontend developer', 'front-end developer',
    'web developer', 'javascript developer', 'typescript developer',
  ],
  backend: [
    'node.js', 'nodejs', 'express', 'django', 'flask', 'rails', 'spring',
    'golang', 'go lang', 'rust lang', 'java developer', 'c# developer', '.net developer',
    'php developer', 'backend developer', 'back-end developer', 'api developer',
    'server-side', 'microservices', 'rest api', 'graphql server',
  ],
  mobile: [
    'ios developer', 'android developer', 'swift developer', 'kotlin developer',
    'react native', 'flutter developer', 'mobile developer', 'mobile engineer', 'app developer',
  ],
  data: [
    'machine learning', 'ml engineer', 'data science', 'data engineer', 'data scientist',
    'pandas', 'numpy', 'tensorflow', 'pytorch', 'apache spark', 'airflow', 'data analyst',
    'bi developer', 'analytics engineer', 'etl developer', 'databricks', 'snowflake',
  ],
  devops: [
    'kubernetes', 'k8s', 'docker', 'ci/cd', 'terraform', 'ansible', 'helm',
    'devops engineer', 'sre', 'site reliability', 'infrastructure engineer',
    'platform engineer', 'cloud engineer', 'cloud infrastructure',
  ],
  product: [
    'product manager', 'product owner', 'product analyst', 'product strategy',
    'roadmap', 'stakeholder management', 'user research', 'product marketing',
  ],
  design: [
    'figma', 'sketch', 'ui design', 'ux design', 'user experience designer',
    'product designer', 'visual designer', 'ui/ux designer',
  ],
  fullstack: ['full-stack', 'fullstack', 'full stack'],
};

const PIVOT_STRATEGIES: Partial<Record<Domain, Partial<Record<Domain, { title: string; message: string }>>>> = {
  frontend: {
    backend: {
      title: 'Full-Stack Bridge',
      message: 'Lead with JavaScript depth and any Node.js, server-side API, or build-tooling work. Frame frontend performance optimization as evidence of systems thinking.',
    },
    data: {
      title: 'Data Visualization Bridge',
      message: 'Surface analytics dashboards, metrics pipelines, or charting work. JavaScript-to-data engineering has recognized tooling overlap.',
    },
    devops: {
      title: 'Platform Tooling Bridge',
      message: 'Highlight build tooling experience (Webpack, Vite, CI pipelines, deployment automation). Frame frontend architecture work as platform engineering.',
    },
    mobile: {
      title: 'Cross-Platform Bridge',
      message: 'Emphasize React Native, PWA, or responsive-web experience. JavaScript-to-mobile is a well-understood transition path.',
    },
    product: {
      title: 'Technical PM Bridge',
      message: 'Frame frontend delivery ownership, user-facing decision-making, and cross-functional coordination as product intuition backed by implementation depth.',
    },
  },
  backend: {
    frontend: {
      title: 'Full-Stack Bridge',
      message: 'Lead with any React, Vue, or UI integration work. Frame API design as work that directly shaped client-side behavior and user experience.',
    },
    data: {
      title: 'Data Engineering Bridge',
      message: 'Surface SQL, ETL pipeline, event-driven architecture, or analytics infrastructure built on backend experience.',
    },
    devops: {
      title: 'Platform Engineering Bridge',
      message: 'Emphasize containerization, deployment automation, infrastructure-as-code, and any SRE-adjacent backend operations.',
    },
    mobile: {
      title: 'Backend-for-Mobile Bridge',
      message: 'Frame API design, push notification infrastructure, and performance optimization as mobile-backend depth.',
    },
    product: {
      title: 'Technical PM Bridge',
      message: 'Emphasize technical scoping, API design decisions, and system design that directly shaped product direction.',
    },
  },
  mobile: {
    frontend: {
      title: 'Native-to-Web Bridge',
      message: 'Emphasize React Native, WebView integration, and any JavaScript/TypeScript work. Component architecture and state management translate directly.',
    },
    backend: {
      title: 'Mobile-to-Backend Bridge',
      message: 'Surface SDK integration, REST consumption, data persistence, and offline-sync work as server-side-adjacent experience.',
    },
  },
  data: {
    backend: {
      title: 'Data-to-Backend Bridge',
      message: 'Highlight Python API work, data service endpoints, streaming pipelines, and production infrastructure built around data products.',
    },
    frontend: {
      title: 'Analytics-to-Frontend Bridge',
      message: 'Lead with data visualization, dashboard development, and any React or TypeScript work embedded in analytical tooling.',
    },
    devops: {
      title: 'Data Platform Bridge',
      message: 'Emphasize pipeline orchestration, infrastructure automation, and any Spark, Airflow, or warehouse infrastructure built at scale.',
    },
  },
  devops: {
    backend: {
      title: 'Infrastructure-to-Engineering Bridge',
      message: 'Emphasize Go, Python, or scripting embedded in platform tooling. Frame reliability engineering as systems programming with production accountability.',
    },
    data: {
      title: 'Platform-to-Data Bridge',
      message: 'Surface data pipeline orchestration, observability infrastructure, and any Spark, Airflow, or data warehouse systems work.',
    },
  },
};

const GENERIC_PIVOT = {
  title: 'Transferable Skills Strategy',
  message: 'Emphasize technical depth, cross-functional delivery, and systematic problem-solving patterns that apply across both domains.',
};

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw)).length;
}

function detectDomains(text: string): Set<Domain> {
  const found = new Set<Domain>();
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as [Domain, string[]][]) {
    if (scoreText(text, keywords) > 0) found.add(domain);
  }
  return found;
}

function primaryDomain(text: string): Domain | null {
  let best: Domain | null = null;
  let bestScore = 0;
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as [Domain, string[]][]) {
    const score = scoreText(text, keywords);
    if (score > bestScore) { bestScore = score; best = domain; }
  }
  return best;
}

interface ResumeInput {
  most_recent_job_title?: string;
  all_job_titles?: string[];
  skills?: string[];
  summary?: string;
  experience?: Array<{ title?: string; description?: string }>;
}

function buildCandidateText(resume: ResumeInput): string {
  const parts: string[] = [];
  if (resume.most_recent_job_title) parts.push(resume.most_recent_job_title);
  if (resume.all_job_titles?.length) parts.push(...resume.all_job_titles);
  if (resume.skills?.length) parts.push(resume.skills.join(' '));
  if (resume.summary) parts.push(resume.summary);
  for (const job of resume.experience ?? []) {
    if (job.title) parts.push(job.title);
    if (job.description) parts.push(job.description);
  }
  return parts.join(' ');
}

export function evaluateNarrative(resume: ResumeInput, jdText: string): NarrativeInsight {
  const candidateText = buildCandidateText(resume);
  const candidateDomains = detectDomains(candidateText);

  // Fullstack candidates span both camps — always aligned
  if (candidateDomains.has('fullstack')) return { status: 'aligned' };

  const candidatePrimary = primaryDomain(candidateText);
  const jdDomains = detectDomains(jdText);

  // Can't determine either side — default to aligned (no false alarms)
  if (!candidatePrimary || jdDomains.size === 0) return { status: 'aligned' };

  // Aligned if JD is fullstack or candidate's primary domain appears in JD domains
  if (jdDomains.has('fullstack') || jdDomains.has(candidatePrimary)) return { status: 'aligned' };

  // Also aligned if any candidate domain overlaps JD
  for (const d of candidateDomains) {
    if (jdDomains.has(d)) return { status: 'aligned' };
  }

  // Pivot detected
  const jdPrimary = primaryDomain(jdText);
  const strategy = jdPrimary
    ? (PIVOT_STRATEGIES[candidatePrimary]?.[jdPrimary] ?? GENERIC_PIVOT)
    : GENERIC_PIVOT;

  return {
    status: 'pivot_required',
    strategyTitle: strategy.title,
    strategyMessage: strategy.message,
  };
}
