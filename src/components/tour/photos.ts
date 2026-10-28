// The files are imported rather than linked, so each photo's URL carries a hash of its contents: a replaced photo shows
// at once instead of after the image cache (4 hours) runs out.
import editorial from "../../../public/images/photos/editorial.webp";
import fan from "../../../public/images/photos/fan.webp";
import meeting from "../../../public/images/photos/meeting.webp";
import planner from "../../../public/images/photos/planner.webp";
import portrait from "../../../public/images/photos/portrait.webp";
import team from "../../../public/images/photos/team.webp";

/**
 * Every photo on the website's pages, in one place, with where each appears. To use your own (artists or
 * comedians you have the rights to show), replace the files in public/images/photos/, keeping the names, and keep
 * each `alt` describing what is actually in the photo.
 *
 * Today they are free photos from Unsplash, under the Unsplash License (no attribution required; credited here).
 */
export const PHOTOS = {
  /** Home: the tall photo in the "A few Qloo signals" grid. Anita Jankovic, unsplash.com/photos/aW1ZmXO0mMY */
  portrait: { src: portrait, alt: "A comedian mid-joke on stage, holding a microphone in front of a red curtain" },
  /** Home: the small photo in that grid. Does it work?: the closing band. Tijs van Leur, unsplash.com/photos/So6YckShOVA */
  fan: { src: fan, alt: "A fan with both arms raised in a concert crowd, the band lit in gold behind them" },
  /** Home: beside "Different acts. Different fans." Win Min Aung, unsplash.com/photos/aTjX3-vzpEk */
  editorial: { src: editorial, alt: "A singer in a red jacket performing to a packed club, seen from the back of the stage" },
  /** About: the wide photo under "Made for the people who put on the show." Tat Linh Nguyen, unsplash.com/photos/Z5UNxe0-dwA */
  team: { src: team, alt: "A singer in a pink shirt and jeans singing into a microphone on a dark stage" },
  /** How it works: the closing band. AMONWAT DUMKRUT, unsplash.com/photos/9PAvVfnAdkY */
  planner: { src: planner, alt: "Two women singing into microphones on stage, one with her hand raised" },
  /** About: the closing band. Lolla Woodstock, unsplash.com/photos/UNKFrhAxYbc */
  meeting: { src: meeting, alt: "A four-piece band with guitars sitting on the stone steps of an old courtyard" },
} as const;
