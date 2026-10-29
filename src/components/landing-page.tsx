"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Workflow,
  CalendarDays,
  BarChart3,
  Waypoints,
  Zap,
} from "lucide-react";
import { Logo } from "./ui";
import { SignIn } from "./sign-in";
import { AppFooter } from "./app-footer";
export function LandingPage({
  configured,
  error,
}: {
  configured: boolean;
  error?: string;
}) {
  return (
    <main className="power-login">
      <header className="login-header">
        <Logo />
        <span className="login-header-label">
          <span className="live-dot" />
          POWER SYSTEM PLANNING
        </span>
      </header>
      <div className="login-stage">
        <section className="login-access" aria-label="Sign in to Evolve">
          <div className="login-grid-art" aria-hidden="true">
            <svg viewBox="0 0 480 190" fill="none">
              <path
                d="M0 140H75L130 82H220L270 30H360L410 82H480M0 82H75L130 140H220L270 82H360L410 140H480M220 82V140M360 30V82"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="130" cy="82" r="7" />
              <circle cx="220" cy="140" r="7" />
              <circle cx="270" cy="30" r="7" />
              <circle cx="360" cy="82" r="11" />
              <circle cx="410" cy="140" r="7" />
            </svg>
            <span>
              <Zap size={18} /> CONNECTED BY PURPOSE
            </span>
          </div>
          <div className="login-access-card">
            <span className="login-card-symbol">
              <Waypoints size={24} />
            </span>
            <span className="section-kicker">YOUR NEXT CHAPTER</span>
            <h2>Welcome to Evolve</h2>
            <p>Two rooms. One connected power-system workspace.</p>
            {error && (
              <div className="form-error" role="alert">
                We couldn’t complete sign-in. Use your invited Google account,
                or ask the administrator to approve your email.
              </div>
            )}
            <SignIn configured={configured} />
            <div className="login-divider">
              <span>or explore before signing in</span>
            </div>
            <Link className="button secondary demo-link" href="/demo">
              Explore the demo workspace <ArrowUpRight size={17} />
            </Link>
            <div className="private-note">
              <ShieldCheck size={15} />
              <span>
                Private workspace. Google sign-in. Access by invitation.
              </span>
            </div>
          </div>
          <div className="login-bottom-note">
            <ArrowRight size={16} />
            <span>Focused on the next step. Built for the bigger picture.</span>
          </div>
        </section>
        <section className="login-story">
          <span className="section-kicker">
            RENSIST · A CONNECTED WORKSPACE
          </span>
          <h1>
            Plan with clarity.
            <br />
            Power what’s next<span>.</span>
          </h1>
          <p className="login-intro">
            One workspace for the people, projects, and decisions shaping a more
            reliable power system.
          </p>
          <blockquote>
            “Reliable power starts with thoughtful planning.
            <br />
            Extraordinary progress starts with one clear task.”
          </blockquote>
          <div className="login-pillars">
            <div>
              <Workflow size={19} />
              <strong>Locker Room · Coordinate the work</strong>
              <span>Clear owners. Shared direction.</span>
            </div>
            <div>
              <CalendarDays size={19} />
              <strong>Stay ahead of deadlines</strong>
              <span>From daily actions to delivery.</span>
            </div>
            <div>
              <BarChart3 size={19} />
              <strong>Board Room · See the bigger picture</strong>
              <span>
                Yearly plans, ten shared stages and reviewed project documents.
              </span>
            </div>
          </div>
        </section>
      </div>
      <AppFooter />
    </main>
  );
}
