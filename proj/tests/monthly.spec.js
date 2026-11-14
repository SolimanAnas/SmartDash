import { test, expect } from '@playwright/test';
import { reportMonths, monthSummary, delta, prevMonth, daysInMonth } from '../src/monthly.js';

const data = {
  reports: [
    { month: '2026-05', cases: 400, resp: 4, rosc: 2, refusals: 5, transfers: 40 },
    { month: '2026-06', cases: 450, resp: 3.5, rosc: 2, refusals: 7, transfers: 38 },
  ],
  shiftReports: [
    {
      date: '2026-06-02',
      shift: 'Night',
      team: 'B',
      casesHandled: 5,
      transfers: 1,
      roscCount: 1,
      staffingShortages: 'Short 1',
      equipmentIssues: '',
    },
    {
      date: '2026-06-02',
      shift: 'Day',
      team: 'A',
      casesHandled: 3,
      refusals: 2,
      equipmentIssues: 'Radio',
    },
    { date: '2026-07-01', shift: 'Day', casesHandled: 99 },
  ],
  challenges: [
    { date: '2026-06-03', priority: 'High', status: 'Open' },
    { date: '2026-06-04', priority: 'Low', status: 'Resolved' },
    { date: '2026-05-01', priority: 'Critical', status: 'In progress' },
  ],
  initiatives: [
    { status: 'done', completedDate: '2026-06-20', title: 'Handover' },
    { status: 'done', completedDate: '2026-05-20' },
    { status: 'progress' },
  ],
  achievements: [
    { date: '2026-06-05', title: 'A' },
    { date: '2026-04-01', title: 'B' },
  ],
};

test('month helpers', () => {
  expect(prevMonth('2026-01')).toBe('2025-12');
  expect(prevMonth('2026-11')).toBe('2026-10');
  expect(daysInMonth('2026-02')).toBe(28);
  expect(daysInMonth('2028-02')).toBe(29);
  expect(reportMonths(data, ['2026-08'])).toEqual([
    '2026-08',
    '2026-07',
    '2026-06',
    '2026-05',
    '2026-04',
  ]);
});

test('monthly summary counts only the selected month', () => {
  const s = monthSummary(data, '2026-06');
  expect(s.hasKpi).toBe(true);
  expect(s.kpis.find((k) => k.k === 'cases')).toEqual({ k: 'cases', v: 450, prev: 400 });
  expect(s.shifts).toMatchObject({
    reported: 2,
    expected: 60,
    day: 1,
    night: 1,
    cases: 8,
    transfers: 1,
    refusals: 2,
    rosc: 1,
  });
  expect(s.shifts.shortages).toEqual([
    { date: '2026-06-02', shift: 'Night', team: 'B', t: 'Short 1' },
  ]);
  expect(s.shifts.equipment.map((x) => x.shift)).toEqual(['Day']); // Day sorts before Night
  expect(s.challenges).toMatchObject({ opened: 2, openedResolved: 1, openNow: 2 });
  expect(s.challenges.urgent.map((c) => c.priority)).toEqual(['Critical', 'High']);
  expect(s.initiatives.completed.map((i) => i.title)).toEqual(['Handover']);
  expect(s.achievements.map((a) => a.title)).toEqual(['A']);
});

test('a month without data is empty, not an error', () => {
  const s = monthSummary(data, '2025-01');
  expect(s.hasKpi).toBe(false);
  expect(s.shifts.reported).toBe(0);
  expect(s.kpis.every((k) => k.v === null)).toBe(true);
});

test('delta: lower is better for response time and refusals', () => {
  expect(delta('cases', 450, 400)).toEqual({ t: '+50 vs prev.', good: true });
  expect(delta('resp', 3.5, 4)).toEqual({ t: '-0.5 vs prev.', good: true });
  expect(delta('refusals', 7, 5)).toEqual({ t: '+2 vs prev.', good: false });
  expect(delta('rosc', 2, 2)).toEqual({ t: 'no change', good: null });
  expect(delta('rosc', 2, null)).toEqual({ t: '', good: null });
});
