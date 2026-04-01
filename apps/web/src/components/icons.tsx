import type { ReactNode, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

const BaseIcon = ({ children, ...props }: IconProps & { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

export const ArrowRightIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </BaseIcon>
);

export const AlertCircleIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </BaseIcon>
);

export const BrandPulseIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M4 12h3l2.4-4.5L12.8 17l2.2-4 1.4 2H20" />
    <path d="M7.5 4.5h9A3.5 3.5 0 0 1 20 8v8a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16V8a3.5 3.5 0 0 1 3.5-3.5Z" />
  </BaseIcon>
);

export const CalendarIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M7 3v3" />
    <path d="M17 3v3" />
    <path d="M4 9h16" />
    <rect x="4" y="5" width="16" height="15" rx="3" />
  </BaseIcon>
);

export const CalendarPlusIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M7 3v3" />
    <path d="M17 3v3" />
    <path d="M4 9h16" />
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M12 12v5" />
    <path d="M9.5 14.5h5" />
  </BaseIcon>
);

export const CheckCircleIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.2 2.2 4.8-5.1" />
  </BaseIcon>
);

export const ClockIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5l3 1.8" />
  </BaseIcon>
);

export const FileTextIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M8 3.5h6l4 4V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
    <path d="M14 3.5V8h4" />
    <path d="M9 12h6" />
    <path d="M9 16h6" />
  </BaseIcon>
);

export const GoogleIcon = ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
    <path
      d="M20 12.2c0-.6-.1-1.2-.2-1.7H12v3.2h4.5c-.2 1-.8 1.9-1.7 2.5v2.1h2.8c1.6-1.5 2.4-3.6 2.4-6.1Z"
      fill="#4285F4"
    />
    <path
      d="M12 20.3c2.3 0 4.2-.7 5.6-2l-2.8-2.1c-.8.5-1.8.9-2.8.9-2.1 0-3.9-1.4-4.5-3.2H4.6v2.1a8.5 8.5 0 0 0 7.4 4.3Z"
      fill="#34A853"
    />
    <path
      d="M7.5 13.9a5 5 0 0 1 0-2.8V9H4.6a8.5 8.5 0 0 0 0 7l2.9-2.1Z"
      fill="#FBBC04"
    />
    <path
      d="M12 7.9c1.3 0 2.4.4 3.4 1.3l2.5-2.5C16.3 5.2 14.4 4.5 12 4.5A8.5 8.5 0 0 0 4.6 9l2.9 2.1c.6-1.9 2.4-3.2 4.5-3.2Z"
      fill="#EA4335"
    />
  </svg>
);

export const HomeIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="m3 10.5 9-7 9 7" />
    <path d="M6.5 9.5V20h11V9.5" />
  </BaseIcon>
);

export const KeyIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="8.5" cy="15.5" r="3.5" />
    <path d="M12 15.5h8" />
    <path d="M17 12.5v3" />
    <path d="M14.5 13.5v2" />
  </BaseIcon>
);

export const LockIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect x="5" y="10" width="14" height="10" rx="2.5" />
    <path d="M8 10V8a4 4 0 1 1 8 0v2" />
  </BaseIcon>
);

export const LogoutIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H10" />
  </BaseIcon>
);

export const MailIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="m4.5 7.5 7.5 5 7.5-5" />
  </BaseIcon>
);

export const ShieldIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M12 3 5.5 6v5.2c0 4.6 2.7 7.9 6.5 9.8 3.8-1.9 6.5-5.2 6.5-9.8V6L12 3Z" />
    <path d="m9.5 12.5 1.7 1.7 3.3-3.7" />
  </BaseIcon>
);

export const SparklesIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3L7.5 7.5l3.3-1.2L12 3Z" />
    <path d="m5 14 .7 2L8 16.7 6 17.4 5.3 19 4.6 17.4 3 16.7 5 16l.7-2Z" />
    <path d="m18.5 13 .9 2.5L22 16.4l-2.6.9-.9 2.7-.9-2.7-2.6-.9 2.6-.9.9-2.5Z" />
  </BaseIcon>
);

export const StethoscopeIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M8 4v7a4 4 0 1 0 8 0V4" />
    <path d="M8 7H6.5A1.5 1.5 0 0 1 5 5.5V4" />
    <path d="M16 7h1.5A1.5 1.5 0 0 0 19 5.5V4" />
    <path d="M14 16v1.5A3.5 3.5 0 0 0 17.5 21h0A2.5 2.5 0 0 0 20 18.5v-1A2.5 2.5 0 0 0 17.5 15H16" />
  </BaseIcon>
);

export const UserCircleIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    <circle cx="12" cy="12" r="9" />
  </BaseIcon>
);

export const UserPlusIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M4.5 19a6 6 0 0 1 11 0" />
    <path d="M18 7v6" />
    <path d="M15 10h6" />
  </BaseIcon>
);

export const UsersIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="9" cy="9" r="3" />
    <circle cx="16.5" cy="8" r="2.5" />
    <path d="M4.5 19a5.5 5.5 0 0 1 9 0" />
    <path d="M14 18.5a4.5 4.5 0 0 1 6 0" />
  </BaseIcon>
);
