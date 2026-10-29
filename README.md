# Daily Deck

A simple Anki: create your own decks and cards, and review them with the same scheduler as modern Anki (FSRS). Built for learning English, usable for anything.

**Try it:** https://aymanyaya.github.io/daily-deck/

## Problem
Anki is the reference for spaced repetition, but it is powerful and austere: many people give up on the interface before the method works. I wanted the same engine with a much simpler experience, and an option Anki doesn't make easy: typing the answer and having it checked.

## Method
**Your decks, your cards.** Create a deck, add cards one by one (front, back, optional example) or many at once by pasting `front ; back` lines or two columns from a spreadsheet. Each card can also create its reversed card. Browse, search, edit or delete any card without losing its progress.

**Two answer modes per deck.**
- *Flip the card*: think of the answer, tap the card, it turns over in 3D, then grade yourself, like Anki.
- *Type the answer*: the app checks it (one typo tolerated, several right answers allowed with `/`), offers a hint (first letter of each word) and suggests a grade.

**FSRS scheduler (FSRS-5, default parameters).** Each card has a *stability* (how many days until the chance of remembering it drops to 90%) and a *difficulty*. After each answer (Again / Hard / Good / Easy) both are updated and the next review is set when recall should still be about 90%. Again brings the card back a few cards later in the same session. Example with Good every time: 3, 11, 35, 101 days.

**Daily limits per deck**: new cards per day and maximum reviews per day, so missed days never turn into a mountain.

**Backup.** Everything is stored in the browser; Settings downloads a backup file and restores it on any device.

## Result
A web app that runs on phone or desktop with no install and no account: decks, cards, bulk add, browse and edit, 3D flip study, typed answers with checking, FSRS scheduling, daily limits and file backup. A starter deck of 364 English verb cards is included and can be edited or deleted.

## Tech
No framework, three files: `index.html` (page and styles), `app.js` (FSRS scheduler, storage, screens), `decks.js` (starter deck). Data lives in `localStorage`. Built with Claude.
