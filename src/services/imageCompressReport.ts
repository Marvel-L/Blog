/**
 * 构建期图片压缩报告（generated/image-compress-report.json）。
 */
import type { ImageCompressReport } from '@/pages/image-compress/compressReport';

const generatedReportModules = import.meta.glob<ImageCompressReport>('../../generated/image-compress-report.json', {
  eager: true,
  import: 'default',
});

const emptyReport: ImageCompressReport = { profileId: 'v1', items: [] };

export const getImageCompressReport = (): ImageCompressReport => {
  const modules = Object.values(generatedReportModules);
  const report = modules[0];
  if (!report || !Array.isArray(report.items)) {
    return emptyReport;
  }
  return report;
};
