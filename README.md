# LifeVault onboarding demo

**Live demo:** link coming once it's deployed.

LifeVault is a product I designed and built: a private home for a family's printed photos and the stories behind them. A family sends in their prints, they get scanned, and the app helps them save who is in each photo, where it was taken and what was happening, while someone still remembers.

This repo is a working demo of one part of it: the first run, from a stack of freshly scanned photos to the first saved story, ending in the family's vault.

## What you can try

1. **Name a face.** One face is marked on a sample photo. The name you give carries through every screen after it.
2. **Flip through photos.** One at a time. Swipe right when a photo sparks a story, left to skip.
3. **Tell the story.** Talk or type. If you'd rather not, "Use an example story" fills one in.
4. **Check what the AI picked out.** Place, date and event come back as chips. Remove what's wrong, add what's missing. Nothing is kept until you press Save memory.
5. **Share it and land in the vault.** Then look around: search finds the photo by the chips you kept, Activity shows what the family added, and Albums groups photos by those chips.

It takes about two minutes, on a phone or a computer.

## How it was built

I designed LifeVault in Figma and built it with Claude Code. I don't write code myself. I set the direction, made the design and product calls, tested on my phone and laptop, and asked for changes until each screen worked the way I wanted. Claude Code wrote the code. The full product came together over 217 merged pull requests between June and August 2026.

This demo was put together the same way, through four pull requests. Each one explains the design decisions behind its part of the flow:

1. [Photo deck onboarding: name a face, then one photo at a time](https://github.com/fnyasin/lifevault-onboarding-demo/pull/1)
2. [Story capture with AI-suggested chips the person reviews before saving](https://github.com/fnyasin/lifevault-onboarding-demo/pull/2)
3. [Land in the vault: share step, photo grid, activity and albums](https://github.com/fnyasin/lifevault-onboarding-demo/pull/3)
4. [Demo framing: intro, demo banner, start over, mobile polish](https://github.com/fnyasin/lifevault-onboarding-demo/pull/4)

## How AI works in the product

- **Story to tags.** When someone tells a photo's story, Claude reads it and returns place, date, event and scene tags in a fixed JSON shape. Every result goes through one normalizer, and the person reviews it on the next screen before anything is saved. It never suggests people's names: naming a face has its own approval step.
- **Voice.** Speak records the whole take, and the server turns it into words after Finish, the same way on every device.

## What's in this demo, and what stands in

| Copied from the product | Stand-ins for the demo |
| --- | --- |
| The screens and components: name a face, the swipe deck, story capture with voice recording, the review screen, the share step, the vault grid, activity and album tiles | **Photos:** four sample photos from the Figma mockups |
| The interaction details: card physics, Back behaviour, scroll handling on iPhone, one shared mic stream | **AI suggestions:** a small keyword matcher in the browser ([`src/lib/demo/suggest.ts`](src/lib/demo/suggest.ts)) that returns the same shape through the same normalizer. No API calls, no keys |
| The tag rules: the same normalizer and review step the product uses | **Transcription:** after Finish, a sample transcript stands in, labelled as one. The recording itself is real and plays back |
| | **Saving:** this browser tab only. Nothing leaves your browser |
| | **Invites:** never sent. The share step says so |
| | **Family notes:** a few comments and voice notes from a fictional family, so the activity feed isn't empty |

## Where this came from

This is extracted from my private LifeVault repo (the product is paused). Only the onboarding and vault screens came over. There is no backend, database, payments, sign-in or customer data here. Most code comments are the originals, so you'll see notes like "(Fatimah, on iPhone)" where a decision came from my own testing.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Next.js 16, React 19, Tailwind CSS 4 and TypeScript. It builds to a static site and needs no environment variables.
