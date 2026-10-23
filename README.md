# Daily Deck

A small spaced-repetition flashcard app (Anki-style) to build professional English, one short session a day.

**Try it:** https://aymanyaya.github.io/daily-deck/

## Problem
Moving from French to English at work: interviews, case studies, client meetings, emails. Generic vocabulary apps don't cover the phrases I actually need, and most flashcard apps only train you to *understand* a word, not to *say* it when you need it.

## Method
150 hand-picked cards (English phrase, French meaning, example sentence) across 7 themes: Finance, Meeting, Interview, Consulting, Tech, Email, Case.

How the learning logic works:

- **Two sides per card, scheduled separately.** *Understand it* (English → French) comes first. Once you know a card with a 3-day gap, *Say it* (French → English) unlocks, because producing a phrase is harder than recognising it.
- **Answer before you see.** On *Say it* cards you type your answer, with an optional hint (first letter of each word). The app compares it with the expected phrase, underlines the missing words and suggests a grade, so you can't fool yourself.
- **Spaced repetition (SM-2, the algorithm behind Anki).** Each review is graded *Again / Hard / Good / Easy*. Remembered cards come back after longer and longer gaps (1 day, 3 days, a week, three weeks…); forgotten cards start again at 1 day and reappear a few cards later in the same session. If you come back late and still remember, the card gets credit for the extra time.
- **Missed days don't snowball.** Reviews are capped per day (80 by default), the most urgent cards come first (how late a card is compared with its gap), and new cards pause until you catch up.
- **Hardest cards.** Cards you miss twice or more are listed in the Progress tab, and you can drill them in a practice mode that doesn't disturb the schedule.

### Game layer
- **Daily goal:** the day's reviews plus new cards, fixed at your first visit. Reach it and the day is won; everything after is a bonus round with double XP.
- **XP and levels:** a consulting career ladder, from *Intern* to *Partner*. XP rewards showing up and real memory (10 XP per card whatever the grade, a bonus for exact *Say it* answers, big bonuses when a card reaches 3 weeks or an expression is mastered), never the grade you give yourself, so there's no reason to cheat.
- **Chapters and badges:** each theme is a chapter you close by mastering all its cards; badges mark milestones (first day won, 7-day streak, 50 mastered…).
- **Session recap:** cards done, new cards met, XP earned and distance to the next level.

An expression counts as **mastered** when you can still understand it *and* say it three weeks after your last review.

## Result
A single-file web app that runs in any browser, on phone or desktop, with no install and no account. Progress tab with mastered count, retention per side, streak and daily reviews; JSON backup and a CSV review log for analysis in Python. The detailed log keeps the last 180 days (older days are kept as daily counts) so the app stays well under the browser storage limit.

## Tech
One self-contained `index.html` (HTML, CSS, vanilla JavaScript). Progress is stored locally in the browser (`localStorage`). Built with Claude.
