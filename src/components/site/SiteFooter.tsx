import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

/** The website's footer: the pages, and where the data comes from. */
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
        <Image src="/brand/afinlo-logo-tight.png" alt="" width={1712} height={410} sizes="(max-width: 1120px) 100vw, 1120px" />
      </div>
      <div className="af2-footer-bottom">
        <span>© {new Date().getFullYear()} Afinlo</span>
        <a href="https://qloo.devpost.com" target="_blank" rel="noopener noreferrer">
          Built for the Qloo Hackathon
        </a>
      </div>
    </footer>
  );
}
