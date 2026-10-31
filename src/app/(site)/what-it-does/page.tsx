import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight, Database, Handshake, Link2, Lock, MapPin, Send, Users, Warehouse } from "lucide-react";
import { CitiesMap, CrowdOrbit } from "@/components/site/PagesArt";
import { Wordmark } from "@/components/Wordmark";
import "@/components/site/pages.css";
import { PHOTOS } from "@/components/tour/photos";

export const metadata: Metadata = {
  title: "What it does",
  description: "Know your crowd, find your cities and meet your next sponsor: what Afinlo does for a tour.",
};

const VENUES = [
  { name: "The Monarch", place: "Austin, TX", photo: PHOTOS.venueClub },
  { name: "Lincoln Hall", place: "Chicago, IL", photo: PHOTOS.venueTheater },
];

export default function WhatItDoesPage() {
  return (
    <div className="af3">
      <section className="af3-does-hero">
        <div className="af3-does-hero-copy">
          <h1>A whole tour of possibility.</h1>
          <p>Know your crowd. Find your cities. Meet your next sponsor.</p>
          <Link className="af2-button" href="/plan">
            Plan a tour
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="af3-does-hero-art">
          <div className="af3-photo af3-does-hero-photo">
            <Image src={PHOTOS.artist.src} alt={PHOTOS.artist.alt} fill priority sizes="(max-width: 800px) 100vw, 55vw" />
          </div>
        </div>
      </section>

      <h2 className="af3-big">One act. A clearer picture.</h2>

      <section className="af3-bento">
        <article className="af3-crowd">
          <Users size={30} aria-hidden />
          <h3>Know the crowd.</h3>
          <p>See what your fans care about across music, culture, and lifestyle, and find more people like them.</p>
          <CrowdOrbit />
        </article>

        <article className="af3-hidden-cities">
          <div>
            <MapPin size={28} aria-hidden />
            <h3>Find the hidden cities.</h3>
            <p>Go beyond the usual routes with cities that match your audience and vibe.</p>
          </div>
          <CitiesMap />
        </article>

        <article className="af3-rooms">
          <Warehouse size={28} aria-hidden />
          <h3>Book the right rooms.</h3>
          <p>Find venues that fit your audience, sound, and stage.</p>
          <ul>
            {VENUES.map((v) => (
              <li key={v.name}>
                <span className="af3-photo">
                  <Image src={v.photo.src} alt="" fill sizes="70px" />
                </span>
                <div>
                  <b>{v.name}</b>
                  <small>{v.place}</small>
                </div>
                <ChevronRight size={16} aria-hidden />
              </li>
            ))}
          </ul>
        </article>

        <article className="af3-brands">
          <Handshake size={28} aria-hidden />
          <h3>Pitch the right brands.</h3>
          <p>Get brand matches that align with your audience and story.</p>
          <div>
            <span className="af3-photo">
              <Image src={PHOTOS.sponsorProducts.src} alt={PHOTOS.sponsorProducts.alt} fill sizes="240px" />
            </span>
            <ul>
              {["Lifestyle", "Apparel", "Wellness"].map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </article>

      </section>

      <section className="af3-team">
        <div className="af3-team-copy">
          <h2>Your tour team, already on it.</h2>
          <p>Get tailored recommendations, refine your plan in real time, and get expert support when you need it, all in one place.</p>
          <Link className="af2-button" href="/plan">
            Plan a tour
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="af3-team-art">
          <div className="af3-photo">
            <Image src={PHOTOS.backstage.src} alt={PHOTOS.backstage.alt} fill sizes="(max-width: 800px) 100vw, 45vw" />
          </div>
          <div className="af3-chat" aria-hidden>
            <header>
              <Wordmark />
              <small>Your tour team</small>
            </header>
            <p className="af3-chat-me">Show me a few venues in Seattle.</p>
            <p>On it. I&apos;ll pull the venues these fans love there.</p>
            <footer>
              Message your tour team…
              <span><Send size={13} /></span>
            </footer>
          </div>
        </div>
      </section>

      <section className="af3-trust">
        <div>
          <Database size={24} aria-hidden />
          <p><b>Taste data from Qloo</b>Cultural insights to help you find your people.</p>
        </div>
        <div>
          <Link2 size={24} aria-hidden />
          <p><b>Clear sources</b>Understand where insights come from.</p>
        </div>
        <div>
          <Lock size={24} aria-hidden />
          <p><b>You stay in control</b>Your data, your decisions, always.</p>
        </div>
      </section>

      <section className="af3-band">
        <div>
          <h2>Turn an act into a plan.</h2>
          <p>Smarter cities. Real opportunities. A tour that feels right.</p>
        </div>
        <Link className="af2-button" href="/plan">
          Plan a tour
          <ArrowRight size={16} aria-hidden />
        </Link>
      </section>
    </div>
  );
}
