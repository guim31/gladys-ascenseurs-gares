# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.1.0] - 2026-10-29

### Added

- The street lifts and escalators of the City of Paris (parks, viaducts, Petite
  Ceinture…), remotely monitored in real time: tick districts of Paris in the
  configuration, add them from the Discover tab. One device per district, with
  the same sensors, widget, scene triggers and summary as a station.

### Changed

- Name "Ascenseurs gares SNCF et Paris"; texts of the widget,
  triggers and scene action widened to the districts of Paris (keys unchanged).

## [1.0.0] - 2026-10-29

### Added

- The lifts, escalators and moving walkways of SNCF stations, from the SNCF open
  data portal: type your stations by name (or part of it, or UIC code), add
  them from the Discover tab.
- One device per station: a sensor per equipment (in service / out of order),
  counters of the equipment out of order and in an unknown state, and "All in
  service".
- Widget "Station lifts and escalators": the equipment of a station, out of
  order first, with a setting to hide the ones in service.
- Scene triggers "Lift or escalator out of order" and "back in service",
  filtered by station and kind of equipment.
- Scene action "Summarize lifts and escalators": a sentence ready to send and
  the counts.
- Status action, documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-ascenseurs-gares/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/guim31/gladys-ascenseurs-gares/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/guim31/gladys-ascenseurs-gares/releases/tag/v1.0.0
