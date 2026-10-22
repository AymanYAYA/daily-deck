# Daily Deck

A small spaced-repetition flashcard app (Anki-style) to build professional English, one short session a day.

**Problem** – Moving from French to English at work: interviews, case studies, client meetings, emails. Generic vocabulary apps don't cover the phrases I actually need.

**Method** – 150 hand-picked cards (English phrase, French meaning, example sentence) across 7 themes: Finance, Meeting, Interview, Consulting, Tech, Email, Case. Each review is graded *Again / Hard / Good / Easy*, and a spaced-repetition schedule decides when the card comes back.

**Result** – A single-file web app that runs in any browser, on phone or desktop, with no install and no account.

## Features
- Daily review with spaced repetition
- Progress tab (cards learned, streak, review history)
- Searchable card library
- Backup / restore of progress (JSON), and a review log export for analysis in Python

## Tech
One self-contained `index.html` (HTML, CSS, vanilla JavaScript). Progress is stored locally in the browser (`localStorage`). Built with Claude.

## Try it
Live version: https://aymanyaya.github.io/daily-deck/
