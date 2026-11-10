# Course Grading Models

Scrolling explainer of the Assessment Type Model and the CO Model.

## Run locally

ES modules need to be served over HTTP (opening `index.html` directly won't work):

```sh
python3 -m http.server 8001
```

Then open http://localhost:8001

## Structure

| File | Responsibility |
| --- | --- |
| `home.html` | Landing page, opened from the logo: the team photo |
| `index.html` | Understanding Grading Models: scrolling stories for each model, drawn as bins |
| `calculations.html` | Calculations with Grading Models: an editable example course, worked through as bins |
| `try-it-yourself.html` | Try It Yourself: drag scores into both models and edit the class structure |
| `course-models-by-college.html` | Course Models used by College: a stream graph of each college's courses per model |
| `understanding-original.html`, `calculations-original.html` | Earlier versions of the first two pages (areas instead of bins), under "Old versions" |
| `css/styles.css` | All styling, including brand tokens and chart colours |
| `js/data.js` | The example courses and presets |
| `js/store.js` | Editable state for an example course, and the rules for editing it |
| `js/grading.js` | Pure grade calculations for both models |
| `js/formula.js` | The calculation written out under each diagram (original Calculations page) |
| `js/scenes.js` | One layout "frame" per scroll step, for both the bin and the original diagrams |
| `js/chart.js` | Draws a frame in SVG and animates between frames (D3) |
| `js/pool.js` | Floating score pool frames (scattered, gathered into circles, or laid in a row) |
| `js/timeline.js` | The editable semester timeline |
| `js/weights.js`, `js/multipliers.js` | Draggable weight bars and CO multipliers |
| `js/sandbox.js`, `js/popover.js` | Dragging scores into the diagrams; small edit panels |
| `js/main.js` | Calculations pages: wires scroll steps, charts and controls to the store |
| `js/understanding.js` | Understanding pages: which scene each scroll step shows |
| `js/try.js` | Try It Yourself page |
| `js/colleges.js` | Course Models used by College: the stream graph, its data and table |

To change the default example, edit `js/data.js` (the Understanding page uses `explainer` there); equations and results update automatically.
To add a step to the Calculations page, add an `<article class="step">` in `calculations.html` and a frame in `js/scenes.js`.
