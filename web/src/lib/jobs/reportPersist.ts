import { query, queryOne } from "@/lib/db/client";

export async function getReport(reportId: string) {
  return queryOne(
    `SELECT dr.*,
       (SELECT json_agg(r ORDER BY r.title)
        FROM refactoring_recommendations r WHERE r.report_id = dr.id) AS recommendations
     FROM diagnostic_reports dr WHERE dr.id = $1`,
    [reportId]
  );
}

export async function getReportsForScan(scanRunId: string) {
  return query<{
    id: string;
    status: string;
    report_type: string;
    created_at: string;
    finished_at: string | null;
  }>(
    `SELECT id, status, report_type, created_at, finished_at FROM diagnostic_reports
     WHERE scan_run_id = $1 ORDER BY created_at DESC`,
    [scanRunId]
  );
}

export async function getLatestProjectReport(scanRunId: string) {
  return queryOne<{
    id: string;
    status: string;
    created_at: string;
    content: import("@/lib/types").AiReportContent;
  }>(
    `SELECT id, status, created_at, content FROM diagnostic_reports
     WHERE scan_run_id = $1 AND report_type = 'project' AND status IN ('completed', 'partial')
     ORDER BY created_at DESC LIMIT 1`,
    [scanRunId]
  );
}

export async function getJob(jobId: string) {
  return queryOne(`SELECT * FROM job_queue WHERE id = $1`, [jobId]);
}

