import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

const HEADER_BUTTON_CLASS =
  'inline-flex h-8 flex-shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40';

const HEADER_SECONDARY_BUTTON_CLASS = `${HEADER_BUTTON_CLASS} bg-secondary text-secondary-foreground hover:bg-secondary/80`;

export const Route = createFileRoute('/about')({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: 'About BeamerLab' },
      {
        name: 'description',
        content: 'About BeamerLab, a modern LaTeX Beamer editor built by ETH Zurich students.',
      },
    ],
  }),
});

function AboutPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-12 bg-toolbar-bg border-b border-toolbar-border flex items-center px-4 gap-3">
        <Link to="/" className="text-primary font-bold text-lg tracking-tight">
          &lt;B&gt;
        </Link>

        <span className="font-semibold text-sm">BeamerLab</span>

        <div className="h-5 w-px bg-border mx-1" />

        <Link to="/" className={`${HEADER_SECONDARY_BUTTON_CLASS} w-36`}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Return to editor
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">About us</p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight">BeamerLab</h1>

        <div className="mt-8 space-y-5 text-sm leading-7 text-muted-foreground">
          <p>
            We are a group of ETH Zurich students who have spent enough late nights fighting with
            math equations in slides, broken figures, and mysterious spacing issues. So we decided
            to build BeamerLab: a way to modernize the LaTeX presentation experience and make it
            more accessible to everyone who needs it.
          </p>

          <p>
            Our goal is to make LaTeX slide creation easier for the people who actually rely on it:
            researchers, teaching assistants, lecturers, and anyone preparing math-heavy or
            technical presentations.
          </p>

          <p>
            BeamerLab helps you build clean, structured, and beautiful LaTeX presentations faster,
            while still keeping the control and precision that make LaTeX great. The goal is simple:
            help you bring your ideas across clearly, without getting stuck in the mechanics of
            slide creation.
          </p>
        </div>

        <div className="about-highlight mt-12 text-lg font-bold text-foreground">
          Your ideas, without the friction.
        </div>

        <section className="mt-16 rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-primary font-semibold">
            Support BeamerLab
          </p>

          <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
            Shoot for the stars 💫
          </h2>

          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            If BeamerLab is useful to you, starring the project on GitHub helps more people discover
            it. Stars also make the project easier to share with other students, researchers, and
            contributors who might want to improve it.
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground/80">
            The repository is being prepared for an open-source release and will be made public after
            a little more testing and cleanup. 
            <br />
            In the meantime, you can share your ideas and feedback via email.
          </p>

          <a
            href="https://github.com/ycakan/beamerlab"
            target="_blank"
            rel="noreferrer"
            className="group relative mt-5 inline-flex h-8 items-center justify-center overflow-hidden rounded bg-secondary px-3 text-xs text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            <span className="relative z-10">Star BeamerLab on GitHub</span>

            <span
              className="relative z-10 ml-1 inline-block transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12"
              aria-hidden="true"
            >
              ⭐
            </span>

            <span
              className="pointer-events-none absolute right-2 top-1 text-[10px] opacity-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:opacity-100"
              aria-hidden="true"
            >
              ✨
            </span>

            <span
              className="pointer-events-none absolute right-7 bottom-1 text-[8px] opacity-0 transition-all duration-500 group-hover:translate-y-1 group-hover:-translate-x-1 group-hover:opacity-100"
              aria-hidden="true"
            >
              ✦
            </span>
          </a>
        </section>

        <section className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-primary font-semibold">Contact</p>

          <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground">Get in touch 📬</h2>

          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Have feedback, template suggestions, bug reports, or collaboration ideas? Reach the
            BeamerLab team at{' '}
            <a
              href="mailto:beamerlab@protonmail.com"
              className="font-medium text-primary hover:underline"
            >
              beamerlab@protonmail.com
            </a>
            .
          </p>
        </section>
      </section>

      <footer className="border-t border-border h-9 px-6 flex items-center justify-center text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 leading-none">
          <span className="relative top-[0.5px]" aria-label="Copyright">
            ©
          </span>
          <span>BeamerLab · Based in Zurich, Switzerland.</span>
        </span>
      </footer>
    </main>
  );
}