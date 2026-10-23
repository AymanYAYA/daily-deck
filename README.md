# Daily Deck

A small spaced-repetition flashcard app (Anki-style) to build professional English, one short session a day.

**Try it:** https://aymanyaya.github.io/daily-deck/

## Problem
Moving from French to English at work: interviews, case studies, client meetings, emails. Generic vocabulary apps don't cover the phrases I actually need, and most flashcard apps only train you to *understand* a word, not to *say* it when you need it.

## Method
Cards (English phrase, French meaning, example sentence) organised as a **pyramid of 5 levels**, from the English you use most to the most specialised:

| Level | Content | Cards |
|---|---|---|
| 1. Intern | The core of everyday conversation: small talk, questions, opinions, reactions, time & plans, connectors, everyday verbs | 149 |
| 2. Analyst | Workplace basics: meetings, emails | 40 |
| 3. Consultant | Interviews, case studies, consulting | 60 |
| 4. Manager | Convince and negotiate | coming soon |
| 5. Partner | Finance and tech vocabulary | 50 |

New cards come from your current level, chapter by chapter. A card is *solid* when you remember it a week later both ways; a level closes when all its cards are solid, and earlier levels keep coming back in reviews, so the base is never lost.

**Verification:** every card links to Reverso Context to see the phrase in real sentences translated by people, and doubtful cards can be flagged and exported for correction. Card text always comes from the deck, so a corrected card is fixed for everyone without losing progress.

How the learning logic works:

- **Two sides per card, scheduled separately.** *Understand it* (English → French) comes first. Once you know a card with a 3-day gap, *Say it* (French → English) unlocks, because producing a phrase is harder than recognising it.
- **Answer before you see.** On *Say it* cards you type your answer, with an optional hint (first letter of each word). The app compares it with the expected phrase, underlines the missing words and suggests a grade, so you can't fool yourself.
- **Spaced repetition (SM-2, the algorithm behind Anki).** Each review is graded *Again / Hard / Good / Easy*. Remembered cards come back after longer and longer gaps (1 day, 3 days, a week, three weeks…); forgotten cards start again at 1 day and reappear a few cards later in the same session. If you come back late and still remember, the card gets credit for the extra time.
- **Missed days don't snowball.** Reviews are capped per day (80 by default), the most urgent cards come first (how late a card is compared with its gap), and new cards pause until you catch up.
- **Hardest cards.** Cards you miss twice or more are listed in the Progress tab, and you can drill them in a practice mode that doesn't disturb the schedule.

### Motivation
- **Daily goal:** the day's reviews plus your new cards, fixed at your first visit. Reach it and the day is won; anything after is a bonus round.
- **Levels and chapters:** close every chapter of a level to move up, from Intern to Partner.
- **Session recap:** cards done, new cards met, expressions mastered.

An expression counts as **mastered** when you can still understand it *and* say it three weeks after your last review.

## Result
A single-file web app that runs in any browser, on phone or desktop, with no install and no account. Progress tab with mastered count, retention per side, streak and daily reviews; JSON backup and a CSV review log for analysis in Python. The detailed log keeps the last 180 days (older days are kept as daily counts) so the app stays well under the browser storage limit.

## Tech
One self-contained `index.html` (HTML, CSS, vanilla JavaScript). Progress is stored locally in the browser (`localStorage`). Built with Claude.
