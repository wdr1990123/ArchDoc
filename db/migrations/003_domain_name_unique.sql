-- Deduplicate diagnosis domains: keep the oldest row per normalized name
DELETE FROM diagnosis_domains d1
WHERE EXISTS (
  SELECT 1 FROM diagnosis_domains d2
  WHERE LOWER(TRIM(d2.name)) = LOWER(TRIM(d1.name))
    AND d2.created_at < d1.created_at
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_diagnosis_domains_name_unique
  ON diagnosis_domains (LOWER(TRIM(name)));
