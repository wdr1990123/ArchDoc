import type { BreadcrumbItem } from "@/components/Breadcrumbs";
import { zh } from "@/lib/i18n/zh";

export function homeCrumb(): BreadcrumbItem {
  return { label: zh.breadcrumb.home, href: "/" };
}

export function domainCrumb(domainId: string, domainName: string): BreadcrumbItem {
  return { label: domainName, href: `/domains/${domainId}` };
}

export function buildScanBreadcrumbs(options: {
  domainId: string;
  domainName: string;
  scanId: string;
  repositoryName: string;
  currentPage?: string;
}): BreadcrumbItem[] {
  const scanLabel = `${options.repositoryName} · ${zh.breadcrumb.scan}`;
  const scanItem: BreadcrumbItem = options.currentPage
    ? {
        label: scanLabel,
        href: `/domains/${options.domainId}/scans/${options.scanId}`,
      }
    : { label: scanLabel };

  const items: BreadcrumbItem[] = [
    homeCrumb(),
    domainCrumb(options.domainId, options.domainName),
    scanItem,
  ];
  if (options.currentPage) {
    items.push({ label: options.currentPage });
  }
  return items;
}
