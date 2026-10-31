import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarCheck, Lock, Mic, Send, Users } from "lucide-react";
import "@/components/site/pages.css";
import { PHOTOS } from "@/components/tour/photos";

export const metadata: Metadata = {
  title: "About",
  description: "Afinlo connects audience taste to tours and sponsorship, for independent musicians and comedians. Built for the Qloo Agentic Hackathon.",
};

export default function AboutPage() {
  return (
    <div className="af3">
      <section className="af3-about-hero">
        <div>
          <h1>Made for the people who put on the show.</h1>
          <p>Great shows start long before the lights come on. We help the people behind them find their next audience.</p>
        </div>
        <div className="af3-photo af3-about-hero-photo">
          <Image src={PHOTOS.aboutHero.src} alt={PHOTOS.aboutHero.alt} fill priority sizes="(max-width: 800px) 100vw, 45vw" />
        </div>
      </section>

      <div className="af3-photo af3-about-wide">
        <Image src={PHOTOS.team.src} alt={PHOTOS.team.alt} fill sizes="(max-width: 1320px) 100vw, 1280px" />
      </div>

      <section className="af3-statement">
        <h2>Talent is everywhere. Opportunity should be, too.</h2>
        <p>We connect audience taste to tours and sponsorship, helping independent musicians and comedians get in front of the right people, in the right places.</p>
      </section>

      <section className="af3-for">
        <article className="af3-for-blue">
          <Mic size={30} aria-hidden />
          <h3>For the artists.</h3>
          <p>Turn your momentum into the next show. Find audiences, explore new markets and connect with sponsors who get your work.</p>
          <Link href="/plan" aria-label="Plan a tour" className="af3-round">
            <ArrowRight size={20} aria-hidden />
          </Link>
        </article>
        <article>
          <CalendarCheck size={30} aria-hidden />
          <h3>For the bookers.</h3>
          <p>Discover artists your audience will love. Plan smarter with taste-driven insights and simpler outreach.</p>
          <Link href="/plan" aria-label="Plan a tour" className="af3-round af3-round-soft">
            <ArrowRight size={20} aria-hidden />
          </Link>
        </article>
        <article className="af3-for-photo">
          <Image src={PHOTOS.crewPortrait.src} alt={PHOTOS.crewPortrait.alt} fill sizes="(max-width: 800px) 100vw, 400px" />
          <div>
            <Users size={30} aria-hidden />
            <h3>For the people behind the scenes.</h3>
            <p>Support the shows that keep culture moving. From managers to marketers, we help you make the right connections.</p>
            <Link href="/plan" aria-label="Plan a tour" className="af3-round">
              <ArrowRight size={20} aria-hidden />
            </Link>
          </div>
        </article>
      </section>

      <section className="af3-culture">
        <div className="af3-photo">
          <Image src={PHOTOS.aboutRehearsal.src} alt={PHOTOS.aboutRehearsal.alt} fill sizes="(max-width: 800px) 100vw, 55vw" />
        </div>
        <div>
          <h2>Real culture. Clearer decisions.</h2>
          <p>We combine a deep understanding of culture with technology, so you can plan tours and find sponsorship that fit your audience and your goals.</p>
          <ul>
            <li>
              <span><BarChart3 size={22} aria-hidden /></span> Powered by Qloo&apos;s aggregate taste data.
            </li>
            <li>
              <span><Lock size={22} aria-hidden /></span> No personal profiling.
            </li>
            <li>
              <span><Send size={22} aria-hidden /></span> You decide what to send.
            </li>
          </ul>
        </div>
      </section>

      <section className="af3-band">
        <div>
          <h2>Bring the act. We&apos;ll find the fans.</h2>
          <p>Plan smarter tours and sponsorship, with a partner that understands what moves people.</p>
        </div>
        <Link className="af2-button" href="/plan">
          Plan a tour
          <ArrowRight size={16} aria-hidden />
        </Link>
      </section>
    </div>
  );
}
