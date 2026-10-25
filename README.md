# Daily Deck

A small spaced-repetition flashcard app (Anki-style) to build English, one short session a day.

**Try it:** https://aymanyaya.github.io/daily-deck/

## Problem
Moving from French to English at work. Generic vocabulary apps don't target what I actually need, and most flashcard apps only train you to *recognise* a word, not to *produce* it when you need it. I also wanted to stay in control: choose what I train, and understand exactly how each card is graded.

## Method
**Decks.** Each deck is a separate topic with its own progress. The app is built for several decks; the first one is:

| Deck | What you do | Cards |
|---|---|---|
| Verbs | Three levels, below | 364 |

| Level | What you do | Example | Cards |
|---|---|---|---|
| 1 · Intern | French verb → English verb | *partir* → **to leave** | 150 most used verbs |
| 2 · Analyst | Irregular verbs: simple past and past participle, on separate cards | *to go*, simple past → **went** · past participle → **gone** | 57 verbs × 2 = 114 |
| 3 · Consultant | Fill in the verb with the right tense (French sentence as hint) | *I ___ (live) here since 2020.* → **have lived** | 100 sentences |

Level 3 trains the real trap for French speakers: choosing between simple past and present perfect (*J'ai mangé hier* = *I ate yesterday*, not *I have eaten*), plus passives, past perfect and the base form after *did*, *will* or *to*.

**Anki-style buttons.** You type your answer, the app checks it and highlights a suggested grade; you tap the one you want:

| Button (suggested by the app, you choose) | Meaning | Comes back |
|---|---|---|
| Easy | Found on your own | 4 days the first time |
| Good | Found with the hint (first letter of each word) | 2 days the first time |
| Hard | Almost: one typo or a missing word | 1 day the first time |
| Again | Wrong, or "I give up" | a few cards later, then tomorrow |

**Spaced repetition (SM-2, the algorithm behind Anki).** Each button always gives a different gap, and the gaps grow with every success: after that, Hard ≈ gap × 1.2, Good ≈ gap × 2.3, Easy ≈ gap × 3. With Good every time, a card comes back after 2, 5, 12, 28, then 64 days. Coming back late but still remembering earns credit for the extra time. Reviews are capped per day and the most urgent come first, so missed days never snowball.

**Levels.** Each deck climbs a consulting ladder: Intern, Analyst, Consultant, Manager, Partner. A card is *solid* when its next review is a week or more away (two weeks for irregular verbs, the hardest part); when every card of a level is solid, the next level opens. Earlier levels keep coming back in reviews, so the base is never lost. *Mastered* means the next review is three weeks or more away.

**Daily goal.** Cards due today plus your new cards (set in Settings). Finish them and the day is won.

**Verification.** Every card links to Reverso Context to see the phrase in real sentences translated by people. Doubtful cards can be flagged and the list copied for correction. Card text always comes from the deck file, so a corrected card is fixed without losing progress.

## Result
A single-file web app that runs in any browser, on phone or desktop, with no install and no account: a verbs deck, automatic grading, levels, hardest-cards practice, extra practice once the day is done (it never changes the schedule), and two settings (new cards per day up to 50, maximum reviews per day up to 300).

## Tech
Three files, no framework: `index.html` (page and styles), `app.js` (logic: scheduling, answer checking, screens), `decks.js` (card data). Progress is stored locally in the browser (`localStorage`). Built with Claude.
