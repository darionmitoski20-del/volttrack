import { describe, it, expect } from 'vitest';
import { escapeCsvCell, toCsv } from './csv';
import { can, permissionsFor } from './permissions';

describe('csv escaping', () => {
  it('leaves plain values untouched', () => {
    expect(escapeCsvCell('Alice')).toBe('Alice');
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(null)).toBe('');
  });
  it('quotes values with commas, quotes, or newlines', () => {
    expect(escapeCsvCell('Smith, John')).toBe('"Smith, John"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });
  it('builds a full CSV with CRLF rows', () => {
    const csv = toCsv(['name', 'hours'], [['Alice', 8], ['Bob, Jr', 7.5]]);
    expect(csv).toBe('name,hours\r\nAlice,8\r\n"Bob, Jr",7.5');
  });
});

describe('role permissions mirror RLS intent', () => {
  it('owners can review timesheets and manage employees', () => {
    expect(can('owner', 'timesheets.review')).toBe(true);
    expect(can('owner', 'employees.manage')).toBe(true);
  });
  it('employees cannot review timesheets or view audit', () => {
    expect(can('employee', 'timesheets.review')).toBe(false);
    expect(can('employee', 'audit.view')).toBe(false);
  });
  it('employees can clock and submit their own timesheet', () => {
    expect(can('employee', 'clock.self')).toBe(true);
    expect(can('employee', 'timesheets.submitOwn')).toBe(true);
  });
  it('owner has strictly more permissions than employee', () => {
    expect(permissionsFor('owner').length).toBeGreaterThan(permissionsFor('employee').length);
  });
});
