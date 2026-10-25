import { Logo } from '@/components/layout/Logo';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-navy-900 lg:flex-row">
      {/* Brand panel */}
      <div className="flex flex-col justify-between bg-navy-900 px-6 py-8 lg:w-1/2 lg:px-12 lg:py-12">
        <Logo />
        <div className="hidden lg:block">
          <h2 className="max-w-md text-3xl font-semibold leading-tight text-white">
            Workforce &amp; time tracking built for electrical contractors.
          </h2>
          <p className="mt-4 max-w-md text-navy-300">
            Clock-ins, job sites, timesheets and reports — accurate to the minute, in your
            company&apos;s timezone.
          </p>
        </div>
        <p className="hidden text-xs text-navy-400 lg:block">© {new Date().getFullYear()} VoltTrack</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-navy-50 px-4 py-10 lg:rounded-l-3xl">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
