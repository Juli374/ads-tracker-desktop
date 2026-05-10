import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type CoverageDay } from '../../../api/reportsQueue';
import { Card, EmptyState } from '../../ui';

interface Props {
  days: CoverageDay[];
}

const DAYS_WINDOW = 14;

function getLast14Dates(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = DAYS_WINDOW - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${month}/${day}`;
}

export const CoverageGrid: React.FC<Props> = ({ days }) => {
  const { t } = useTranslation('settings');

  const dateRange = useMemo(() => getLast14Dates(), []);

  const profiles = useMemo(() => {
    const set = new Set(days.map((d) => d.profileId));
    return Array.from(set).sort();
  }, [days]);

  const lookup = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const d of days) {
      map.set(`${d.date}::${d.profileId}`, d.hasData);
    }
    return map;
  }, [days]);

  if (profiles.length === 0) {
    return (
      <Card title={t('searchTerm.coverage.title')}>
        <EmptyState title={t('searchTerm.coverage.empty')} />
      </Card>
    );
  }

  return (
    <Card title={t('searchTerm.coverage.title')}>
      <div
        data-testid="search-term-coverage-grid"
        className="px-5 py-4 overflow-x-auto"
      >
        <table className="text-[11px] border-collapse">
          <thead>
            <tr>
              <th className="text-left pr-3 pb-1 font-medium text-zinc-500 whitespace-nowrap">
                Profile
              </th>
              {dateRange.map((date) => (
                <th
                  key={date}
                  className="pb-1 px-0.5 font-normal text-zinc-400 text-center whitespace-nowrap"
                  title={date}
                >
                  {shortDate(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((profileId) => (
              <tr key={profileId} data-testid={`search-term-coverage-row-${profileId}`}>
                <td className="pr-3 py-0.5 font-mono text-zinc-600 whitespace-nowrap truncate max-w-[120px]">
                  {profileId}
                </td>
                {dateRange.map((date) => {
                  const hasData = lookup.get(`${date}::${profileId}`);
                  return (
                    <td key={date} className="px-0.5 py-0.5 text-center">
                      <span
                        title={`${date} · ${profileId}`}
                        className={`inline-block w-4 h-4 rounded-sm ${
                          hasData === true
                            ? 'bg-emerald-400'
                            : hasData === false
                              ? 'bg-zinc-100'
                              : 'bg-zinc-50'
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center gap-3 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-400" /> Data
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-zinc-100" /> No data
          </span>
        </div>
      </div>
    </Card>
  );
};
