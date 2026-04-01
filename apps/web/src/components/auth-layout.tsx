import type { ComponentType, ReactNode } from "react";

import { ArrowRightIcon, BrandPulseIcon, type IconProps } from "./icons";

type AuthHighlight = {
  icon: ComponentType<IconProps>;
  title: string;
  description: string;
};

type AuthLayoutProps = {
  eyebrow: string;
  title: string;
  description: string;
  panelTitle: string;
  panelDescription: string;
  highlights: ReadonlyArray<AuthHighlight>;
  children: ReactNode;
  footer?: ReactNode;
};

export const authInputClassName =
  "w-full rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-sm text-slate-900 shadow-[0_16px_28px_-24px_rgba(15,76,129,0.9)] outline-none placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-[#0b7a75]/10";

export const authInputWithIconClassName = `${authInputClassName} pl-11`;

export const authPrimaryButtonClassName =
  "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent2 px-4 py-3 font-semibold text-white shadow-[0_20px_34px_-22px_rgba(15,76,129,0.95)] hover:bg-[#0b426f] disabled:cursor-not-allowed disabled:opacity-70";

export const authSecondaryButtonClassName =
  "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800 shadow-[0_18px_30px_-24px_rgba(15,76,129,0.85)] hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70";

export const authTertiaryButtonClassName =
  "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-accent/40 hover:bg-mist/70 disabled:cursor-not-allowed disabled:opacity-70";

export const authStatusClassName = "rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-700";

export const authPanelClassName = "rounded-[28px] border border-slate-200/90 bg-white/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]";

export const AuthLayout = ({
  eyebrow,
  title,
  description,
  panelTitle,
  panelDescription,
  highlights,
  children,
  footer
}: AuthLayoutProps) => {
  return (
    <section className="relative px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative overflow-hidden rounded-[32px] bg-[#0b355c] px-6 py-8 text-white shadow-glow sm:px-8 lg:px-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(151,228,222,0.2),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(244,185,66,0.16),_transparent_26%)]" />
          <div className="absolute -left-24 top-24 h-56 w-56 rounded-full bg-cyan-200/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

          <div className="relative z-10 flex h-full flex-col">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-accent2 shadow-[0_10px_26px_-18px_rgba(15,76,129,0.9)]">
                <BrandPulseIcon className="h-5 w-5" />
              </span>
              Hospital Management
            </div>

            <div className="mt-8 max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-100/80">{eyebrow}</p>
              <h1 className="mt-4 font-display text-4xl leading-tight text-white sm:text-5xl">{panelTitle}</h1>
              <p className="mt-4 max-w-lg text-sm leading-7 text-slate-100/88 sm:text-base">{panelDescription}</p>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3 lg:mt-auto">
              {highlights.map(({ icon: Icon, title: highlightTitle, description: highlightDescription }) => (
                <article
                  key={highlightTitle}
                  className="rounded-[24px] border border-white/12 bg-white/10 p-4 backdrop-blur-md"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-cyan-50">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold text-white">{highlightTitle}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-100/80">{highlightDescription}</p>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <div className="w-full rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-glow backdrop-blur-xl sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-accent2">
              <ArrowRightIcon className="h-3.5 w-3.5" />
              {eyebrow}
            </div>

            <h2 className="mt-5 font-display text-3xl leading-tight text-accent2 sm:text-4xl">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">{description}</p>

            <div className="mt-8">{children}</div>

            {footer ? <div className="mt-6 border-t border-slate-200/80 pt-4 text-sm text-slate-600">{footer}</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
};
