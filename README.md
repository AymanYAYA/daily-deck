# Daily Deck

A small spaced-repetition flashcard app (Anki-style) to build English, one short session a day.

**Try it:** https://aymanyaya.github.io/daily-deck/

## Problem
Moving from French to English at work. Generic vocabulary apps don't target what I actually need, and most flashcard apps only train you to *recognise* a word, not to *produce* it when you need it. I also wanted to stay in control: choose what I train, and understand exactly how each card is graded.

## Method
**Decks you choose.** Each deck is a separate topic with its own progress:

| Deck | What you do | Cards |
|---|---|---|
| Verbs | The French verb is shown, you type the English (*partir → to leave*) | 150 most used English verbs |
| Expressions | Everyday and work expressions, both ways | 299 |

**Anki-style buttons.** You type your answer, the app checks it and highlights a suggested grade; you tap the one you want:

| Button (suggested by the app, you choose) | Meaning | Comes back |
|---|---|---|
| Easy | Found on your own | after a long gap |
| Good | Found with the hint (first letter of each word) | after a medium gap |
| Hard | Almost: one typo or a missing word | soon |
| Again | Wrong, or "I give up" | tomorrow, and again a few cards later |

**Spaced repetition (SM-2, the algorithm behind Anki).** Cards you know come back after longer and longer gaps (1 day, 3 days, a week, three weeks…). Coming back late but still remembering earns credit for the extra time. Reviews are capped per day and the most urgent come first, so missed days never snowball.

**Levels.** Each deck climbs a consulting ladder: Intern, Analyst, Consultant, Manager, Partner. A card is *solid* when its next review is a week or more away; when every card of a level is solid, the next level opens. Earlier levels keep coming back in reviews, so the base is never lost. *Mastered* means the next review is three weeks or more away.

**Daily goal.** Cards due today plus your new cards (set in Settings). Finish them and the day is won.

**Verification.** Every card links to Reverso Context to see the phrase in real sentences translated by people. Doubtful cards can be flagged and the list copied for correction. Card text always comes from the deck file, so a corrected card is fixed without losing progress.

## Result
A single-file web app that runs in any browser, on phone or desktop, with no install and no account: two decks, automatic grading, levels, hardest-cards practice, and two settings (new cards per day, maximum reviews per day).

## Tech
One self-contained `index.html` (HTML, CSS, vanilla JavaScript). Progress is stored locally in the browser (`localStorage`). Built with Claude.
