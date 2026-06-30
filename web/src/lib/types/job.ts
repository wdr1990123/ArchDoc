export type DiagnoseJobPayload = {
  scan_run_id: string;
  report_type?: "project" | "module";
  module_id?: string;
  module_name?: string;
};

export type DiagnoseJobContext = {
  jobId?: string;
  workerId?: string;
};
