// GSAP with ScrollTrigger, registered once for the website's scroll animation.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
// A phone's address bar showing and hiding isn't a real resize, so it doesn't recalculate the scroll positions.
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger };
