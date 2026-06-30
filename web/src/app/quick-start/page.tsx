import { PageHeader } from "@/components/layout/ui";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { QuickStartWizard } from "@/components/shared/QuickStartWizard";
import { zh } from "@/lib/i18n/zh";
import { homeCrumb } from "@/lib/nav/breadcrumbs";

export default function QuickStartPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs
        items={[homeCrumb(), { label: zh.breadcrumb.quickStart }]}
      />
      <PageHeader title={zh.quickStart.pageTitle} description={zh.quickStart.pageDesc} />
      <QuickStartWizard />
    </div>
  );
}
