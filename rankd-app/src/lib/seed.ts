import type { Film } from "./types";
import { seedScore } from "./tiers";

// A small starter library (real TMDb posters) so the loop is playable with no
// backend. Most sit at 4★ and tied on score, so a run has a full tier to place.
// Stands in for the user's real Letterboxd import later.
const IMG = "https://image.tmdb.org/t/p/w342";

const RAW: Omit<Film, "score">[] = [
  { id: "the-godfather-1972", title: "The Godfather", year: "1972", rating: 5, poster: `${IMG}/3bhkrj58Vtu7enYsRolD1fZdja1.jpg`, tagline: "An offer you can't refuse." },
  { id: "dune-2021", title: "Dune", year: "2021", rating: 4, poster: `${IMG}/gDzOcq0pfeCeqMBwKIJlSmQpjkZ.jpg`, tagline: "It begins." },
  { id: "inception-2010", title: "Inception", year: "2010", rating: 4, poster: `${IMG}/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg`, tagline: "Your mind is the scene of the crime." },
  { id: "the-dark-knight-2008", title: "The Dark Knight", year: "2008", rating: 4, poster: `${IMG}/qJ2tW6WMUDux911r6m7haRef0WH.jpg`, tagline: "Why so serious?" },
  { id: "interstellar-2014", title: "Interstellar", year: "2014", rating: 4, poster: `${IMG}/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg`, tagline: "Mankind was born on Earth. It was never meant to die here." },
  { id: "la-la-land-2016", title: "La La Land", year: "2016", rating: 4, poster: `${IMG}/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg`, tagline: "Here's to the fools who dream." },
  { id: "ex-machina-2014", title: "Ex Machina", year: "2014", rating: 4, poster: `${IMG}/dmJW8IAKHKxFNiUnoDR7JfsK7Rp.jpg`, tagline: "There is nothing more human than the will to survive." },
  { id: "sicario-2015", title: "Sicario", year: "2015", rating: 4, poster: `${IMG}/lz8vNyXeidqqOdJW9ZjnDAMb5Vr.jpg`, tagline: "The border is a state of mind." },
  { id: "gone-girl-2014", title: "Gone Girl", year: "2014", rating: 4, poster: `${IMG}/ts996lKsxvjkO2yiYG0ht4qAicO.jpg`, tagline: "You don't know what you've got 'til it's Gone." },
  { id: "drive-2011", title: "Drive", year: "2011", rating: 4, poster: `${IMG}/602vevIURmpDfzbnv5Ubi6wIkQm.jpg`, tagline: "There are no clean getaways." },
];

export const SEED_FILMS: Film[] = RAW.map((f) => ({ ...f, score: seedScore(f.rating) }));
