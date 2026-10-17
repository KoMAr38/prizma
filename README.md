# Prizma

A presentation studio for Windows. It opens and saves PowerPoint files (.pptx), reads PDF and older formats, and keeps everything in its own .prizma format too. Slide show with presenter view, transitions and animations, printing and export to PDF and pictures.

Created and vibe-coded by Marko Veselinović.

The code is public so it can be read, but Prizma is not open source. All rights are reserved; see LICENSE.

## Build

```
npm install
npm start        # build and run
npm run dist     # Windows installer in release/
```

## Tests

`npm test` builds the app and runs the regression suite in `tests/regression`. It needs Linux with an X display (Xvfb), Playwright, LibreOffice, Java and Python with Pillow and numpy; see the top of `tests/regression/suite.sh`.
