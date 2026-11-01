import type { EventType, Idea, PlanInput } from '../schemas'

type IdeaSeed = [Idea['kind'], string, string, string?]

// 12 per event type: 2 theme, 2 menu, 3 activity, 2 decor, 2 music, 1 favor.
const ideaSeeds: Record<EventType, IdeaSeed[]> = {
  wedding: [
    ['theme', 'A garden supper at golden hour', 'A soft, generous setting that lets the food and the people lead.'],
    ['theme', 'Heirloom details from both families', 'Borrow a fabric, a dish, or a photo from each side and weave it into the day.'],
    ['menu', 'Three small plates, one shared table', 'A flexible menu that feels considered without slowing the evening.', 'Catering'],
    ['menu', 'A late-night snack round', 'Warm chai and a simple snack when the dancing slows down.', 'Catering'],
    ['activity', 'A first-look photo walk', 'Twenty quiet minutes with your photographer before guests arrive.', 'Photo and video'],
    ['activity', 'A memory jar for the couple', 'Guests add one story or wish before dessert.'],
    ['activity', 'Blessings from the elders', 'A short moment where elders share one wish before the meal.'],
    ['decor', 'Candles and seasonal stems', 'Low arrangements so guests can see each other across the table.', 'Decor and flowers'],
    ['decor', 'A hand-lettered welcome sign', 'One clear sign at the entrance that also guides guests to their seats.', 'Decor and flowers'],
    ['music', 'Acoustic at dinner, a playlist for dancing', 'Live music where it matters most and a curated playlist after.', 'Music and sound'],
    ['music', 'A song from each family', 'Ask both families for a song that means something, and play them as the couple enters.', 'Music and sound'],
    ['favor', 'Small jars of local honey', 'A sweet, useful thank-you that travels well.'],
  ],
  birthday: [
    ['theme', 'A rooftop evening with string lights', 'Warm light, a long table, and a view of the city.'],
    ['theme', 'A decade-by-decade throwback', 'Each corner celebrates a different chapter of their life.'],
    ['menu', 'A build-your-own chaat bar', 'Easy to scale, fun to share, and friendly to most diets.', 'Food and cake'],
    ['menu', 'A cake in their favorite flavor', 'Skip the showpiece and order the flavor they actually love.', 'Food and cake'],
    ['activity', 'A "this or that" quiz about the guest of honor', 'Quick, funny, and it gets everyone talking.', 'Entertainment'],
    ['activity', 'A wishes wall', 'Guests write a wish on a card and pin it up for the guest of honor to keep.'],
    ['activity', 'A short toast circle', 'A few close friends each share one short story.', 'Entertainment'],
    ['decor', 'One color, three textures', 'Repeat a single color in flowers, napkins, and balloons.', 'Decor'],
    ['decor', 'A photo timeline on a string', 'Clip photos from across the years along one wall.', 'Decor'],
    ['music', 'A playlist built from guest requests', 'Ask for one song with each invitation.'],
    ['music', 'A surprise song dedication', 'Friends pick one song for a quick dedication before the cake.', 'Entertainment'],
    ['favor', 'Instant photos to take home', 'A photo corner that doubles as the return gift.', 'Return gifts'],
  ],
  community: [
    ['theme', 'A winter fair with lantern-lit stalls', 'Warm, walkable, and easy to drop into for an hour.'],
    ['theme', 'Meet your neighbors', 'Name tags with street names make it easy to start a conversation.'],
    ['menu', 'Local stalls around shared seating', 'Neighbors run the food; everyone eats together.', 'Food'],
    ['menu', 'A potluck table for home recipes', 'Residents bring one dish and a card with its story.', 'Food'],
    ['activity', 'A chalk-art corner for kids', 'Low cost, all ages, and it decorates the venue as you go.'],
    ['activity', 'A skills swap table', 'Neighbors offer short demos, from plant care to bike repair.', 'Volunteers'],
    ['activity', 'A quiet corner', 'A calm, shaded spot with seating for anyone who needs a break.'],
    ['decor', 'Hand-painted signs by residents', 'Promotion that also makes the day feel like everyone built it.', 'Promotion and reach'],
    ['decor', 'Bunting from donated fabric', 'Colorful, low cost, and easy to reuse next year.'],
    ['music', 'Local bands and a school choir', 'A stage schedule that brings families back each hour.', 'Sound and stage'],
    ['music', 'An open mic hour', 'Anyone can sign up for a short slot to sing, read, or play.', 'Sound and stage'],
    ['favor', 'Seed packets with next year’s date', 'A small gift that grows into the next gathering.'],
  ],
}

/** Template ideas for an event type. `fitsPriority` is set only when the idea matches one of the user's priorities. */
export function buildIdeas(input: Pick<PlanInput, 'eventType' | 'priorities'>): Idea[] {
  return ideaSeeds[input.eventType].map(([kind, title, blurb, fits], n) => ({
    id: `${input.eventType}-idea-${n}`,
    kind,
    title,
    blurb,
    fitsPriority: fits && input.priorities.includes(fits) ? fits : undefined,
    saved: false,
  }))
}
