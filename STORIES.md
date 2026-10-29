# Tourbo: what it is, who it's for, and the stories it must pass

**Tourbo is a tour manager for acts too small for a booking agency.** Tell it who you are, where you want to play and how many nights. It finds where your fans actually live (Qloo), picks rooms, works out the money for each night, routes the tour, writes your show notes and handles the venue emails.

## Who does what (say it the same way everywhere in the UI)
- **Qloo** knows taste: where the act's fans cluster, which rooms and local acts those fans like, what each city loves, which local brands fit as sponsors.
- **Tourbo MCP server** (`packages/mcp`) turns Qloo into tour tools: score cities, find rooms, openers, show economics, routing, promo split, offer assessment, plan critic. It does no AI thinking.
- **Claude** is the agent. On the website it calls the MCP tools, decides which cities and deals are worth it, writes show prep and venue emails, and negotiates. In your own Claude Code or Desktop, *your* Claude calls the same tools.
- **You** approve: nothing is sent to a venue without a click, and every number is labelled as an estimate.

## Stories (each one has a test in `tests/stories/`)
1. **Maya, indie singer in Chicago (draw ~300).** She wants 5 shows within a day's drive in March that make money. She types her name, clicks Chicago on the map, sets 600 km and 5 shows, and presses Plan. She watches Claude work through clear steps and gets a map route, one card per night (room, opener, deal, ticket price, expected profit) and a tour total. *Pass:* every city is inside her circle, every night has a money verdict, a loss-making night is never presented as a headline.
2. **Maya preps a night and books it.** On a night's card she opens Show prep and gets an opening line, setlist nods to local acts, banter and a sponsor ask, each tied to a Qloo fact; nothing made up gets through. She sends the venue inquiries; a venue offers a $300 flat fee, and Tourbo shows it loses money and drafts a counter-offer for her to approve.
3. **Rohan, stand-up comic in Mumbai.** He wants 6 shows around Mumbai and Pune in comedy rooms. *Pass:* he gets comedy clubs or theatres (no stadiums), fellow comics as openers, prices in ₹, and local hooks for his material.
4. **Ana, a new act not on Qloo.** Her name isn't found, so the form asks "Who do you sound like?" and she adds two acts. *Pass:* the plan is built from those acts' fans and says so plainly.
5. **Dev, who lives in Claude Code.** He clones the repo, sets his Qloo key in `.env`, opens Claude Code in the folder (the project's `.mcp.json` registers Tourbo) and asks for "a 4-show tour for Japanese Breakfast near Seattle". *Pass:* Tourbo's tools are listed, and his Claude plans with them.
6. **Lee, booker at a small Chicago bar.** He has empty Tuesdays. He enters his venue and gets acts his room's crowd likes that are small enough to book and have local fans.
7. **Things go wrong.** The act isn't found, Qloo is slow, the AI key is missing, the database is down, a run dies mid-way. *Pass:* each case gets one plain sentence saying what happened and what to do, plus a retry where it makes sense. Never a stack trace or a blank page.

## Check every major change against this
- Can Maya do story 1 without reading anything but the screen?
- Is it obvious where Qloo, the MCP server and Claude each come in?
- Does every state (empty, loading, partial, failed, done) look intentional?
- Do `npm run test:stories` (and `STORY_LLM=1` before a release) still pass?
