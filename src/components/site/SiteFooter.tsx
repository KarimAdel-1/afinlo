import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";

/** The website's footer: the pages, where the data comes from, and what Fan Heat is and isn't. */
export function SiteFooter() {
  const groups = [
    {
      title: "Afinlo",
      links: [
        ["Plan a tour", "/plan"],
        ["Your tours", "/home"],
        ["How it works", "/how-it-works"],
        ["Does it work?", "/does-it-work"],
      ],
    },
    { title: "About", links: [["About Afinlo", "/about"], ["Questions & answers", "/#faq"]] },
  ];
  return (
    <footer className="af2-footer">
      <div className="af2-footer-top">
        <div className="af2-footer-brand">
          <Wordmark />
          <p>
            Find your real fans.
            <br />
            Get paid to reach them.
          </p>
        </div>
        {groups.map((g) => (
          <div key={g.title}>
            <h3>{g.title}</h3>
            <ul>
              {g.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3>Built with</h3>
          <ul>
            <li>
              <a href="https://www.qloo.com" target="_blank" rel="noopener noreferrer">
                Qloo Taste AI
              </a>
            </li>
            <li>
              <a href="https://qloo.devpost.com" target="_blank" rel="noopener noreferrer">
                Qloo Agentic Hackathon
              </a>
            </li>
            <li>OpenAI, for the writing</li>
          </ul>
        </div>
      </div>
      <div className="af2-footer-signature" aria-hidden="true">
        afinlo
      </div>
      <div className="af2-footer-bottom">
        <span>© {new Date().getFullYear()} Afinlo, independent and not a Qloo product.</span>
        <span>Fan Heat is audience taste affinity, not ticket demand.</span>
        <Link href="/how-it-works">
          How the numbers are made
          <ArrowUpRight size={13} />
        </Link>
      </div>
    </footer>
  );
}
