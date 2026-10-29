# Gladys lifts and escalators: SNCF stations and Paris

External integration for [Gladys Assistant](https://gladysassistant.com): the
**state of the lifts, escalators and moving walkways of SNCF stations** (in
service, out of order, unknown), read from the SNCF open data portal. About
2,500 pieces of equipment in some 600 stations of SNCF Gares & Connexions.
Also the **street lifts and escalators of the City of Paris** (parks, viaducts,
Petite Ceinture…), remotely monitored, by district. **No account, no key.**

Unofficial: not affiliated with SNCF nor with the City of Paris. Developed without the hardware (there is
none: only an open data feed), checked live on 2026-10-29, not yet on many
Gladys installations: feedback welcome.

The store already has integrations for SNCF **trains** (`gladys-sncf`,
`GladysGareSNCF`) and for the lifts of the **Rennes metro** (`gladys-star-rennes`):
this one covers the lifts and escalators of the SNCF stations and the street
equipment of Paris.

User documentation: [English](docs/en.md) · [français](docs/fr.md) ·
[Deutsch](docs/de.md) · [español](docs/es.md).

## What you get in Gladys

| Kind                 | Content                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Devices              | one per station or district of Paris added: one sensor per equipment, out of order / unknown counters, all in service |
| Dashboard widget     | "Lifts and escalators": the equipment of a station or district, out of order first                                    |
| Scene triggers       | an equipment goes out of order / comes back in service (filters: stations, kind of equipment)                         |
| Scene action         | a one-sentence summary of the followed stations, with the counts                                                      |
| Configuration action | status: stations found for the names typed, last reading, errors                                                      |

Requires Gladys **5.3.0** or later.

## Installation

In Gladys: **Integrations → Install from GitHub**, then
`https://github.com/guim31/gladys-ascenseurs-gares`. Type your stations in the
configuration (`Toulouse Matabiau; Paris Saint-Lazare`) and/or tick districts
of Paris, then add them from the **Discover** tab.

## How it works

- `src/sncf.js` reads the SNCF portal (Opendatasoft Explore v2.1): the station
  list `gares-de-voyageurs` and the stations with equipment, once a day, to
  turn the names typed into station ids; the dataset
  `etat-fonctionnement-elevatique-gare` at every cycle, in **one request**
  filtered on the stations followed (`where=gareid in (…)`), never the whole
  dataset.
- Every 10, 15 or 30 minutes (SNCF recomputes the states every hour). Devices
  are published with `should_poll: false`: the container runs its own timer.
- `src/paris.js` reads the City of Paris dataset
  `ascenseurs-escalators-tele-surveillance-temps-reel` (opendata.paris.fr, about
  35 records, one small request per cycle) and keeps the remotely monitored
  equipment of the districts chosen: one device per district. Each source has
  its own reading time and error: an outage of one never holds the other back.
- An unknown state (`INCONNU`) is never published: the sensor keeps its last
  known value, the "unknown" counter says it.

## Limitations

- Only the stations of SNCF Gares & Connexions that publish their equipment.
- **RATP** publishes no such feed; **Île-de-France Mobilités** publishes the
  state of its lifts (`etat-des-ascenseurs`) but behind an account: not used.
- A state can be an hour old or more, and SNCF says it is not contractual.
- Paris: only the street equipment of the City (about thirty, 25 remotely
  monitored), not the metro; some stay "out of order" for months in the
  dataset. Other cities: none publishes such a feed without an account (checked
  on 2026-10-29).
- Read only.

## Development

```bash
npm install
npm test               # node --test, no network access
npm run lint           # ESLint
npm run format:check   # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store .   # store admission checks
```

See [CLAUDE.md](CLAUDE.md) for the architecture and the conventions. The test
fixtures are real answers of the SNCF portal (`test/fixtures/sncf`, six stations,
from 2 to 76 pieces of equipment) and of the City of Paris (`test/fixtures/paris`,
the whole dataset), captured on 2026-10-29.

## Credits

- Data: SNCF Gares & Connexions, SNCF open data portal, under the ODbL licence;
  City of Paris, opendata.paris.fr, under the ODbL licence.
- Cover: the SNCF logo (registered trademark of SNCF), file
  `Logo SNCF (2011).svg` of the French Wikipedia.
- Built from the official
  [integration template](https://github.com/GladysAssistant/integration-template-js).

## License

[Apache 2.0](LICENSE).
