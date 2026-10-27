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
| `index.html` | Main page: headings, explanation placeholders, scroll steps, system map |
| `understanding-course-models.html` | Understanding Grading Models: scrolling stories for each model |
| `css/styles.css` | All styling, including brand tokens and chart colours |
| `js/data.js` | The default example course: scores, assessment types, course outcomes |
| `js/store.js` | Editable state: a separate copy of the example per model |
| `js/grading.js` | Pure grade calculations for both models |
| `js/scenes.js` | One layout "frame" per scroll step |
| `js/systemMap.js` | Layout for the side-by-side system map |
| `js/editor.js` | "Edit example" panel for each model |
| `js/chart.js` | Draws a frame in SVG and animates between frames (D3) |
| `js/main.js` | Wires scroll steps, charts, editors and the map to the store |
| `js/pool.js` | Floating score pool frames (scattered, or gathered into circles) |
| `js/understanding.js` | Understanding page: which scene each scroll step shows |

To change the default example, edit `js/data.js` (the Understanding page uses `explainer` there); equations and results update automatically.
To add a step, add an `<article class="step">` in `index.html` and a frame in `js/scenes.js`.
