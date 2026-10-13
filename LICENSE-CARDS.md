# Card content: licence and credits

Homeparty Cards is a free, non-commercial fan game. It plays with card text that is **not** covered by the game's MIT licence. This file explains where that text comes from, under which licence it is shared, and what that means for anyone who copies or changes it.

## Where the cards come from

| What | By | Licence |
|---|---|---|
| The official card text: the base game, its expansions and themed packs | [Cards Against Humanity LLC](https://www.cardsagainsthumanity.com) | [CC BY-NC-SA 2.0](https://creativecommons.org/licenses/by-nc-sa/2.0/) |
| The compiled card data, `cah-all-compact.json` | [JSON Against Humanity](https://github.com/crhallberg/json-against-humanity) by Chris Hallberg | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| The fan-made packs inside that data (marked `"official": false`) | Their respective fan authors, as collected by JSON Against Humanity | As distributed by JSON Against Humanity: CC BY-NC-SA 4.0 |

- **Cards Against Humanity LLC** releases Cards Against Humanity under the Creative Commons Attribution-NonCommercial-ShareAlike 2.0 licence. The Terms of Use page of their free printable edition says: *"Cards Against Humanity is free to use under the Creative Commons BY-NC-SA 2.0 License."*
- **JSON Against Humanity** compiles the official cards together with fan-made packs from community sources: a shared spreadsheet found through BoardGameGeek, Hangouts Against Humanity, Pretend You're Xyzzy and individual contributors. It distributes the compilation under CC BY-NC-SA 4.0. Section 4(b) of CC BY-NC-SA 2.0 allows an adaptation to be shared under a later version of the licence with the same licence elements.
- **Fan-made packs** belong to the fans who wrote them. This project credits them through JSON Against Humanity and claims nothing in them. They are off by default in the game.

## The card data in this repository

`data/cah-all-compact.json` is JSON Against Humanity's file, **unchanged**: the same bytes, at the commit recorded in `data/cah-all-compact.source.json` together with its download address and SHA-256 checksum. It is redistributed here under the **[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International licence](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode)** (CC BY-NC-SA 4.0).

The licensors provide this material as-is and as-available, with no warranties of any kind (see section 5 of the licence).

## Changes the game makes

The file itself is not edited. While the game runs, it:

- removes duplicate cards whose text differs only in letter case, curly quotes, spacing or a final period;
- leaves out black cards that ask for more than three answers;
- fills the blanks of black cards with the players' answers on screen, adjusting a final period and the capitalisation of the inserted answer.

## What this means if you copy or change the cards

- **Attribution:** keep the credits above (the authors, the titles, the links and the licence) with every copy, including in the app's **About** screen.
- **NonCommercial:** don't sell the game or the cards. Don't put ads, paywalls or paid features in it, and don't charge for any part of it.
- **ShareAlike:** if you change the card content, share your version under CC BY-NC-SA 4.0 (or a later version with the same terms).
- **No extra restrictions:** don't add terms or technical measures that stop others from doing what the licence allows.

## Names and trademarks

"Cards Against Humanity" and its logos are trademarks of Cards Against Humanity LLC. Creative Commons licences don't cover trademarks. This game doesn't use their name or logo as its own: it is called **Homeparty Cards**, and it names Cards Against Humanity only to say where its card text comes from.

**Homeparty Cards is not affiliated with, endorsed by or sponsored by Cards Against Humanity LLC.**

## Your own cards

Cards you write in **Custom decks** or **Custom Fever** are yours. They are kept only on the laptop that runs the game, in files you can export, share or delete. They are never uploaded anywhere.

## For rights holders

If you are Cards Against Humanity LLC, or the author of one of the fan-made packs, and you would like something credited differently, changed or removed, please [open an issue](https://github.com/cotigamihnea/homeparty-cards/issues) on this repository. It will be dealt with promptly.

## Everything else

- **Game source code:** MIT licence, see [`LICENSE`](LICENSE).
- **Font:** [Inter](https://rsms.me/inter/) by Rasmus Andersson, SIL Open Font License 1.1, see `src/client/ui/fonts/Inter-LICENSE.txt`.
- **Sound effects:** by [Kenney](https://kenney.nl), CC0 1.0, see `src/client/host/sounds/LICENSE.txt`.
