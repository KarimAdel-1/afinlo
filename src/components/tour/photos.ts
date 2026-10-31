// The files are imported rather than linked, so each photo's URL carries a hash of its contents: a replaced photo shows
// at once instead of after the image cache (4 hours) runs out.
import aboutHero from "../../../public/images/photos/about-hero.webp";
import aboutRehearsal from "../../../public/images/photos/about-rehearsal.webp";
import artist from "../../../public/images/photos/artist.webp";
import backstage from "../../../public/images/photos/backstage.webp";
import crewPortrait from "../../../public/images/photos/crew-portrait.webp";
import editorial from "../../../public/images/photos/editorial.webp";
import fan from "../../../public/images/photos/fan.webp";
import meeting from "../../../public/images/photos/meeting.webp";
import planner from "../../../public/images/photos/planner.webp";
import portrait from "../../../public/images/photos/portrait.webp";
import sponsorCup from "../../../public/images/photos/sponsor-cup.webp";
import sponsorPlant from "../../../public/images/photos/sponsor-plant.webp";
import sponsorProducts from "../../../public/images/photos/sponsor-products.webp";
import sponsorSneaker from "../../../public/images/photos/sponsor-sneaker.webp";
import team from "../../../public/images/photos/team.webp";
import venueClub from "../../../public/images/photos/venue-club.webp";
import venueHall from "../../../public/images/photos/venue-hall.webp";
import venueTheater from "../../../public/images/photos/venue-theater.webp";

/**
 * Every photo on the website's pages, in one place. To use your own, replace the files in public/images/photos/,
 * keeping the names, and keep each `alt` describing what is actually in the photo.
 */
export const PHOTOS = {
  portrait: { src: portrait, alt: "A comedian in a dark shirt smiling into a microphone in front of a purple curtain" },
  fan: { src: fan, alt: "A fan seen from behind in a crowd, watching a band under purple stage lights" },
  editorial: { src: editorial, alt: "A singer facing a packed club, seen from the back of the stage" },
  team: { src: team, alt: "A band and crew setting up instruments on a stage under blue lights" },
  planner: { src: planner, alt: "Two people planning at a laptop in a rehearsal room" },
  meeting: { src: meeting, alt: "Three musicians talking in a rehearsal room, one with a guitar and one with a notebook" },
  aboutHero: { src: aboutHero, alt: "A singer with a guitar at a microphone under purple stage lights" },
  aboutRehearsal: { src: aboutRehearsal, alt: "A guitarist writing in a notebook on a rehearsal room floor while two bandmates play" },
  crewPortrait: { src: crewPortrait, alt: "A crew member in a beanie and black T-shirt sitting by road cases" },
  artist: { src: artist, alt: "A singer with long braids singing into a microphone under purple stage lights" },
  backstage: { src: backstage, alt: "A tour team talking over a laptop on a road case backstage" },
  venueClub: { src: venueClub, alt: "A music club with a small stage and purple lights" },
  venueHall: { src: venueHall, alt: "A concert hall with a wide stage lit in purple" },
  venueTheater: { src: venueTheater, alt: "An ornate theatre with balconies and a purple curtain" },
  sponsorProducts: { src: sponsorProducts, alt: "A canvas tote bag, a water bottle and a mug beside a plant" },
  sponsorPlant: { src: sponsorPlant, alt: "A potted plant" },
  sponsorCup: { src: sponsorCup, alt: "A cup of coffee on a saucer" },
  sponsorSneaker: { src: sponsorSneaker, alt: "A black canvas sneaker" },
} as const;
