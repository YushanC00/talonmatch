import { useState, useEffect, useRef, useCallback } from 'react';
import type { Job, ParsedResume, TailoredResume } from '../types';
import {
  filterAutoQualify,
  shouldRunNow,
  loadAutosendSettings,
  saveAutosendSettings,
  getLastRunAt,
  markRunNow,
  type AutosendSettings,
} from '../utils/autosend';
import { getTelemetry } from '../utils/telemetry';
import { buildPdfBlob } from '../lib/pdfBuilder';

export interface QueuedApplication {
  job: Job;
  tailoredResume: TailoredResume;
  pdfUrl: string;
}

export interface UseAutosendResult {
  settings: AutosendSettings;
  updateSettings: (patch: Partial<AutosendSettings>) => void;
  queued: QueuedApplication[];
  isProcessing: boolean;
  processedCount: number;
  sendAll: () => Promise<void>;
  dismiss: (url: string) => void;
}

async function tailorJob(job: Job, resume: ParsedResume): Promise<TailoredResume | null> {
  const allEntries = getTelemetry();
  const preferences = [
    ...allEntries.filter(e => e.decision === 'accepted' && e.original !== e.tailored).slice(-5),
    ...allEntries.filter(e => e.decision === 'rejected' && e.original !== e.tailored).slice(-3),
  ].map(({ decision, original, tailored }) => ({ decision, original, tailored }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch('/api/tailor-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parsed_resume: resume,
        job_description: job.description || `${job.job_title} at ${job.company}. Requirements: ${(job.requirements_array || []).join(', ')}`,
        preferences: preferences.length ? preferences : undefined,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuf = '';
    let tailored: TailoredResume = { _version: 4, sections: [] };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuf += decoder.decode(value, { stream: true });
      const parts = sseBuf.split('\n\n');
      sseBuf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }
        if (event.type === 'section') {
          const existing = tailored.sections;
          const idx = existing.findIndex(s => s.title === event.section.title);
          tailored = {
            _version: 4,
            sections: idx >= 0
              ? existing.map((s, i) => (i === idx ? event.section : s))
              : [...existing, event.section],
          };
        } else if (event.type === 'error') {
          return null;
        }
      }
    }

    return tailored.sections.length > 0 ? tailored : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function sendEmailNotification(userEmail: string, entries: QueuedApplication[]): Promise<void> {
  const applications = entries.map(e => ({
    jobTitle:   e.job.job_title,
    company:    e.job.company,
    matchScore: e.job.match_score,
    applyUrl:   e.job.url ?? '',
  }));
  await fetch('/api/notify', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ to: userEmail, applications }),
  });
}

export function useAutosend(
  jobs: Job[],
  appliedUrls: Set<string>,
  parsedResume: ParsedResume | null,
  onApplied: (job: Job) => void,
  userEmail?: string,
): UseAutosendResult {
  const [settings, setSettings] = useState<AutosendSettings>(loadAutosendSettings);
  const [queued, setQueued] = useState<QueuedApplication[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const processingRef = useRef(false);

  const updateSettings = useCallback((patch: Partial<AutosendSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveAutosendSettings(next);
      return next;
    });
  }, []);

  const runBatch = useCallback(async () => {
    if (!parsedResume || processingRef.current) return;
    const qualifying = filterAutoQualify(jobs, appliedUrls, settings.scoreThreshold);
    if (qualifying.length === 0) return;

    processingRef.current = true;
    setIsProcessing(true);
    markRunNow();

    const newEntries: QueuedApplication[] = [];
    for (const job of qualifying) {
      const tailoredResume = await tailorJob(job, parsedResume);
      if (!tailoredResume) continue;

      let pdfUrl = '';
      try {
        const blob = await buildPdfBlob(tailoredResume.sections, parsedResume);
        pdfUrl = URL.createObjectURL(blob);
      } catch { /* pdf gen failure — still queue the application */ }

      newEntries.push({ job, tailoredResume, pdfUrl });
      setProcessedCount(c => c + 1);
    }

    setQueued(prev => {
      const existingUrls = new Set(prev.map(q => q.job.url));
      return [...prev, ...newEntries.filter(e => !existingUrls.has(e.job.url))];
    });

    if (newEntries.length > 0 && userEmail) {
      void sendEmailNotification(userEmail, newEntries);
    }

    processingRef.current = false;
    setIsProcessing(false);
  }, [jobs, appliedUrls, parsedResume, settings.scoreThreshold, userEmail]);

  // Interval tick — polls every minute, runs batch when interval elapsed
  useEffect(() => {
    if (!settings.enabled || !parsedResume) return;

    const tick = () => {
      if (shouldRunNow(getLastRunAt(), settings.intervalMinutes)) {
        void runBatch();
      }
    };

    tick(); // check immediately on mount / settings change
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [settings.enabled, settings.intervalMinutes, parsedResume, runBatch]);

  const sendAll = useCallback(async () => {
    for (const entry of queued) {
      if (entry.job.url) window.open(entry.job.url, '_blank', 'noopener');
      if (entry.pdfUrl) {
        const a = document.createElement('a');
        a.href = entry.pdfUrl;
        a.download = `tailored-resume-${entry.job.company.replace(/\s+/g, '-').toLowerCase()}.pdf`;
        a.click();
      }
      onApplied(entry.job);
    }
    // Clean up object URLs
    for (const entry of queued) {
      if (entry.pdfUrl) setTimeout(() => URL.revokeObjectURL(entry.pdfUrl), 10_000);
    }
    setQueued([]);
  }, [queued, onApplied]);

  const dismiss = useCallback((url: string) => {
    setQueued(prev => {
      const entry = prev.find(q => q.job.url === url);
      if (entry?.pdfUrl) URL.revokeObjectURL(entry.pdfUrl);
      return prev.filter(q => q.job.url !== url);
    });
  }, []);

  return { settings, updateSettings, queued, isProcessing, processedCount, sendAll, dismiss };
}
