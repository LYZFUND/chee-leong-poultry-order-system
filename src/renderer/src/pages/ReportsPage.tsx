import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';
import { FormDatePicker } from '@renderer/components/ui/FormDatePicker';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { notify } from '@renderer/components/ui/Notification';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { reportService } from '@renderer/services/reportService';
import { getCurrentMonth, getCurrentYear, toDateInputValue } from '@renderer/utils/date';

type ReportMode = 'monthly' | 'daily' | 'weekly' | 'yearly';
type ReportSubject = 'customer' | 'farm';

function addDays(dateValue: string, dayOffset: number): string {
  const [yearText, monthText, dayText] = dateValue.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateValue;
  }

  const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function ReportsPage(): JSX.Element {
  const [reportMode, setReportMode] = useState<ReportMode>('monthly');
  const [reportSubject, setReportSubject] = useState<ReportSubject>('customer');
  const [dailyDate, setDailyDate] = useState(toDateInputValue());
  const [weeklyEndDate, setWeeklyEndDate] = useState(toDateInputValue());
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(getCurrentYear());

  async function exportDaily(): Promise<void> {
    if (reportSubject === 'farm') {
      const rows = await reportService.getFarmPurchaseRows({ date: dailyDate });
      await reportService.exportStructuredFarmPurchaseReport(`farm-daily-report-${dailyDate}.csv`, rows, 'daily');
    } else {
      const rows = await reportService.getProfitRows({ date: dailyDate });
      await reportService.exportStructuredProfitReport(`daily-report-${dailyDate}.csv`, rows, 'daily');
    }
    notify.success('Daily CSV exported.');
  }

  async function exportWeekly(): Promise<void> {
    const weeklyStartDate = addDays(weeklyEndDate, -6);
    const filters = { dateFrom: weeklyStartDate, dateTo: weeklyEndDate };
    if (reportSubject === 'farm') {
      const rows = await reportService.getFarmPurchaseRows(filters);
      await reportService.exportStructuredFarmPurchaseReport(
        `farm-weekly-report-${weeklyStartDate}-to-${weeklyEndDate}.csv`,
        rows,
        'weekly',
      );
    } else {
      const rows = await reportService.getProfitRows(filters);
      await reportService.exportStructuredProfitReport(
        `weekly-report-${weeklyStartDate}-to-${weeklyEndDate}.csv`,
        rows,
        'weekly',
      );
    }
    notify.success('Weekly CSV exported.');
  }

  async function exportMonthly(): Promise<void> {
    if (reportSubject === 'farm') {
      const rows = await reportService.getMonthlyFarmPurchaseRows(year, month);
      await reportService.exportStructuredFarmPurchaseReport(
        `farm-monthly-report-${year}-${String(month).padStart(2, '0')}.csv`,
        rows,
        'monthly',
      );
    } else {
      const rows = await reportService.getMonthlyRows(year, month);
      await reportService.exportStructuredProfitReport(
        `monthly-report-${year}-${String(month).padStart(2, '0')}.csv`,
        rows,
        'monthly',
      );
    }
    notify.success('Monthly CSV exported.');
  }

  async function exportYearly(): Promise<void> {
    if (reportSubject === 'farm') {
      const rows = await reportService.getYearlyFarmPurchaseRows(year);
      await reportService.exportStructuredFarmPurchaseReport(`farm-yearly-report-${year}.csv`, rows, 'yearly');
    } else {
      const rows = await reportService.getYearlyRows(year);
      await reportService.exportStructuredProfitReport(`yearly-report-${year}.csv`, rows, 'yearly');
    }
    notify.success('Yearly CSV exported.');
  }

  return (
    <>
      <PageTitle
        title="Reports"
        description="Export daily, weekly, monthly, and yearly reports to CSV with farm purchases and customer purchase, sales, and profit."
      />

      <section className="mb-5 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormSelect
            label="Report About"
            value={reportSubject}
            options={[
              { label: 'Customer Sales', value: 'customer' },
              { label: 'Farm Purchase', value: 'farm' },
            ]}
            onChange={(event) => setReportSubject(event.target.value as ReportSubject)}
          />
        <FormSelect
          label="Report Type"
          value={reportMode}
          options={[
            { label: 'Monthly', value: 'monthly' },
            { label: 'Daily', value: 'daily' },
            { label: 'Weekly', value: 'weekly' },
            { label: 'Yearly', value: 'yearly' },
          ]}
          onChange={(event) => setReportMode(event.target.value as ReportMode)}
        />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {reportMode === 'daily' ? (
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink-900">Daily Report</h2>
            <div className="mt-4 space-y-4">
              <FormDatePicker
                label="Date"
                value={dailyDate}
                onChange={(event) => setDailyDate(event.target.value)}
              />
              <Button onClick={() => void exportDaily()}>
                <Download size={16} />
                Export Daily CSV
              </Button>
            </div>
          </section>
        ) : null}

        {reportMode === 'weekly' ? (
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink-900">Weekly Report</h2>
            <div className="mt-4 space-y-4">
              <FormDatePicker
                label="Week End Date"
                value={weeklyEndDate}
                onChange={(event) => setWeeklyEndDate(event.target.value)}
              />
              <p className="text-xs text-stone-500">
                Exports the selected date and previous 6 days.
              </p>
              <Button onClick={() => void exportWeekly()}>
                <Download size={16} />
                Export Weekly CSV
              </Button>
            </div>
          </section>
        ) : null}

        {reportMode === 'monthly' ? (
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink-900">Monthly Report</h2>
            <div className="mt-4 space-y-4">
              <FormInput
                label="Year"
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
              <FormSelect
                label="Month"
                value={String(month)}
                options={Array.from({ length: 12 }, (_, index) => ({
                  label: String(index + 1).padStart(2, '0'),
                  value: String(index + 1),
                }))}
                onChange={(event) => setMonth(Number(event.target.value))}
              />
              <Button onClick={() => void exportMonthly()}>
                <Download size={16} />
                Export Monthly CSV
              </Button>
            </div>
          </section>
        ) : null}

        {reportMode === 'yearly' ? (
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink-900">Yearly Report</h2>
            <div className="mt-4 space-y-4">
              <FormInput
                label="Year"
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
              <Button onClick={() => void exportYearly()}>
                <Download size={16} />
                Export Yearly CSV
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
