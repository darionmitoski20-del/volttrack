/** "$1,234.50" — company currency is USD for now. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Pay for a span of minutes at an hourly rate. */
export function payForMinutes(minutes: number, hourlyRate: number): number {
  return (Math.max(0, minutes) / 60) * hourlyRate;
}
